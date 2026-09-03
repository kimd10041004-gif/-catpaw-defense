/**
 * 게임 시뮬레이션 — DOM을 전혀 모른다.
 * 렌더러와 UI는 이 객체의 상태를 읽기만 하고, 조작은 메서드로만 한다.
 * 그래서 헤드리스에서도 그대로 돌릴 수 있고 자동 스모크 테스트가 가능하다.
 */

import {
  applyArmor, waveClearBonus, earlyCallBonus, scaleHp, scaleGold, rollCrit, critDamage,
} from './domain/balance.js'
import { buildWave, waveCount } from './domain/waves.js'
import { buildPath, pointAtDistance, isBuildable } from './domain/path.js'
import { selectTarget, selectAllInRange, canTarget, nextTargetMode } from './domain/targeting.js'
import { emptyStatus, applySlow, speedMultiplier, tickStatus } from './domain/status.js'
import { buildCost, upgradeCost, sellValue, totalInvested, maxLevel, canAfford } from './domain/economy.js'
import { catnipForBoss, catnipForWaveClear } from './domain/economy.js'
import { catnipItem, catnipMultiplier, startGoldBonus } from './domain/shop.js'
import {
  getTower, getEnemy, getEffect, getWaveSet, getEnemyAbility, getSpecial, listSpecials,
} from './content/registry.js'

/** 첫 웨이브 전 준비 시간(초) — 처음 배치를 고민할 여유 */
export const FIRST_PREP_SEC = 20
/** 웨이브 사이 준비 시간(초) */
export const PREP_SEC = 12

/** 투사체 종류별 비행 속도 (타일/초) */
const PROJECTILE_SPEED = { pellet: 14, bomb: 8, gaze: 20, dart: 24 }

/** 배치 실패 사유 (UI가 그대로 보여준다) */
export const PLACE_FAIL = {
  NOT_BUILDABLE: '여기엔 못 짓는다',
  OCCUPIED: '이미 고양이가 있다',
  POOR: '골드 부족',
  UNKNOWN: '없는 고양이다',
}

export class Game {
  /**
   * @param {object} o
   * @param {object} o.mapDef 맵 정의
   * @param {object} o.difficulty 난이도 프리셋 { hpMul, goldMul, livesMul }
   * @param {object} o.settings 설정 스냅샷
   * @param {{play:Function}} [o.audio] 효과음 재생기 (없으면 무음)
   */
  constructor({ mapDef, difficulty, settings, audio = null, progress = null, random = Math.random }) {
    this.mapDef = mapDef
    this.progress = progress
    this.random = random
    this.difficulty = difficulty
    this.settings = settings
    this.audio = audio

    this.path = buildPath(mapDef)
    this.waveTable = getWaveSet(mapDef.waveSet)
    this.totalWaves = waveCount(this.waveTable)

    this.gold = mapDef.startGold + startGoldBonus(progress)
    this.catnipMul = catnipMultiplier(progress)
    this.catnipEarned = 0
    this.lives = Math.max(1, Math.round(mapDef.startLives * difficulty.livesMul))
    this.maxLives = this.lives
    this.waveNo = 0            // 마지막으로 시작한 웨이브 (0 = 아직 시작 전)
    this.phase = 'prep'        // 'prep' | 'wave' | 'victory' | 'defeat'
    this.time = 0              // 게임 내부 시각(초)
    this.prepTotal = FIRST_PREP_SEC
    this.prepRemaining = FIRST_PREP_SEC

    this.enemies = []
    this.towers = []
    this.projectiles = []
    this.particles = []
    this.floaters = []
    this.pending = []          // 아직 등장하지 않은 이번 웨이브 스폰
    this.waveStartedAt = 0
    this.shake = 0

    // 필살기 — 등록된 것을 그대로 읽어오므로 새로 추가하면 자동으로 늘어난다
    this.specialReadyAt = {}
    for (const sp of listSpecials()) this.specialReadyAt[sp.id] = 0

    // 연출 상태
    this.flashColor = null
    this.flashStrength = 0
    this.hitStopRemaining = 0
    this.towerBuff = { mul: 1, until: 0 }

    this.stats = {
      killed: 0, leaked: 0, goldEarned: 0, damageDealt: 0,
      bossesKilled: 0, crits: 0, specialsUsed: 0,
    }
    this._listeners = new Map()
    this._towerSeq = 0
  }

  // ------------------------------------------------------------ 이벤트

  /** 일회성 사건 구독 ('waveclear' | 'victory' | 'defeat' | 'leak' | 'sfx') */
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, [])
    this._listeners.get(type).push(fn)
    return this
  }

  emit(type, payload) {
    const list = this._listeners.get(type)
    if (list) for (const fn of list) fn(payload)
  }

  playSfx(name) {
    if (this.audio) this.audio.play(name)
    this.emit('sfx', name)
  }

  // ------------------------------------------------------------ 조작

  /** 다음에 시작할 웨이브 번호 */
  get nextWaveNo() { return this.waveNo + 1 }

  /** 준비 단계에서만 호출 가능. 남은 준비 시간만큼 조기 호출 보너스를 준다. */
  startWave() {
    if (this.phase !== 'prep') return false
    if (this.waveNo >= this.totalWaves) return false

    const no = this.nextWaveNo
    const bonus = earlyCallBonus(this.prepRemaining, this.prepTotal, no)
    if (bonus > 0) {
      this.gold += bonus
      this.stats.goldEarned += bonus
      this.addFloater(this.mapDef.cols / 2, 1, `조기 호출 +${bonus}`, '#ffd166')
    }

    const wave = buildWave(this.waveTable, no, {
      getEnemy,
      mapDifficulty: this.mapDef.difficulty,
      hpMul: this.difficulty.hpMul,
      goldMul: this.difficulty.goldMul,
    })

    this.waveNo = no
    this.phase = 'wave'
    this.waveStartedAt = this.time
    this.pending = wave.spawns.slice()
    this.currentWave = wave
    this.playSfx('wave')
    this.emit('wavestart', wave)
    return true
  }

  /**
   * 타일에 고양이를 배치한다.
   * @returns {{ok:boolean, reason?:string, tower?:object}}
   */
  placeTower(c, r, towerId) {
    const def = getTower(towerId)
    if (!def) return { ok: false, reason: PLACE_FAIL.UNKNOWN }
    if (!isBuildable(this.mapDef, this.path, c, r)) return { ok: false, reason: PLACE_FAIL.NOT_BUILDABLE }
    if (this.towerAt(c, r)) return { ok: false, reason: PLACE_FAIL.OCCUPIED }

    const cost = buildCost(def)
    if (!canAfford(this.gold, cost)) return { ok: false, reason: PLACE_FAIL.POOR }

    this.gold -= cost
    const tower = {
      uid: (this._towerSeq += 1),
      def, c, r,
      x: c + 0.5, y: r + 0.5,
      level: 1,
      cooldown: 0,
      targetMode: 'first',
      angle: -Math.PI / 2,
      recoil: 0,
      born: this.time,
    }
    this.towers.push(tower)
    this.spawnParticle(tower.x, tower.y, { kind: 'poof', color: '#ffffff' })
    this.playSfx('place')
    return { ok: true, tower }
  }

  towerAt(c, r) {
    return this.towers.find((t) => t.c === c && t.r === r) || null
  }

  /** 업그레이드. 골드가 모자라거나 만렙이면 false. */
  upgradeTower(tower) {
    const cost = upgradeCost(tower.def, tower.level)
    if (cost === null || !canAfford(this.gold, cost)) return false
    this.gold -= cost
    tower.level += 1
    this.spawnParticle(tower.x, tower.y, { kind: 'poof', color: '#ffd166' })
    this.playSfx('upgrade')
    return true
  }

  /** 판매. 투자금의 일부를 돌려받는다. */
  sellTower(tower) {
    const i = this.towers.indexOf(tower)
    if (i < 0) return 0
    const refund = sellValue(tower.def, tower.level)
    this.towers.splice(i, 1)
    this.gold += refund
    this.spawnParticle(tower.x, tower.y, { kind: 'poof', color: '#9aa3ad' })
    this.addFloater(tower.x, tower.y, `+${refund}`, '#ffd166')
    this.playSfx('sell')
    return refund
  }

  /** 타겟팅 모드를 다음 것으로 바꾼다. */
  cycleTargetMode(tower) {
    tower.targetMode = nextTargetMode(tower.targetMode)
    return tower.targetMode
  }

  /** UI 표시용 — 현재 레벨 스탯과 다음 레벨 정보를 한 번에 */
  towerInfo(tower) {
    const lv = tower.def.levels[tower.level - 1]
    const next = tower.level < maxLevel(tower.def) ? tower.def.levels[tower.level] : null
    return {
      level: tower.level,
      maxLevel: maxLevel(tower.def),
      stats: lv,
      next,
      upgradeCost: upgradeCost(tower.def, tower.level),
      sellValue: sellValue(tower.def, tower.level),
      invested: totalInvested(tower.def, tower.level),
      dps: Math.round(lv.damage * lv.fireRate * 10) / 10,
    }
  }

  // ------------------------------------------------------------ 시뮬레이션

  /**
   * 고정 타임스텝으로 한 스텝 진행한다 (호출자가 1/60초씩 여러 번 부른다).
   * @param {number} dt 초
   */
  update(dt) {
    if (this.phase === 'victory' || this.phase === 'defeat') return

    // 히트스톱 — 큰 타격 순간 시뮬레이션만 잠깐 멈춘다. 연출은 계속 흐른다.
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - dt)
      this._updateEffectsVisual(dt)
      this._decayScreenFx(dt)
      return
    }

    this.time += dt
    this._decayScreenFx(dt)

    if (this.phase === 'prep') {
      this.prepRemaining -= dt
      if (this.prepRemaining <= 0) {
        this.prepRemaining = 0
        if (this.settings.autoStartWave) this.startWave()
      }
    }

    if (this.phase === 'wave') this._spawnDue()
    this._updateEnemies(dt)
    this._updateTowers(dt)
    this._updateProjectiles(dt)
    this._updateEffectsVisual(dt)

    if (this.phase === 'wave' && this.pending.length === 0 && this.enemies.length === 0) {
      this._finishWave()
    }
  }

  /** 스폰 시각이 된 적을 실제로 등장시킨다 */
  _spawnDue() {
    const elapsed = this.time - this.waveStartedAt
    while (this.pending.length > 0 && this.pending[0].atSec <= elapsed) {
      const s = this.pending.shift()
      this._createEnemy(s.enemyId, { hp: s.hp, gold: s.gold, progress: 0 })
    }
  }

  /**
   * 적 하나를 만들어 전장에 올린다. 웨이브 스폰과 보스의 소환/분열이 모두 이 경로를 쓴다.
   * @param {string} enemyId
   * @param {{hp?:number, gold?:number, progress?:number, hpMul?:number}} opts
   */
  _createEnemy(enemyId, opts = {}) {
    const def = getEnemy(enemyId)
    if (!def) return null

    const wave = Math.max(1, this.waveNo)
    const baseHp = opts.hp !== undefined
      ? opts.hp
      : scaleHp(def.baseHp, wave, this.mapDef.difficulty, this.difficulty.hpMul)
    const maxHp = Math.max(1, Math.round(baseHp * (opts.hpMul || 1)))
    const gold = opts.gold !== undefined
      ? opts.gold
      : scaleGold(def.gold, wave, this.difficulty.goldMul)

    const progress = Math.max(0, opts.progress || 0)
    const p = pointAtDistance(this.path, progress)

    const enemy = {
      def,
      x: p.x, y: p.y, angle: p.angle,
      hp: maxHp, maxHp, gold,
      progress,
      speed: def.speed,
      flying: !!def.flying,
      alive: true,
      status: emptyStatus(),
      hitFlash: 0,
      damaged: false,
      born: this.time,
      auraArmor: 0,
      auraSpeed: 1,
      shield: 0,
      shieldMax: 0,
    }
    this.enemies.push(enemy)

    for (const ab of def.abilities || []) {
      const h = getEnemyAbility(ab.kind)
      if (h && h.onSpawn) h.onSpawn(this._abilityCtx(), ab, enemy)
    }
    return enemy
  }

  _updateEnemies(dt) {
    const len = this.path.lengthTiles
    const ctx = this._abilityCtx()

    // 1) 오라 초기화 — 능력이 매 스텝 새로 칠한다 (def를 직접 고치면 다음 판까지 오염된다)
    for (const e of this.enemies) { e.auraArmor = 0; e.auraSpeed = 1 }

    // 2) 능력 틱 — 다른 적의 오라를 칠할 수 있으므로 반드시 이동보다 먼저 돈다
    for (const e of this.enemies) {
      if (!e.alive) continue
      for (const ab of e.def.abilities || []) {
        const h = getEnemyAbility(ab.kind)
        if (h && h.onTick) h.onTick(ctx, ab, e, dt)
      }
    }

    // 3) 이동
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i]

      if (!e.alive) { this.enemies.splice(i, 1); continue }

      tickStatus(e.status, this.time)
      e.progress += e.speed * speedMultiplier(e.status, this.time) * e.auraSpeed * dt
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt)

      if (e.progress >= len) { this._leak(e); this.enemies.splice(i, 1); continue }

      const p = pointAtDistance(this.path, e.progress)
      e.x = p.x; e.y = p.y; e.angle = p.angle
    }
  }

  /** 적이 끝까지 도달했을 때 */
  _leak(enemy) {
    const cost = enemy.def.livesCost || 1
    this.lives = Math.max(0, this.lives - cost)
    this.stats.leaked += 1
    this.addShake(Math.min(1.2, 0.5 + cost * 0.14))
    this.flash('#ff5c5c', Math.min(0.8, 0.3 + cost * 0.08))
    this.playSfx('leak')
    this.emit('leak', { enemy, cost })
    if (this.lives <= 0) {
      this.phase = 'defeat'
      this.playSfx('defeat')
      this.emit('defeat', this.summary())
    }
  }

  _updateTowers(dt) {
    for (const t of this.towers) {
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6)
      if (t.muzzle > 0) t.muzzle = Math.max(0, t.muzzle - dt)
      t.cooldown -= dt
      if (t.cooldown > 0) continue

      const lv = t.def.levels[t.level - 1]
      const probe = { x: t.x, y: t.y, range: lv.range, targets: t.def.targets }
      const target = selectTarget(probe, this.enemies, t.targetMode)
      if (!target) continue

      t.angle = Math.atan2(target.y - t.y, target.x - t.x)
      t.recoil = 1
      t.cooldown = 1 / (lv.fireRate * this.towerFireRateMul())
      t.muzzle = 0.12
      this._fire(t, lv, target)
    }
  }

  /** 발사 — 효과 핸들러가 소비하지 않으면 투사체를 만든다 */
  _fire(tower, lv, target) {
    const ctx = this._effectCtx(tower, lv)
    let consumed = false

    for (const fx of lv.effects || []) {
      const handler = getEffect(fx.kind)
      if (handler && handler.onFire) {
        const res = handler.onFire(ctx, fx, target)
        if (res && res.consumed) consumed = true
      }
    }
    if (consumed) return

    if (lv.projectile) {
      this.projectiles.push({
        x: tower.x, y: tower.y,
        tx: target.x, ty: target.y,
        target,
        speed: PROJECTILE_SPEED[lv.projectile] || 14,
        damage: lv.damage,
        effects: lv.effects || [],
        kind: lv.projectile,
        tower,
        life: 3,
      })
      this.playSfx(lv.projectile)
    } else {
      // 투사체가 없는 즉시 타격
      ctx.applyDamage(target, lv.damage)
      this._runOnHit(ctx, lv.effects, target)
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i]
      p.life -= dt
      if (p.life <= 0) { this.projectiles.splice(i, 1); continue }

      // 목표가 살아 있으면 계속 따라가고, 죽었으면 마지막 위치로 날아가 그 자리에서 터진다.
      if (p.target && p.target.alive && p.target.hp > 0) {
        p.tx = p.target.x; p.ty = p.target.y
      } else {
        p.target = null
      }

      const dx = p.tx - p.x
      const dy = p.ty - p.y
      const dist = Math.hypot(dx, dy)
      const step = p.speed * dt

      if (dist <= step || dist < 0.02) {
        p.x = p.tx; p.y = p.ty
        this._impact(p)
        this.projectiles.splice(i, 1)
        continue
      }
      p.x += (dx / dist) * step
      p.y += (dy / dist) * step
      p.angle = Math.atan2(dy, dx)
    }
  }

  /** 투사체 명중 처리 */
  _impact(p) {
    const ctx = this._effectCtx(p.tower, null, p.damage)
    if (p.target) {
      ctx.applyDamage(p.target, p.damage)
      this._runOnHit(ctx, p.effects, p.target)
    } else {
      // 목표가 이미 죽었다 — 그 자리에 광역 효과만 남긴다 (느린 폭탄이 헛되지 않게)
      this._runOnHit(ctx, p.effects, { x: p.tx, y: p.ty, ghost: true })
    }
    this.spawnParticle(p.x, p.y, { kind: 'hit', color: p.kind === 'bomb' ? '#ffb35c' : '#ffffff' })
  }

  _runOnHit(ctx, effects, target) {
    for (const fx of effects || []) {
      const handler = getEffect(fx.kind)
      if (handler && handler.onHit) handler.onHit(ctx, fx, target)
    }
  }

  /** 효과 핸들러에 넘기는 도구 상자 (effects.js의 계약) */
  _effectCtx(tower, lv, damageOverride) {
    const level = lv || tower.def.levels[tower.level - 1]
    return {
      tower: { ...tower, range: level.range, targets: tower.def.targets },
      now: this.time,
      damage: damageOverride === undefined ? level.damage : damageOverride,
      enemies: this.enemies,
      applyDamage: (enemy, amount) => this.applyDamage(enemy, amount),
      enemiesInRadius: (x, y, r, opts = {}) => this.enemiesInRadius(x, y, r, opts),
      addSlow: (enemy, factor, sec) => this.addSlow(enemy, factor, sec),
      spawnParticle: (x, y, o) => this.spawnParticle(x, y, o),
      playSfx: (n) => this.playSfx(n),
    }
  }

  /** 적 능력 핸들러(enemyAbilities.js)에 넘기는 도구 상자 */
  _abilityCtx() {
    if (!this._abilityCtxCache) {
      this._abilityCtxCache = {
        enemies: this.enemies,
        spawnMinion: (enemyId, opts) => this.spawnMinion(enemyId, opts),
        enemiesInRadius: (x, y, r, o) => this.enemiesInRadius(x, y, r, o),
        spawnParticle: (x, y, o) => this.spawnParticle(x, y, o),
        addFloater: (x, y, t, c) => this.addFloater(x, y, t, c),
        playSfx: (n) => this.playSfx(n),
        flash: (c, st) => this.flash(c, st),
        shake: (a) => this.addShake(a),
      }
    }
    this._abilityCtxCache.now = this.time
    this._abilityCtxCache.enemies = this.enemies
    return this._abilityCtxCache
  }

  /** 필살기(specials.js)에 넘기는 도구 상자 */
  _specialCtx() {
    return {
      game: this,
      now: this.time,
      waveNo: this.waveNo,
      enemies: this.enemies,
      towers: this.towers,
      mapDef: this.mapDef,
      path: this.path,
      pointAt: (d) => pointAtDistance(this.path, d),
      applyDamage: (e, a) => this.applyDamage(e, a, { canCrit: false }),
      addSlow: (e, f, sec) => this.addSlow(e, f, sec),
      buffTowers: (mul, sec) => this.buffTowers(mul, sec),
      spawnParticle: (x, y, o) => this.spawnParticle(x, y, o),
      // 필살기 안내는 전부 같은 '안내 줄'에 띄운다. 각 필살기가 y를 따로 정하면
      // 상단 토스트·데미지 숫자와 겹쳐서 셋 다 읽을 수 없게 된다.
      addFloater: (x, y, t, c) => {
        this.floaters = this.floaters.filter((f) => !f.banner)   // 안내는 항상 한 줄만
        this.addFloater(this.mapDef.cols / 2, this.mapDef.rows * 0.46, t, c, 1.15)
        this.floaters[this.floaters.length - 1].banner = true
      },
      flash: (c, st) => this.flash(c, st),
      shake: (a) => this.addShake(a),
      hitStop: (sec) => this.hitStop(sec),
      playSfx: (n) => this.playSfx(n),
    }
  }

  // ------------------------------------------------------------ 필살기

  /** 등록된 필살기 목록과 각각의 쿨다운 상태 (HUD가 그대로 그린다) */
  specialStates() {
    return listSpecials().map((def) => {
      const readyAt = this.specialReadyAt[def.id] || 0
      const remaining = Math.max(0, readyAt - this.time)
      return {
        def,
        ready: remaining <= 0,
        remaining,
        ratio: def.cooldown > 0 ? 1 - Math.min(1, remaining / def.cooldown) : 1,
      }
    })
  }

  /**
   * 필살기를 쓴다.
   * @returns {{ok:boolean, reason?:string, result?:object}}
   */
  useSpecial(id) {
    const def = getSpecial(id)
    if (!def) return { ok: false, reason: '없는 필살기다' }
    if (this.phase === 'victory' || this.phase === 'defeat') {
      return { ok: false, reason: '지금은 못 쓴다' }
    }
    const readyAt = this.specialReadyAt[id] || 0
    if (this.time < readyAt) {
      return { ok: false, reason: `${Math.ceil(readyAt - this.time)}초 남음` }
    }

    this.specialReadyAt[id] = this.time + def.cooldown
    this.stats.specialsUsed += 1
    const result = def.run(this._specialCtx())
    this.emit('special', { id, def, result })
    return { ok: true, result }
  }

  /** 모든 필살기의 쿨다운을 즉시 초기화한다 (캣닢 상품) */
  rechargeAllSpecials() {
    for (const sp of listSpecials()) this.specialReadyAt[sp.id] = 0
  }

  /** 일정 시간 동안 모든 타워의 공격 속도를 올린다 */
  buffTowers(mul, seconds) {
    this.towerBuff = { mul, until: this.time + seconds }
  }

  /** 현재 타워 공격 속도 배수 */
  towerFireRateMul() {
    return this.time < this.towerBuff.until ? this.towerBuff.mul : 1
  }

  // ------------------------------------------------------------ 캣닢 상점 (판 안에서)

  /**
   * 캣닢으로 산 소모품의 효과를 적용한다. 캣닢 차감은 호출자(main.js)가 진행도에서 처리한다.
   * @returns {{ok:boolean, reason?:string, message?:string}}
   */
  applyShopItem(itemId) {
    const item = catnipItem(itemId)
    if (!item) return { ok: false, reason: '없는 상품이다' }

    switch (itemId) {
      case 'revive': {
        this.lives += 10
        // 전장을 정리하고 준비 단계로 돌려준다 (이 웨이브는 넘어간 것으로 친다)
        this.enemies.length = 0
        this.pending.length = 0
        this.phase = 'prep'
        this.prepTotal = PREP_SEC
        this.prepRemaining = PREP_SEC
        this.flash('#7fe08a', 0.7)
        this.playSfx('revive')
        return { ok: true, message: '목숨 +10' }
      }
      case 'lifeup':
        this.lives += 5
        this.addFloater(this.mapDef.cols / 2, 2, '목숨 +5', '#ff7a9c')
        return { ok: true, message: '목숨 +5' }
      case 'goldrush':
        this.gold += 400
        this.addFloater(this.mapDef.cols / 2, 2, '골드 +400', '#ffd166')
        this.playSfx('upgrade')
        return { ok: true, message: '골드 +400' }
      case 'recharge':
        this.rechargeAllSpecials()
        this.flash('#ffd166', 0.5)
        this.addFloater(this.mapDef.cols / 2, 2, '필살기 충전', '#ffd166')
        return { ok: true, message: '필살기 전부 충전' }
      default:
        return { ok: false, reason: '아직 없는 상품이다' }
    }
  }

  // ------------------------------------------------------------ 화면 연출

  /** 화면 전체를 잠깐 물들인다 */
  flash(color, strength = 0.5) {
    if (this.settings.reducedMotion) return
    if (strength >= this.flashStrength) {
      this.flashColor = color
      this.flashStrength = Math.min(1, strength)
    }
  }

  /** 큰 타격 순간 시뮬레이션을 아주 잠깐 멈춘다 (타격감의 핵심) */
  hitStop(seconds) {
    if (this.settings.reducedMotion) return
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds)
  }

  /** 화면 흔들림을 더한다. this.shake(숫자)와 이름이 겹치지 않도록 메서드는 addShake다. */
  addShake(amount) {
    if (this.settings.reducedMotion) return
    this.shake = Math.min(1.6, Math.max(this.shake, amount))
  }

  _decayScreenFx(dt) {
    if (this.flashStrength > 0) this.flashStrength = Math.max(0, this.flashStrength - dt * 2.6)
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5)
  }

  /** 보스 능력이 부르는 소환 (게임 규칙상 웨이브 카운트에는 들어가지 않는다) */
  spawnMinion(enemyId, opts = {}) {
    return this._createEnemy(enemyId, opts)
  }

  // ------------------------------------------------------------ 효과 핸들러가 쓰는 도구

  /** 전투 함성 등 오라까지 더한 실제 방어력 */
  armorOf(enemy) {
    return enemy.def.armor + (enemy.auraArmor || 0)
  }

  /**
   * 피해를 준다. 크리티컬 → 방어력 → 보호막 순으로 적용된다.
   * 크리티컬이 방어력보다 먼저 곱해지므로 중장갑 상대로도 한 방이 시원하게 들어간다.
   * @param {object} enemy
   * @param {number} amount
   * @param {{canCrit?:boolean}} [opts]
   */
  applyDamage(enemy, amount, opts = {}) {
    if (!enemy || !enemy.alive || enemy.ghost) return 0

    let raw = amount
    let crit = false
    if (opts.canCrit !== false && rollCrit(this.random)) {
      raw = critDamage(raw)
      crit = true
      this.stats.crits += 1
    }

    let dmg = applyArmor(raw, this.armorOf(enemy))

    // 보호막처럼 피해를 가로채는 능력
    const ctx = this._abilityCtx()
    for (const ab of enemy.def.abilities || []) {
      const h = getEnemyAbility(ab.kind)
      if (h && h.onDamaged) {
        const r = h.onDamaged(ctx, ab, enemy, dmg)
        if (typeof r === 'number') dmg = Math.max(0, r)
      }
    }

    enemy.hp -= dmg
    enemy.hitFlash = crit ? 0.2 : 0.12
    enemy.damaged = true
    this.stats.damageDealt += dmg

    if (this.settings.showDamageNumbers && dmg > 0) {
      // 흩뿌리는 것만으로는 부족했다 — 연사 타워 여럿이 한 적을 때리면
      // '+9' 가 수십 개 겹쳐 글자 덩어리가 된다. 같은 적에게 들어간 피해는
      // 숫자 하나로 합쳐서 누적 표시한다(대미지 총량이 오히려 잘 읽힌다).
      this.addFloater(enemy.x, enemy.y - 0.35, '', '#ffffff', 0.85,
        { key: enemy, value: Math.round(dmg), crit })
    }
    if (crit) {
      this.spawnParticle(enemy.x, enemy.y, { kind: 'crit', color: '#ffd166', count: 6 })
    }

    if (enemy.hp <= 0) this._killEnemy(enemy)
    return dmg
  }

  /** 적이 쓰러졌을 때 — 사망 능력(분열), 보상, 보스 연출 */
  _killEnemy(enemy) {
    enemy.alive = false

    for (const ab of enemy.def.abilities || []) {
      const h = getEnemyAbility(ab.kind)
      if (h && h.onDeath) h.onDeath(this._abilityCtx(), ab, enemy)
    }

    this.gold += enemy.gold
    this.stats.goldEarned += enemy.gold
    this.stats.killed += 1
    // 떼로 잡히면 '+5' 가 수십 개 뜬다. 짧은 시간 안의 골드는 한 숫자로 합친다.
    this.addFloater(enemy.x, enemy.y, '', '#ffd166', 1, { key: 'gold', value: enemy.gold, prefix: '+' })

    if (enemy.def.boss) {
      this.stats.bossesKilled += 1
      const tier = enemy.def.tier || 1
      const catnip = catnipForBoss(tier, this.catnipMul)
      this.catnipEarned += catnip
      this.addFloater(enemy.x, enemy.y - 0.6, `캣닢 +${catnip}`, '#7fe08a')

      // 등급이 높을수록 화면이 크게 반응한다
      this.spawnParticle(enemy.x, enemy.y, { kind: 'bossdown', color: '#ffd166', radius: 2 + tier })
      this.spawnParticle(enemy.x, enemy.y, {
        kind: 'burst', color: enemy.def.palette.body || '#ffffff', count: 24 + tier * 12,
      })
      this.spawnParticle(enemy.x, enemy.y, { kind: 'smoke', color: '#4a4048', count: 10 + tier * 4 })
      this.flash('#ffd166', 0.45 + tier * 0.15)
      this.addShake(0.7 + tier * 0.25)
      this.hitStop(0.08 + tier * 0.04)
      this.playSfx('boss_down')
      this.emit('bossdown', { enemy, tier, catnip })
    } else {
      this.spawnParticle(enemy.x, enemy.y, {
        kind: 'burst', color: enemy.def.palette.body || '#ffffff', count: 8,
      })
      this.playSfx('kill')
    }
  }

  /** 반경 안의 적. opts.exclude 제외, opts.targets로 공중/지상 필터. */
  enemiesInRadius(x, y, r, opts = {}) {
    const probe = { x, y, range: r, targets: opts.targets || 'all' }
    const list = selectAllInRange(probe, this.enemies)
    return opts.exclude ? list.filter((e) => e !== opts.exclude) : list
  }

  /** 적의 저항을 반영해 슬로우를 건다 */
  addSlow(enemy, factor, duration) {
    if (!enemy || !enemy.alive || enemy.ghost) return
    const resist = (enemy.def.resist && enemy.def.resist.slow) || 0
    applySlow(enemy.status, factor, duration, this.time, resist)
  }

  // ------------------------------------------------------------ 연출

  /** 고리(ring) 형태로 퍼지는 연출들 — 개수가 아니라 반경이 커진다 */
  static RING_KINDS = ['shockwave', 'splash', 'shieldup', 'shieldhit', 'summon', 'bossdown', 'wave', 'strike']

  spawnParticle(x, y, o = {}) {
    const kind = o.kind || 'hit'
    const isRing = Game.RING_KINDS.includes(kind)

    // 연출을 줄이는 설정에서는 흩뿌리는 입자만 생략하고 고리는 남긴다(무슨 일이 났는지는 보여야 한다)
    if (this.settings.reducedMotion && !isRing) return

    const count = isRing ? 1 : (o.count || (kind === 'burst' ? 8 : 1))
    const life = isRing ? (kind === 'bossdown' ? 0.55 : 0.3)
      : kind === 'smoke' ? 0.9
        : kind === 'crit' ? 0.35 : 0.45

    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      let sp = 0
      if (kind === 'burst') sp = 0.6 + Math.random() * 1.8
      else if (kind === 'crit') sp = 1.4 + Math.random() * 1.6
      else if (kind === 'smoke') sp = 0.2 + Math.random() * 0.5
      else if (kind === 'heal') sp = 0.3

      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: kind === 'smoke' || kind === 'heal' ? -Math.abs(Math.sin(a) * sp) - 0.3 : Math.sin(a) * sp,
        life, maxLife: life,
        kind,
        color: o.color || '#ffffff',
        radius: o.radius || 0.3,
        gravity: kind === 'smoke' || kind === 'heal' ? -0.4 : 1.2,
      })
    }
  }

  /** 화면에 동시에 띄우는 최대 개수. 넘치면 오래된 것부터 버린다. */
  static MAX_FLOATERS = 28

  /**
   * 떠오르는 글씨를 띄운다.
   * @param {object} [opts] key 를 주면 같은 key 의 글씨에 값을 합친다(데미지 누적 표시).
   *                        value = 더할 수치, crit = 치명타 여부.
   */
  addFloater(x, y, text, color, scale = 1, opts = {}) {
    if (opts.key !== undefined) {
      const prev = this.floaters.find((f) => f.key === opts.key)
      if (prev) {
        prev.value += opts.value || 0
        prev.crit = prev.crit || !!opts.crit
        prev.text = `${prev.prefix}${prev.value}${prev.crit ? '!' : ''}`
        if (!prev.prefix) prev.color = prev.crit ? '#ffd166' : '#ffffff'
        prev.x = x
        prev.y = Math.min(prev.y, y)     // 계속 위로만 — 아래로 튀면 눈이 따라가기 힘들다
        prev.life = prev.maxLife
        prev.scale = Math.min(1.35, prev.scale + 0.04)
        return
      }
      const value = opts.value || 0
      const prefix = opts.prefix || ''
      text = `${prefix}${value}${opts.crit ? '!' : ''}`
      if (!prefix) color = opts.crit ? '#ffd166' : color
      if (opts.crit) scale *= 1.4
      const life = 0.85 * scale
      this.floaters.push({ x, y, text, color, scale, life, maxLife: life,
        key: opts.key, value, crit: !!opts.crit, prefix })
    } else {
      const life = 0.85 * scale
      this.floaters.push({ x, y, text, color, scale, life, maxLife: life, value: 0, crit: false })
    }
    // 후반 대량 웨이브에서 숫자가 화면을 뒤덮는 것을 막는다.
    // 큰 글씨(필살기·보상 안내)는 살리고 작은 데미지 숫자부터 버린다.
    if (this.floaters.length > Game.MAX_FLOATERS) {
      const i = this.floaters.findIndex((f) => (f.scale || 1) <= 1)
      this.floaters.splice(i >= 0 ? i : 0, 1)
    }
  }

  _updateEffectsVisual(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) { this.particles.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += dt * (p.gravity === undefined ? 1.2 : p.gravity)
    }
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i]
      f.life -= dt
      if (f.life <= 0) { this.floaters.splice(i, 1); continue }
      f.y -= dt * 0.7
    }
  }

  // ------------------------------------------------------------ 웨이브 종료

  _finishWave() {
    const bonus = waveClearBonus(this.waveNo)
    this.gold += bonus
    this.stats.goldEarned += bonus
    // 웨이브 클리어 문구는 UI 토스트가 이미 띄운다. 캔버스에도 그리면 겹쳐서 지저분해진다.

    // 5웨이브마다 캣닢을 조금 준다 — 결제 없이도 필살기를 계속 쓸 수 있게
    const catnip = catnipForWaveClear(this.waveNo, this.catnipMul)
    if (catnip > 0) {
      this.catnipEarned += catnip
      this.addFloater(this.mapDef.cols / 2, 4, `캣닢 +${catnip}`, '#7fe08a', 1.2)
    }

    if (this.waveNo >= this.totalWaves) {
      this.phase = 'victory'
      this.playSfx('victory')
      this.emit('victory', this.summary())
      return
    }

    this.phase = 'prep'
    this.prepTotal = PREP_SEC
    this.prepRemaining = PREP_SEC
    this.playSfx('clear')
    this.emit('waveclear', { waveNo: this.waveNo, bonus })
  }

  /** 결과 화면과 진행도 저장에 쓰는 요약 */
  summary() {
    return {
      mapId: this.mapDef.id,
      mapName: this.mapDef.name,
      reachedWave: this.waveNo,
      totalWaves: this.totalWaves,
      cleared: this.phase === 'victory',
      livesLeft: this.lives,
      catnipEarned: this.catnipEarned,
      ...this.stats,
    }
  }

  /** 이번 웨이브 진행률 0~1 (HUD 게이지) */
  waveProgress() {
    if (this.phase !== 'wave' || !this.currentWave) return 0
    const total = this.currentWave.count
    const remaining = this.pending.length + this.enemies.length
    return total === 0 ? 1 : Math.min(1, 1 - remaining / total)
  }
}

export { canTarget }
