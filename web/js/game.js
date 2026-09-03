/**
 * 게임 시뮬레이션 — DOM을 전혀 모른다.
 * 렌더러와 UI는 이 객체의 상태를 읽기만 하고, 조작은 메서드로만 한다.
 * 그래서 헤드리스에서도 그대로 돌릴 수 있고 자동 스모크 테스트가 가능하다.
 */

import { applyArmor, waveClearBonus, earlyCallBonus } from './domain/balance.js'
import { buildWave, waveCount } from './domain/waves.js'
import { buildPath, pointAtDistance, isBuildable } from './domain/path.js'
import { selectTarget, selectAllInRange, canTarget, nextTargetMode } from './domain/targeting.js'
import { emptyStatus, applySlow, speedMultiplier, tickStatus } from './domain/status.js'
import { buildCost, upgradeCost, sellValue, totalInvested, maxLevel, canAfford } from './domain/economy.js'
import { getTower, getEnemy, getEffect, getWaveSet } from './content/registry.js'

/** 첫 웨이브 전 준비 시간(초) — 처음 배치를 고민할 여유 */
export const FIRST_PREP_SEC = 20
/** 웨이브 사이 준비 시간(초) */
export const PREP_SEC = 12

/** 투사체 종류별 비행 속도 (타일/초) */
const PROJECTILE_SPEED = { pellet: 14, bomb: 8, gaze: 20, dart: 24 }

/** 배치 실패 사유 (UI가 그대로 보여준다) */
export const PLACE_FAIL = {
  NOT_BUILDABLE: '여기엔 지을 수 없습니다',
  OCCUPIED: '이미 고양이가 있습니다',
  POOR: '골드가 부족합니다',
  UNKNOWN: '알 수 없는 고양이입니다',
}

export class Game {
  /**
   * @param {object} o
   * @param {object} o.mapDef 맵 정의
   * @param {object} o.difficulty 난이도 프리셋 { hpMul, goldMul, livesMul }
   * @param {object} o.settings 설정 스냅샷
   * @param {{play:Function}} [o.audio] 효과음 재생기 (없으면 무음)
   */
  constructor({ mapDef, difficulty, settings, audio = null }) {
    this.mapDef = mapDef
    this.difficulty = difficulty
    this.settings = settings
    this.audio = audio

    this.path = buildPath(mapDef)
    this.waveTable = getWaveSet(mapDef.waveSet)
    this.totalWaves = waveCount(this.waveTable)

    this.gold = mapDef.startGold
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

    this.stats = { killed: 0, leaked: 0, goldEarned: 0, damageDealt: 0 }
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
    this.time += dt
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5)

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
      const def = getEnemy(s.enemyId)
      const start = pointAtDistance(this.path, 0)
      this.enemies.push({
        def,
        x: start.x, y: start.y, angle: start.angle,
        hp: s.hp, maxHp: s.maxHp, gold: s.gold,
        progress: 0,
        speed: def.speed,
        flying: !!def.flying,
        alive: true,
        status: emptyStatus(),
        hitFlash: 0,
        damaged: false,
        born: this.time,
      })
    }
  }

  _updateEnemies(dt) {
    const len = this.path.lengthTiles
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i]

      if (!e.alive) { this.enemies.splice(i, 1); continue }

      tickStatus(e.status, this.time)
      e.progress += e.speed * speedMultiplier(e.status, this.time) * dt
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
    this.shake = this.settings.reducedMotion ? 0 : Math.min(1, 0.4 + cost * 0.12)
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
      t.cooldown -= dt
      if (t.cooldown > 0) continue

      const lv = t.def.levels[t.level - 1]
      const probe = { x: t.x, y: t.y, range: lv.range, targets: t.def.targets }
      const target = selectTarget(probe, this.enemies, t.targetMode)
      if (!target) continue

      t.angle = Math.atan2(target.y - t.y, target.x - t.x)
      t.recoil = 1
      t.cooldown = 1 / lv.fireRate
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

  // ------------------------------------------------------------ 효과 핸들러가 쓰는 도구

  /** 방어력을 적용해 피해를 주고, 죽으면 골드까지 정산한다 */
  applyDamage(enemy, amount) {
    if (!enemy || !enemy.alive || enemy.ghost) return 0
    const dmg = applyArmor(amount, enemy.def.armor)
    enemy.hp -= dmg
    enemy.hitFlash = 0.12
    enemy.damaged = true
    this.stats.damageDealt += dmg

    if (this.settings.showDamageNumbers) {
      this.addFloater(enemy.x, enemy.y - 0.2, String(Math.round(dmg)), '#ffffff')
    }

    if (enemy.hp <= 0) {
      enemy.alive = false
      this.gold += enemy.gold
      this.stats.goldEarned += enemy.gold
      this.stats.killed += 1
      this.addFloater(enemy.x, enemy.y, `+${enemy.gold}`, '#ffd166')
      this.spawnParticle(enemy.x, enemy.y, {
        kind: 'burst', color: enemy.def.palette.body || '#ffffff',
        count: enemy.def.boss ? 22 : 8,
      })
      this.playSfx(enemy.def.boss ? 'boss_down' : 'kill')
    }
    return dmg
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

  spawnParticle(x, y, o = {}) {
    if (this.settings.reducedMotion && o.kind === 'burst') return
    const count = o.count || (o.kind === 'burst' ? 8 : 1)
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      const sp = o.kind === 'burst' ? 0.6 + Math.random() * 1.6 : 0
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: o.kind === 'shockwave' || o.kind === 'splash' ? 0.28 : 0.45,
        maxLife: o.kind === 'shockwave' || o.kind === 'splash' ? 0.28 : 0.45,
        kind: o.kind || 'hit',
        color: o.color || '#ffffff',
        radius: o.radius || 0.3,
      })
    }
  }

  addFloater(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.85, maxLife: 0.85 })
  }

  _updateEffectsVisual(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) { this.particles.splice(i, 1); continue }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += dt * 1.2
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
    this.addFloater(this.mapDef.cols / 2, 2, `웨이브 클리어 +${bonus}`, '#7fd1c1')

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
