/**
 * 게임 시뮬레이션 — DOM을 전혀 모른다.
 * 렌더러와 UI는 이 객체의 상태를 읽기만 하고, 조작은 메서드로만 한다.
 * 그래서 헤드리스에서도 그대로 돌릴 수 있고 자동 스모크 테스트가 가능하다.
 */

import {
  applyArmor, waveClearBonus, earlyCallBonus, scaleHp, scaleGold, rollCrit, critDamage,
} from './domain/balance.js'
import { buildWave, buildEndlessWave, waveCount } from './domain/waves.js'
import { buildPath, pointAtDistance, isBuildable } from './domain/path.js'
import {
  emptyMods, combineMods, towerModsFor, matchCombo, matchSpecialCombo, specialComboHints,
} from './domain/mods.js'
import { selectTarget, selectAllInRange, canTarget, nextTargetMode } from './domain/targeting.js'
import { emptyStatus, applySlow, speedMultiplier, tickStatus } from './domain/status.js'
import { elementMul } from './domain/elements.js'
import { towerElement, ownsCat } from './domain/expedition.js'
import { buildCost, upgradeCost, sellValue, totalInvested, maxLevel, canAfford, DEFAULT_REFUND_RATE } from './domain/economy.js'
import { catnipForBoss, catnipForWaveClear, CATNIP_ENDLESS_CAP } from './domain/economy.js'
import { catnipItem, catnipMultiplier, startGoldBonus } from './domain/shop.js'
import { growthRank, growthMods } from './domain/growth.js'
import { loadoutOf, specialRank, powerMul, cooldownMul } from './domain/specialGrowth.js'
import {
  MANA_START, MANA_MAX, MANA_PER_WAVE_CLEAR, MANA_PER_CRYSTAL,
  gainMana, spendMana, manaForKill,
} from './domain/mana.js'
import { rollElite, eliteStats, elitePalette } from './domain/elite.js'
import { DIFFICULTIES } from './domain/settings.js'
import { tr } from './i18n/index.js'
import {
  getTower, getEnemy, getEffect, getWaveSet, getEnemyAbility, getSpecial, listSpecials,
  listCombos, getPet, listSpecialCombos, describeAbility,
  getSkin,
} from './content/registry.js'

/** 참새(펫)가 크리스탈을 대신 주워 오기까지 기다리는 시간(초) */
export const PET_AUTO_COLLECT_SEC = 3

/** 첫 웨이브 전 준비 시간(초) — 처음 배치를 고민할 여유 */
export const FIRST_PREP_SEC = 20
/** 웨이브 사이 준비 시간(초) */
export const PREP_SEC = 12

/** 밀크 크리스탈이 떨어지는 간격(초) — 웨이브 중에만 떨어진다 */
export const CRYSTAL_EVERY_SEC = 16
/** 크리스탈이 사라지기까지(초). 놓치면 아깝다고 느낄 만큼만 짧게 */
export const CRYSTAL_LIFE_SEC = 11
/** 화면에 동시에 있을 수 있는 크리스탈 수 */
export const CRYSTAL_MAX = 2

/** 이만큼 쏘지 않으면 고양이가 식빵 자세로 졸기 시작한다(초) */
export const SLEEP_AFTER_SEC = 5

/** 투사체 종류별 비행 속도 (타일/초) */
const PROJECTILE_SPEED = { pellet: 14, bomb: 8, gaze: 20, dart: 24 }

/** 배치 실패 사유 (UI가 그대로 보여준다) */
// i18n-keys:start
export const PLACE_FAIL = {
  NOT_BUILDABLE: '여기엔 못 짓는다',
  OCCUPIED: '이미 고양이가 있다',
  POOR: '골드 부족',
  LOCKED: '아직 함께하지 않는 고양이다',
  UNKNOWN: '없는 고양이다',
  /** 도전 규칙. {n} 은 placeTower 가 maxTowers 로 채운다 */
  LIMIT: '이번 도전은 고양이 {n}마리까지',
  BANNED: '이번 도전에선 못 데려가는 고양이다',
}
// i18n-keys:end
/** 너구리 펫(hook 'refund80')이 장착됐을 때의 판매 환급률 */
export const REFUND80_RATE = 0.8

/**
 * 눈부심(빛 보스)이 사거리를 줄일 수 있는 **바닥**. 원래 사거리의 이 비율 밑으로는
 * 절대 안 내려간다.
 *
 * 왜 하한을 두는가: 이건 적 능력 중 유일하게 플레이어 쪽 판을 만진다. 하한이 없으면
 * 보스 여럿이 겹칠 때 타워가 아무것도 못 쏘는 상태가 되고, 그건 '어렵다'가 아니라
 * '할 수 있는 게 없다'다. 0.6 은 놓은 자리가 여전히 쓸모 있는 선이다 —
 * 사거리 2.0 짜리가 1.2 로, 6.2 짜리(검은냥)가 3.7 로 준다.
 */
export const DAZZLE_FLOOR = 0.6

export class Game {
  /**
   * @param {object} o
   * @param {object} o.mapDef 맵 정의
   * @param {object} [o.difficulty] 난이도 프리셋 { hpMul, goldMul, livesMul }
   * @param {object} [o.settings] 설정 스냅샷
   * @param {{play:Function}} [o.audio] 효과음 재생기 (없으면 무음)
   *
   * difficulty·settings 에 기본값을 둔 이유: 이 클래스는 "헤드리스에서 그대로
   * 돌릴 수 있다"고 선언해 놓고 실제로는 두 개를 빠뜨리면 700줄 뒤 spawnParticle
   * 에서 'Cannot read properties of undefined' 로 죽었다. 밸런스 시뮬레이터를
   * 쓰려면 이 약속이 실제로 지켜져야 한다.
   */
  constructor({
    mapDef, difficulty = DIFFICULTIES.normal, settings = {},
    audio = null, progress = null, random = Math.random,
    waveSet = null, waveLimit = 0, challenge = null, weekly = null, rules = null, lives = 0,
  }) {
    this.mapDef = mapDef
    /** 주간 도전 키('YYYY-Www'). 있으면 시드 난수로 도는 판이고 기록은 progress.weekly 에만 남는다. */
    this.weekly = weekly
    /**
     * 도전 모드 정의(registerChallenge)와 그 규칙. 규칙은 RULE_KEYS 화이트리스트를
     * 지난 것만 온다. 없는 판은 빈 객체 — 아래 분기들이 전부 '없으면 1배' 로 읽는다.
     */
    this.challenge = challenge
    /* 원정 모드는 도전이 아니지만 규칙(속성 상성)은 켜야 한다. 그래서 규칙을 직접 받는 길을
     * 하나 더 연다 — 도전 규칙 위에 얹힌다. 도전인 척하는 가짜 객체를 만들면 기록·주간 쪽
     * 분기가 같이 딸려 와서 더 나쁘다. */
    this.rules = { ...((challenge && challenge.rules) || {}), ...(rules || {}) }
    this.progress = progress
    this.random = random
    this.difficulty = difficulty
    this.settings = settings
    this.audio = audio

    this.path = buildPath(mapDef)
    // 시나리오 챕터는 맵을 재사용하면서 웨이브셋과 길이를 갈아끼운다.
    // 이 두 줄이 챕터별 길이의 전부다 — 승리 판정·진행률·다음 웨이브 버튼이
    // 모두 totalWaves 를 보므로 다른 곳에 새 분기가 생기지 않는다.
    this.waveTable = getWaveSet(waveSet || mapDef.waveSet)
    const full = waveCount(this.waveTable)
    this.totalWaves = waveLimit > 0 ? Math.min(full, waveLimit) : full
    /** 표에 적힌 길이. 무한 모드가 totalWaves 를 Infinity 로 바꿔도 이건 그대로다. */
    this.tableWaves = this.totalWaves
    this.endless = false

    // 장착한 펫. 판이 시작되면 안 바뀐다 — 판 밖에서 고르는 선택이다.
    this.pet = progress && progress.pets ? getPet(progress.pets.equipped) : null
    /** 판 전체에 걸리는 배수 (지금은 펫만). 타워별 배수는 tower.mods 가 따로 든다. */
    this.runMods = combineMods(this.pet && this.pet.mods)

    this.gold = Math.round(
      (mapDef.startGold + startGoldBonus(progress) + (this.pet ? this.pet.startGold || 0 : 0))
      * (this.rules.startGoldMul || 1))
    this.mana = MANA_START          // 밀크 마나 — 필살기 비용
    this.manaMax = MANA_MAX
    this.crystals = []              // 지도에 떨어진 밀크 크리스탈
    this.nextCrystalAt = Infinity   // 웨이브가 시작돼야 떨어지기 시작한다
    // 난이도 배수를 여기서 한 번 곱한다 — 보스·5웨이브 보상이 전부 this.catnipMul 을 지나므로 새 분기가 없다
    this.catnipMul = catnipMultiplier(progress) * (difficulty.catnipMul || 1)
    this.catnipEarned = 0
    /* 시작 목숨을 밖에서 주입할 수 있다 — 원정이 칸 사이로 목숨을 잇는 길이다.
     * 생성 뒤에 `game.lives = n` 으로 대입해도 되지만(소모품이 그렇게 한다) 그러면
     * 시뮬레이터가 `new Game(…)` 만으로 그 판을 재현하지 못한다. 그래서 생성자로 받는다.
     * rules.livesMul 로는 안 된다 — 맵의 startLives 에 곱해지므로 "직전 칸에서 남은 정확한 수"를 못 만든다. */
    this.lives = lives > 0
      ? Math.max(1, Math.floor(lives))
      : Math.max(1, Math.round(mapDef.startLives * difficulty.livesMul * (this.rules.livesMul || 1)))
        + (this.pet ? this.pet.startLives || 0 : 0)
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

    // 필살기 — 쿨다운은 등록된 전부를 들고 있고, 이 판에 쓸 수 있는 것은 loadout()(로드아웃 넷)이다
    this.specialReadyAt = {}
    for (const sp of listSpecials()) this.specialReadyAt[sp.id] = 0

    // 연출 상태
    this.flashColor = null
    this.flashStrength = 0
    this.hitStopRemaining = 0
    this.towerBuff = { mul: 1, until: 0 }
    /** 지금 성립한 조합들 [{ combo, members }]. 배치가 바뀔 때만 다시 계산한다. */
    this.activeCombos = []
    /** 방금 만들어진 조합을 잠깐 빛나게 하는 표시 */
    this.comboFlash = null
    /** 직전에 쓴 필살기 { id, at }. 연계 판정에 쓴다. */
    this.lastSpecial = null
    /** 이번 시전에 걸린 연계 배수. _specialCtx 가 피해에 곱한다. */
    this._comboMul = 1
    /** 이번 시전의 세기 트리 배수(specialGrowth). _specialCtx 가 피해와 지속시간에 곱한다. 단계 0 은 정확히 1. */
    this._specialPower = 1
    /** 이번 시전의 속성(`def.element`). _specialCtx 의 applyDamage 가 그대로 넘긴다. 무속성이면 null. */
    this._specialElement = null

    this.stats = {
      killed: 0, leaked: 0, goldEarned: 0, damageDealt: 0,
      bossesKilled: 0, crits: 0, specialsUsed: 0,
      // 시나리오 목표 판정용. 판 끝에 summary()가 실어 보낸다.
      towersBuilt: 0,                 // 판매하고 다시 지어도 누적된다 (지은 횟수)
      towersSold: 0,                  // '한 마리도 팔지 않기'
      upgradesBought: 0,              // '업그레이드 없이 막기'
      towerIdsUsed: new Set(),        // '검은냥만' / '삼색냥 없이' 같은 목표
      bossIdsKilled: new Set(),       // '쥐왕 처치' 같은 목표
      combosMade: new Set(),          // 이번 판에서 만들어 본 조합 (도감 해금)
      bossKillCounts: {},             // { 보스id: 수 } — 평생 기록(가장 많이 잡은 보스)
      revives: 0,                     // 이어하기 횟수
    }
    this._listeners = new Map()
    this._towerSeq = 0

    /** 다음 웨이브의 구성 (준비 단계에만, 아니면 null). HUD 미리보기가 읽는다. */
    this.nextWave = this._peekNextWave()
    /** 지금 전장에 있는 보스 수. 보스 테마 전환용 (매 프레임 배열을 훑지 않으려고). */
    this.bossOnField = 0
    /** 보스 등장 배너 { name, tier, text, born, until } — render 가 그린다 */
    this.bossAnnounce = null
  }

  /** startWave 와 미리보기가 같은 배율로 웨이브를 만들도록 한곳에 둔다 */
  _waveOpts() {
    return {
      getEnemy,
      mapHpMul: this.mapDef.hpMul,
      hpMul: this.difficulty.hpMul * (this.rules.hpMul || 1),
      goldMul: this.difficulty.goldMul * (this.rules.goldMul || 1),
      tableWaves: this.tableWaves,   // 무한 모드가 '표 밖'을 어디서부터 셀지
      transform: (this.rules.replace || this.rules.bossCountMul)
        ? { replace: this.rules.replace, bossCountMul: this.rules.bossCountMul }
        : null,
    }
  }

  /**
   * 다음 웨이브를 미리 계산한다 (준비 단계 미리보기).
   * buildWave 는 순수라 startWave 가 다시 불러도 같은 웨이브가 나온다 — 조기 호출
   * 보너스·엘리트 굴림은 시작 시점의 일이라 여기서는 하지 않는다.
   */
  _peekNextWave() {
    if (this.waveNo >= this.totalWaves) return null
    return this._buildWaveNo(this.nextWaveNo)
  }

  /** 표 안이면 buildWave, 표 밖(무한)이면 buildEndlessWave — 같은 결과 형식 */
  _buildWaveNo(no) {
    return no > this.tableWaves
      ? buildEndlessWave(this.waveTable, no, this._waveOpts())
      : buildWave(this.waveTable, no, this._waveOpts())
  }

  /**
   * 승리 뒤 '계속 버티기'. 표 밖 웨이브는 마지막 5줄을 돌려 쓰며 점점 세진다(waves.js).
   * 캣닢은 여기서부터 CATNIP_ENDLESS_CAP 까지만 — 무한이 캣닢 농사가 되면 안 된다.
   * bestWave·클리어 기록은 표 길이(tableWaves) 기준이라 무한이 건드리지 않는다.
   */
  continueEndless() {
    if (this.phase !== 'victory') return false
    if (this.challenge || this.weekly) return false   // 도전·주간 판은 표까지다 — 기록도 표 기준이라 무한이 없다
    this.endless = true
    this.endlessCatnipStart = this.catnipEarned
    this.totalWaves = Infinity
    this.phase = 'prep'
    this.prepTotal = PREP_SEC
    this.prepRemaining = PREP_SEC
    this.nextWave = this._peekNextWave()
    this.emit('endless', { from: this.waveNo })
    return true
  }

  /** 캣닢 지급. 무한 모드에서는 시작 뒤 상한까지만. 실제 지급액을 돌려준다. */
  _grantCatnip(n) {
    let amount = Math.max(0, Math.round(n))
    if (this.endless) {
      const room = CATNIP_ENDLESS_CAP - (this.catnipEarned - (this.endlessCatnipStart || 0))
      amount = Math.max(0, Math.min(amount, room))
    }
    this.catnipEarned += amount
    return amount
  }

  // ------------------------------------------------------------ 이벤트

  /** 일회성 사건 구독 ('waveclear' | 'victory' | 'defeat' | 'leak' | 'sfx' | 'special' | 'combo') */
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
      this.addFloater(this.mapDef.cols / 2, 1, tr('조기 호출 +{bonus}', { bonus: bonus }), '#ffd166')
    }

    const wave = this._buildWaveNo(no)

    this.waveNo = no
    this.phase = 'wave'
    this.nextWave = null
    this.waveStartedAt = this.time
    this.nextCrystalAt = this.time + CRYSTAL_EVERY_SEC * 0.6
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
    if (!def) return { ok: false, reason: tr(PLACE_FAIL.UNKNOWN) }
    // 상점에서 자물쇠로 가리는 것만으로는 부족하다 — 여기서 막지 않으면
    // 배치 경로가 여럿(탭·드래그·스냅)이라 어디선가 새어 나간다.
    if (!this.isTowerUnlocked(def.id)) return { ok: false, reason: tr(PLACE_FAIL.LOCKED) }
    // 도전 규칙. 상점이 가리는 것과 별개로 여기서 막아야 드래그·스냅 경로가 새지 않는다.
    if (Array.isArray(this.rules.bannedTowers) && this.rules.bannedTowers.includes(def.id)) {
      return { ok: false, reason: tr(PLACE_FAIL.BANNED), code: 'BANNED' }
    }
    if (Number.isFinite(this.rules.maxTowers) && this.towers.length >= this.rules.maxTowers) {
      return { ok: false, reason: tr(PLACE_FAIL.LIMIT, { n: this.rules.maxTowers }), code: 'LIMIT' }
    }
    if (!isBuildable(this.mapDef, this.path, c, r)) return { ok: false, reason: tr(PLACE_FAIL.NOT_BUILDABLE) }
    if (this.towerAt(c, r)) return { ok: false, reason: tr(PLACE_FAIL.OCCUPIED) }

    const cost = buildCost(def)
    if (!canAfford(this.gold, cost)) return { ok: false, reason: tr(PLACE_FAIL.POOR) }

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
      // 조합·buff 고양이가 얹어 주는 배수. 타워 집합이 바뀔 때만 다시 계산한다.
      mods: emptyMods(),
      // 장착 스킨은 놓는 순간 굳는다 — 판 밖(도감)에서 고르는 선택이라 판 중에 안 바뀐다. 겉모습만이다.
      skin: getSkin(this.progress && this.progress.skins && this.progress.skins.equipped
        ? this.progress.skins.equipped[def.id] : null),
      // 속성도 놓는 순간 굳는다(같은 이유). 기본은 타고난 속성이고, 룬을 끼웠으면 그것이 이긴다.
      element: towerElement(this.progress, def),
    }
    this.towers.push(tower)
    this.addFloater(tower.x, tower.y, `-${cost}`, '#ffd166')
    this.stats.towersBuilt += 1
    this.stats.towerIdsUsed.add(def.id)
    this.recomputeTowerMods()
    this.spawnParticle(tower.x, tower.y, { kind: 'poof', color: '#ffffff' })
    this.playSfx('place')
    return { ok: true, tower }
  }

  /**
   * 이 고양이를 쓸 수 있는가. 시나리오 2·4·6장 보상으로 풀린다.
   * 진행도가 없으면(테스트·데모) 전부 열린 것으로 본다 — 잠금이 게임을 막으면 안 된다.
   */
  /**
   * 적의 방어 속성. **칸의 지배 속성(`rules.enemyElement`)이 잡몹의 타고난 속성을 덮어쓴다.
   * 보스는 예외 — 제 속성 그대로 싸운다.**
   *
   * 왜 잡몹을 덮어쓰나: 잡몹 아홉이 흙 3 · 어둠 2 로 쏠려 있어서 "얼음 잡몹만 나오는 웨이브"는
   * 지금 로스터로 만들 수가 없다(얼음·번개·빛 잡몹은 각각 한 종뿐). 칸마다 지배 속성을 다르게 두는 것이
   * 원정의 전부라서, 덮어쓰기가 유일하게 되는 길이다. 숨기지는 않는다 — 들어가기 전 화면과 HUD 에 적는다.
   *
   * **왜 보스만 빼나 (J-6):** 보스 여덟이 여섯 속성을 다 덮게 됐다(J-5 가 번개·얼음·빛을 채웠다).
   * 잡몹에는 없던 선택지가 보스에는 생긴 것이다. 덮어쓰기를 보스까지 밀면 그 여덟이 전부
   * 같은 색이 되어 J-5 가 한 일이 원정에서만 지워진다.
   *
   * 그리고 이게 이 모드의 구멍을 막는다. 한 속성으로 도배한 덱은 고리 구조상 약점이 딱 하나 생기는데,
   * 그 약점이 **쉬운 칸**에 떨어지면 그냥 통과한다 — 재 보니 도배 얼음이 잿불 길을 83% 완주했다
   * (도배 흙은 0%다. 같은 '도배'인데 어느 칸이 약점이냐로 갈린다).
   * 보스가 제 속성을 지키면 칸마다 답해야 할 속성이 둘이 되어 그 구멍이 25%까지 닫힌다.
   *
   * **왜 규칙 플래그로 좁혔나:** 예외를 무조건 걸었더니 **칸이 고르지 않은 보스**까지 제 속성이 됐고,
   * 그 보스가 죄다 흙·어둠이라 서릿길에서는 도배 덱에 공짜 축을 하나 더 준 꼴이 됐다
   * (도배 최고 25% → 50%). 그래서 **칸이 보스를 고른 경우에만** 건다 — 고른 보스는 설계고,
   * 안 고른 보스는 웨이브셋이 우연히 들고 있던 것이다.
   */
  _enemyElement(enemy) {
    const own = (enemy.def && enemy.def.element) || null
    if (this.rules.bossOwnElement && enemy.def && enemy.def.boss) return own
    return this.rules.enemyElement || own
  }

  /* 해금 판정은 `domain/expedition.ownsCat` 하나다 — 덱(원정)·도감(훈련)·여기가 같은 답을 내야
   * "덱에 넣었는데 못 놓는 고양이" 가 안 생긴다. 전에는 같은 규칙이 세 곳에 따로 적혀 있었다. */
  isTowerUnlocked(id) {
    return ownsCat(this.progress, id)
  }

  towerAt(c, r) {
    return this.towers.find((t) => t.c === c && t.r === r) || null
  }

  /**
   * 타워마다 붙는 배수를 다시 계산한다.
   *
   * ▶ 매 프레임 부르지 않는다. 배치·업그레이드·판매로 타워 집합이 바뀔 때만 부른다.
   *   9마리 × 9마리를 훑어도 한 판에 수십 번뿐이라 비용이 안 보인다.
   *   매 프레임 돌리면 타워 20개일 때 초당 2만 번이 넘는다.
   */
  recomputeTowerMods() {
    // 조합 판정은 타워마다가 아니라 한 번만 돈다. 성립한 것을 모아 두면
    // 렌더가 화면에 표시할 수도 있다.
    const before = new Set(this.activeCombos.map((m) => m.combo.id))
    this.activeCombos = listCombos()
      .map((combo) => ({ combo, members: matchCombo(combo, this.towers) }))
      .filter((m) => m.members)
    // 훈련(영구 단계)은 판 밖에서 산 것이라 progress 에서 읽어 곱한다. combineMods 가 MODS_CAP 으로
    // 자르므로 펫·조합·버프와 같은 상한을 나눈다.
    for (const t of this.towers) {
      t.mods = combineMods(towerModsFor(t, this.towers, this.activeCombos), growthMods(growthRank(this.progress, t.def.id)))
    }

    // 새로 만들어진 조합만 알린다. 안 알려주면 아무도 못 찾는다.
    for (const m of this.activeCombos) {
      if (before.has(m.combo.id)) continue
      this.stats.combosMade.add(m.combo.id)
      const cx = m.members.reduce((a, t) => a + t.x, 0) / m.members.length
      const cy = m.members.reduce((a, t) => a + t.y, 0) / m.members.length
      this.addFloater(cx, cy, m.combo.name, '#ffd166', 1.1)
      this.spawnParticle(cx, cy, { kind: 'burst', color: '#ffd166', count: 10 })
      this.playSfx('upgrade')
      this.comboFlash = { members: m.members, until: this.time + 1.4 }
      // 만든 즉시 알린다. 판이 끝날 때만 기록하면 중간에 나간 사람은 발견을 잃는다.
      this.emit('combo', { combo: m.combo, members: m.members })
    }
  }

  /**
   * 오래 쏘지 않은 고양이인가 (그러면 렌더가 자는 모습으로 그린다).
   * '사거리에 적이 있나'를 매 프레임 다시 계산하지 않는다 — 타워 20개 × 적 80마리면
   * 초당 10만 번 헛계산이 된다. 마지막 발사 시각만 보면 충분하다.
   */
  isTowerIdle(tower) {
    const last = tower.lastFired === undefined ? tower.born : tower.lastFired
    return this.time - last > SLEEP_AFTER_SEC
  }

  /** 업그레이드. 골드가 모자라거나 만렙이면 false. */
  upgradeTower(tower) {
    const cost = upgradeCost(tower.def, tower.level)
    if (cost === null || !canAfford(this.gold, cost)) return false
    this.gold -= cost
    tower.level += 1
    this.addFloater(tower.x, tower.y, `-${cost}`, '#ffd166')
    this.stats.upgradesBought += 1
    this.recomputeTowerMods()
    this.spawnParticle(tower.x, tower.y, { kind: 'poof', color: '#ffd166' })
    this.playSfx('upgrade')
    return true
  }

  /** 판매 환급률. 너구리 펫이면 0.8, 아니면 경제 기본값(0.6). */
  refundRate() {
    return this.pet && this.pet.hook === 'refund80' ? REFUND80_RATE : DEFAULT_REFUND_RATE
  }

  /** 팔 수 있나 — 도전 규칙(판매 금지)이 막을 수 있다. UI 가 버튼을 잠그고, sellTower 도 한 번 더 본다. */
  canSellTower() {
    if (this.rules.noSell) return { ok: false, reason: tr('이번 도전은 판매 금지다') }
    return { ok: true }
  }

  /** 판매. 투자금의 일부를 돌려받는다. */
  sellTower(tower) {
    const i = this.towers.indexOf(tower)
    if (i < 0) return 0
    if (!this.canSellTower().ok) return 0
    const refund = sellValue(tower.def, tower.level, this.refundRate())
    this.towers.splice(i, 1)
    this.gold += refund
    this.stats.towersSold += 1
    this.recomputeTowerMods()
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

  /**
   * 판 도중에 진행도가 바뀌었을 때 (결제·챕터 보상) 파생값을 다시 계산한다.
   *
   * progress 를 그냥 대입하면 안 된다 — catnipMul 은 생성자에서 한 번 계산되고
   * 얼어붙는다. 판 도중에 프리미엄 팩을 사도 '캣닢 2배'가 그 판 끝까지 안 걸렸다.
   * applyPurchase 는 새 객체를 돌려주므로 대입만으로는 절대 갱신되지 않는다.
   */
  setProgress(progress) {
    this.progress = progress
    // 생성자와 같은 식이어야 한다 — 난이도 배수를 빠뜨리면 판 도중 프리미엄을 산 사람만 길냥이 보너스를 잃는다
    this.catnipMul = catnipMultiplier(progress) * (this.difficulty.catnipMul || 1)
    // 도감에서 훈련하면 진행 중인 판의 타워도 곧바로 세져야 한다
    if (this.towers.length) this.recomputeTowerMods()
  }

  /**
   * UI 표시용 — 현재 레벨 스탯과 다음 레벨 정보를 한 번에.
   *
   * stats 는 레벨 표 원본이다. 그런데 전투는 그 숫자를 그대로 쓰지 않는다 —
   * 옆에 선 턱시도냥, 성립한 조합, 황금 발바닥이 전부 배수로 얹힌다.
   * 원본만 보여주면 턱시도냥의 존재 이유가 화면에 안 나타난다(실측: 치즈냥 옆에
   * 턱시도냥을 두면 실제 초당피해가 19.2 → 23.2 인데 패널은 19.2 그대로였다).
   * 그래서 eff 를 따로 준다. stats/next 는 '레벨을 올리면 얼마가 되나'를 비교하는
   * 용도로 남겨 둔다 — 둘을 합치면 어느 쪽 비교인지 알 수 없게 된다.
   */
  towerInfo(tower) {
    const lv = tower.def.levels[tower.level - 1]
    const next = tower.level < maxLevel(tower.def) ? tower.def.levels[tower.level] : null
    const m = tower.mods
    // 황금 발바닥은 타워가 아니라 판 전체에 걸린다. 10초 뒤 저절로 풀린다.
    const frMul = this.towerFireRateMul() * m.fireRateMul
    const eff = {
      damage: lv.damage * m.damageMul,
      range: this.rangeOf(tower),
      fireRate: lv.fireRate * frMul,
    }
    eff.dps = Math.round(eff.damage * eff.fireRate * 10) / 10
    return {
      level: tower.level,
      maxLevel: maxLevel(tower.def),
      stats: lv,
      next,
      eff,
      /** 배수가 하나라도 걸려 있나 — UI 가 강조 표시를 켤지 정한다 */
      boosted: m.damageMul !== 1 || m.fireRateMul !== 1 || m.rangeAdd !== 0
        || this.towerFireRateMul() !== 1,
      upgradeCost: upgradeCost(tower.def, tower.level),
      sellValue: sellValue(tower.def, tower.level, this.refundRate()),
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
    this._updateCrystals(dt)
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
      // 엘리트는 웨이브 스폰에서만 굴린다. 보스의 소환·분열까지 왕관을 쓰면 화면이 난장판이 된다.
      const elite = rollElite(getEnemy(s.enemyId), this.waveNo, this.random)
      this._createEnemy(s.enemyId, { hp: s.hp, gold: s.gold, progress: 0, elite, fromWave: true })
    }
  }

  /**
   * 적 하나를 만들어 전장에 올린다. 웨이브 스폰과 보스의 소환/분열이 모두 이 경로를 쓴다.
   * @param {string} enemyId
   * @param {{hp?:number, gold?:number, progress?:number, hpMul?:number, noSplit?:boolean}} opts
   */
  _createEnemy(enemyId, opts = {}) {
    const def = getEnemy(enemyId)
    if (!def) return null

    const wave = Math.max(1, this.waveNo)
    /* rules.hpMul 을 빠뜨리고 있었다 — 웨이브 스폰(위 buildWave)에는 걸리는데 **보스의 소환·분열에는
     * 안 걸렸다.** 그래서 도전·원정·(K 부터) 챕터가 hpMul 을 올려도 분열체와 소환수만 원래 체력이었다.
     * 맵의 hpMul 과 프리셋은 여기 있었으니 티가 안 났고, K 에서 유리 온실을 조율하다 같은 배수를
     * 맵에 두었을 때와 rules 에 두었을 때 결과가 갈리는 것을 보고 찾았다(첫 실점 3웨이브 대 8웨이브). */
    const baseHp = opts.hp !== undefined
      ? opts.hp
      : scaleHp(def.baseHp, wave, this.mapDef.hpMul, this.difficulty.hpMul * (this.rules.hpMul || 1))
    const maxHp = Math.max(1, Math.round(baseHp * (opts.hpMul || 1)))
    const gold = opts.gold !== undefined
      ? opts.gold
      : scaleGold(def.gold, wave, this.difficulty.goldMul)

    const progress = Math.max(0, opts.progress || 0)
    const p = pointAtDistance(this.path, progress)

    // 엘리트 — 정의를 복사하지 않고 이 개체의 수치만 올린다
    const isElite = !!(opts.elite && !def.boss)
    let hp = maxHp
    let finalGold = gold
    let eliteArmor = 0
    let palette = def.palette
    if (isElite) {
      const st = eliteStats({ hp: maxHp, armor: def.armor, gold })
      hp = st.hp
      finalGold = st.gold
      eliteArmor = st.armor - def.armor
      palette = elitePalette(def.palette)
    }

    const enemy = {
      def,
      elite: isElite,
      eliteArmor,
      palette,
      x: p.x, y: p.y, angle: p.angle,
      hp, maxHp: hp, gold: finalGold,
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
      dots: [],                       // 지속 피해 스택 { dps, until, element }
      sunder: 0,                      // 벗겨진 장갑 (양수 = 장갑이 그만큼 준다)
      sunderUntil: 0,
      markMul: 1,                     // 표식 — 받는 피해 배수
      markUntil: 0,
      // 분열로 태어난 개체라는 표시. split 이 이 표시를 보고 다시 쪼개지 않는다
      // (자기 자신으로 분열하는 적을 넣으면 4의 거듭제곱으로 늘어난다).
      noSplit: !!opts.noSplit,
    }
    this.enemies.push(enemy)

    for (const ab of def.abilities || []) {
      const h = getEnemyAbility(ab.kind)
      if (h && h.onSpawn) h.onSpawn(this._abilityCtx(), ab, enemy)
    }
    if (def.boss) {
      this.bossOnField += 1
      if (opts.fromWave) this._announceBoss(enemy)
    }
    return enemy
  }

  /**
   * 보스 등장 연출. 전에는 보스가 죽을 때만 화면이 반응했고 등장은 무음이었다 —
   * 처음 하는 사람은 왜 갑자기 체력바가 떴는지 몰랐다. 웨이브 스폰에서만 부른다
   * (소환·분열로 생기는 개체는 등장이 아니다).
   */
  _announceBoss(enemy) {
    const def = enemy.def
    const tier = def.tier || 1
    const text = (def.abilities || [])
      .map((ab) => describeAbility(ab)).filter(Boolean).map((d) => d.name).join(' · ')
    this.bossAnnounce = { name: def.name, tier, text, born: this.time, until: this.time + 1.8 }
    this.flash('#ff4d6d', 0.3 + tier * 0.1)
    this.addShake(0.45 + tier * 0.15)
    this.hitStop(0.05)
    this.playSfx('boss_in')
    this.emit('bossspawn', { enemy, tier })
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

    // 3) 지속 피해 — 스택이 있는 적만 돈다. 상한이 있어(최대 3) 비용이 고정이다.
    for (const e of this.enemies) {
      if (!e.alive || e.dots.length === 0) continue
      if (!this.rules.elemental) {
        // 상성이 꺼진 판(자유·시나리오)은 예전 그대로 — 스택을 합쳐 한 번만 때린다.
        // 아래 묶음 경로와 결과가 같지만, '같을 것'에 기대지 않고 길을 아예 나눠 둔다.
        let dps = 0
        for (let i = e.dots.length - 1; i >= 0; i -= 1) {
          if (this.time >= e.dots[i].until) { e.dots.splice(i, 1); continue }
          dps += e.dots[i].dps
        }
        if (dps > 0) this.applyDamage(e, dps * dt, { canCrit: false, ignoreArmor: true })
        continue
      }
      // 속성이 다른 스택은 따로 때린다 — 합쳐 때리면 상성이 섞여 한쪽 배수가 사라진다.
      // 스택 상한이 3이라 묶음도 최대 3개다.
      const byElement = new Map()
      for (let i = e.dots.length - 1; i >= 0; i -= 1) {
        if (this.time >= e.dots[i].until) { e.dots.splice(i, 1); continue }
        const k = e.dots[i].element || ''
        byElement.set(k, (byElement.get(k) || 0) + e.dots[i].dps)
      }
      for (const [element, dps] of byElement) {
        if (dps > 0) {
          this.applyDamage(e, dps * dt, { canCrit: false, ignoreArmor: true, element: element || null })
        }
      }
    }

    // 4) 이동
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i]

      if (!e.alive) { this.enemies.splice(i, 1); continue }

      tickStatus(e.status, this.time)
      e.progress += e.speed * speedMultiplier(e.status, this.time) * e.auraSpeed * (this.rules.speedMul || 1) * dt
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
    if (enemy.def.boss) this.bossOnField = Math.max(0, this.bossOnField - 1)
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
      const probe = { x: t.x, y: t.y, range: this.rangeOf(t), targets: t.def.targets }
      const target = selectTarget(probe, this.enemies, t.targetMode)
      if (!target) continue

      t.angle = Math.atan2(target.y - t.y, target.x - t.x)
      t.lastFired = this.time
      t.recoil = 1
      t.cooldown = 1 / (lv.fireRate * this.towerFireRateMul() * t.mods.fireRateMul)
      t.muzzle = 0.12
      this._fire(t, lv, target)
    }
  }

  /** 발사 — 효과 핸들러가 소비하지 않으면 투사체를 만든다 */
  _fire(tower, lv, target) {
    // 배수를 여기서 한 번 곱해 효과 ctx 와 투사체 양쪽에 같은 값을 흘린다.
    // 두 군데서 따로 곱하면 splash 만 강화되는 식으로 어긋난다.
    const dmg = lv.damage * tower.mods.damageMul
    const ctx = this._effectCtx(tower, lv, dmg)
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
        damage: dmg,
        effects: lv.effects || [],
        kind: lv.projectile,
        tower,
        life: 3,
      })
      this.playSfx(lv.projectile)
    } else {
      // 투사체가 없는 즉시 타격
      ctx.applyDamage(target, dmg)
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
      tower: { ...tower, range: this.rangeOf(tower), targets: tower.def.targets },
      now: this.time,
      damage: damageOverride === undefined ? level.damage : damageOverride,
      enemies: this.enemies,
      // 타워의 속성을 여기서 한 번 얹는다 — 효과 7종·직격·투사체가 전부 이 ctx 를 지나므로
      // 효과 하나하나가 속성을 알 필요가 없다.
      applyDamage: (enemy, amount) => this.applyDamage(enemy, amount, { element: tower.element }),
      // 장갑을 무시하는 피해. 지금은 dot 만 쓴다.
      applyTrueDamage: (enemy, amount) =>
        this.applyDamage(enemy, amount, { canCrit: false, ignoreArmor: true, element: tower.element }),
      addDot: (enemy, dps, duration, maxStacks) =>
        this.addDot(enemy, dps, duration, maxStacks, tower.element),
      enemiesInRadius: (x, y, r, opts = {}) => this.enemiesInRadius(x, y, r, opts),
      addSlow: (enemy, factor, sec) => this.addSlow(enemy, factor, sec),
      sunder: (enemy, amount, max, sec) => this.sunder(enemy, amount, max, sec),
      mark: (enemy, mul, sec) => this.mark(enemy, mul, sec),
      knockback: (enemy, tiles, bossMul) => this.knockback(enemy, tiles, bossMul),
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
        // 빛 보스의 눈부심만 쓰는 둘. 여기까지가 '적 능력이 플레이어 쪽을 만지는' 유일한 통로다 —
        // 넓히려면 이 주석부터 다시 읽어라. 타워를 직접 넘기지 않는 이유는 dazzle() 안에
        // 하한과 겹침 규칙이 들어 있어서다.
        towersInRadius: (x, y, r) => this.towersInRadius(x, y, r),
        dazzle: (t, mul, sec) => this.dazzle(t, mul, sec),
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
      // 연계 배수와 세기 트리 배수를 여기서 한 번에 곱한다. 덕분에 필살기 정의는 연계도 성장도 몰라도 된다.
      // 세기는 피해와 **지속시간**에 곱한다 — 공속 버프의 배수(2.2)에는 안 곱한다(3단계에 ×2.86 이 되면 폭주다).
      /* 속성은 **필살기 정의에서** 온다 (O) — `useSpecial` 이 시전마다 `_specialElement` 를 세운다.
       * `applyDamage` 는 `rules.elemental` 이 켜진 판에서만 곱하므로 자유 모드·시나리오는 한 톨도 안 움직인다.
       * 무속성 필살기(츄르 폭격)는 null 이라 배수가 안 걸린다 — 일부러 남긴 선택지다(specials.js 머리말). */
      applyDamage: (e, a) => this.applyDamage(e, a * this._comboMul * this._specialPower,
        { canCrit: false, element: this._specialElement }),
      addSlow: (e, f, sec) => this.addSlow(e, f, sec * this._specialPower),
      buffTowers: (mul, sec) => this.buffTowers(mul, sec * this._specialPower),
      // 장갑 벗기기 — 기존 sunder(먼치킨·해충 능력이 쓰는 것)를 그대로 씌운다. amount 가 곧 상한이라 겹쳐도 그 이상 안 벗긴다.
      sunder: (e, amount, sec) => this.sunder(e, amount, amount, sec * this._specialPower),
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

  /**
   * 이 판에 들고 들어온 필살기 id — 로드아웃 순서가 곧 HUD 버튼 순서다.
   * 진행도가 없거나(시뮬레이터·검사) 로드아웃이 비어 있으면 기본 로드아웃(등록 순 앞 넷 = 예전의 그 넷).
   * 매번 진행도에서 읽으므로 도감에서 바꾸면(setProgress) 다음 프레임에 바로 반영된다.
   */
  loadout() {
    return loadoutOf(this.progress, listSpecials())
  }

  /** 실제 쿨다운 — 정의값 × 쿨다운 트리 배수(단계 0 은 ×1) */
  specialCooldown(def) {
    return def.cooldown * cooldownMul(specialRank(this.progress, def.id, 'cooldown'))
  }

  /** 세기 트리 배수 — _specialCtx 의 래퍼가 피해·지속시간에 곱한다(단계 0 은 ×1) */
  specialPower(id) {
    return powerMul(specialRank(this.progress, id, 'power'))
  }

  /** 로드아웃의 필살기 목록과 각각의 쿨다운 상태 (HUD가 그대로 그린다) */
  specialStates() {
    return this.loadout().map((id) => {
      const def = getSpecial(id)
      const cooldown = this.specialCooldown(def)
      const readyAt = this.specialReadyAt[def.id] || 0
      const remaining = Math.max(0, readyAt - this.time)
      const cooled = remaining <= 0
      const cost = def.mana || 0
      const afford = this.mana >= cost
      return {
        def,
        cost,
        cooldown,                    // 성장 배수를 곱한 실제 쿨다운
        short: Math.max(0, cost - this.mana),   // 얼마가 모자란가
        cooled,                      // 쿨다운이 끝났는가
        afford,                      // 마나가 충분한가
        ready: cooled && afford,     // 지금 누를 수 있는가
        remaining,
        ratio: cooldown > 0 ? 1 - Math.min(1, remaining / cooldown) : 1,
        manaRatio: cost > 0 ? Math.min(1, this.mana / cost) : 1,
      }
    })
  }

  /**
   * 필살기를 쓴다.
   * @returns {{ok:boolean, reason?:string, result?:object}}
   */
  useSpecial(id) {
    const def = getSpecial(id)
    if (!def) return { ok: false, reason: tr('없는 필살기다') }
    // 로드아웃 밖의 필살기는 이 판에 없는 것이다 — HUD 에 버튼도 없다. 시뮬레이터가 전부 시도해도 여기서 걸린다.
    if (!this.loadout().includes(id)) return { ok: false, reason: tr('들고 오지 않은 필살기다'), code: 'NOT_LOADED' }
    if (this.rules.noSpecials) return { ok: false, reason: tr('이번 도전은 필살기 없이 버틴다'), code: 'NO_SPECIALS' }
    if (this.phase === 'victory' || this.phase === 'defeat') {
      return { ok: false, reason: tr('지금은 못 쓴다') }
    }
    const readyAt = this.specialReadyAt[id] || 0
    if (this.time < readyAt) {
      return { ok: false, reason: tr('{readyAt}초 남음', { readyAt: Math.ceil(readyAt - this.time) }) }
    }

    // 밀크 마나를 먼저 낸다. 모자라면 쿨다운도 돌지 않는다.
    const paid = spendMana(this.mana, def.mana || 0)
    if (!paid.ok) return { ok: false, reason: tr('마나 {short} 부족', { short: paid.short }) }
    this.mana = paid.mana

    this.specialReadyAt[id] = this.time + this.specialCooldown(def)
    this.stats.specialsUsed += 1

    // 연계 — 직전 필살기와 이어지면 이름이 붙고 보너스가 걸린다
    const link = matchSpecialCombo(listSpecialCombos(), this.lastSpecial, id, this.time)
    this._comboMul = link && link.bonus.damageMul ? link.bonus.damageMul : 1
    this._specialPower = this.specialPower(id)
    this._specialElement = def.element || null
    this.lastSpecial = { id, at: this.time }

    // 필살기가 죽인 적은 마나를 주지 않는다.
    // 안 그러면 필살기가 자기 비용을 스스로 벌어버린다 — 적이 많은 후반에는
    // 한 번 쓰면 마나가 오히려 가득 차서 사실상 공짜가 된다(스모크가 잡아냈다).
    this._suppressKillMana = true
    let result
    try {
      result = def.run(this._specialCtx())
    } finally {
      this._suppressKillMana = false
      this._comboMul = 1
      this._specialPower = 1
      this._specialElement = null
    }

    if (link) {
      if (link.bonus.manaRefund) this.addMana(link.bonus.manaRefund)
      this.addFloater(this.mapDef.cols / 2, this.mapDef.rows * 0.36,
        tr('연계!  {linkName}', { linkName: link.name }), '#ffd166', 1.25)
      this.flash('#ffd166', 0.5)
      this.addShake(0.45)
      this.playSfx('goldenpaw')
      this.stats.combosMade.add(link.id)
      this.emit('combo', { combo: link, members: [] })
    }
    this.emit('special', { id, def, result })
    return { ok: true, result }
  }

  /**
   * 지금 쓰면 연계가 되는 필살기 id 들. HUD 가 그 버튼을 빛나게 한다.
   * 안 알려주면 아무도 못 찾는다 — 조합과 같은 원칙이다.
   */
  specialComboHints() {
    // 로드아웃 밖의 짝은 이 판에 버튼이 없다 — 안 보이는 버튼을 빛내라고 할 수는 없다
    const loaded = new Set(this.loadout())
    return specialComboHints(listSpecialCombos(), this.lastSpecial, this.time).filter((id) => loaded.has(id))
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
    if (!item) return { ok: false, reason: tr('없는 상품이다') }

    switch (itemId) {
      case 'revive': {
        this.lives += 10
        this.stats.revives += 1
        // 전장을 정리하고 준비 단계로 돌려준다 (이 웨이브는 넘어간 것으로 친다)
        this.enemies.length = 0
        this.pending.length = 0
        this.bossOnField = 0
        this.phase = 'prep'
        this.prepTotal = PREP_SEC
        this.prepRemaining = PREP_SEC
        this.nextWave = this._peekNextWave()
        this.flash('#7fe08a', 0.7)
        this.playSfx('revive')
        return { ok: true, message: tr('목숨 +10') }
      }
      case 'lifeup':
        this.lives += 5
        this.addFloater(this.mapDef.cols / 2, 2, tr('목숨 +5'), '#ff7a9c')
        return { ok: true, message: tr('목숨 +5') }
      case 'goldrush':
        this.gold += 400
        this.addFloater(this.mapDef.cols / 2, 2, tr('골드 +400'), '#ffd166')
        this.playSfx('upgrade')
        return { ok: true, message: tr('골드 +400') }
      case 'recharge':
        this.rechargeAllSpecials()
        this.mana = this.manaMax
        this.flash('#bfe6ff', 0.5)
        this.addFloater(this.mapDef.cols / 2, 2, tr('마나 가득'), '#bfe6ff')
        return { ok: true, message: tr('마나 가득 · 쿨다운 초기화') }
      default:
        return { ok: false, reason: tr('아직 없는 상품이다') }
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
    if (this.bossAnnounce && this.time >= this.bossAnnounce.until) this.bossAnnounce = null
  }

  // ------------------------------------------------------------ 밀크 마나

  /**
   * 마나를 더한다. 넘치는 분은 버려지고, 눈에 띄게 찰 때만 글씨를 띄운다
   * (킬마다 '+1' 이 뜨면 화면이 도배된다).
   * @returns {number} 실제로 찬 양
   */
  addMana(amount, opts = {}) {
    const before = this.mana
    const res = gainMana(this.mana, amount * this.runMods.manaMul * (this.rules.manaMul || 1))
    this.mana = res.mana
    if (res.gained > 0 && opts.show) {
      this.addFloater(
        opts.x === undefined ? this.mapDef.cols / 2 : opts.x,
        opts.y === undefined ? 2 : opts.y,
        tr('마나 +{gained}', { gained: res.gained }), '#bfe6ff', opts.scale || 1,
      )
    }
    // 가득 찬 순간 한 번만 알려준다 — 더 모아도 버려진다는 신호
    if (before < this.manaMax && this.mana >= this.manaMax) {
      this.spawnParticle(this.mapDef.cols / 2, 2, { kind: 'shieldup', color: '#bfe6ff', radius: 1.4 })
    }
    return res.gained
  }

  // ------------------------------------------------------------ 밀크 크리스탈

  /** 웨이브 중에만, 지을 수 있는 빈 칸 위에 떨어뜨린다 */
  _updateCrystals(dt) {
    // 참새(펫) — 떨어진 지 조금 지난 크리스탈을 알아서 주워 온다.
    // 손으로 집는 것보다 늦게 주는 이유: 즉시 먹으면 탭할 기회 자체가 없어져
    // '주워 먹는 재미'가 사라진다. 바빠서 못 집은 것만 챙겨 주는 게 목적이다.
    const auto = this.pet && this.pet.hook === 'autoCollect'
    for (let i = this.crystals.length - 1; i >= 0; i -= 1) {
      const c = this.crystals[i]
      c.life -= dt
      if (c.life <= 0) { this.crystals.splice(i, 1); continue }
      if (auto && c.maxLife - c.life >= PET_AUTO_COLLECT_SEC) {
        this.crystals.splice(i, 1)
        this.addMana(c.amount, { show: true, x: c.x, y: c.y, scale: 1.05 })
        this.spawnParticle(c.x, c.y, { kind: 'burst', color: '#bfe6ff', count: 8 })
        this.playSfx('crystal_get')
      }
    }

    if (this.phase !== 'wave') return
    if (this.time < this.nextCrystalAt) return
    this.nextCrystalAt = this.time + CRYSTAL_EVERY_SEC
    if (this.crystals.length >= CRYSTAL_MAX) return
    if (this.mana >= this.manaMax) return   // 가득 차 있으면 떨어뜨려도 낭비다

    const spot = this._randomFreeTile()
    if (!spot) return
    this.crystals.push({
      x: spot.c + 0.5, y: spot.r + 0.5,
      life: CRYSTAL_LIFE_SEC, maxLife: CRYSTAL_LIFE_SEC,
      amount: MANA_PER_CRYSTAL,
    })
    this.spawnParticle(spot.c + 0.5, spot.r + 0.5, { kind: 'shieldup', color: '#bfe6ff', radius: 1 })
    this.playSfx('crystal')
  }

  /** 경로도 타워도 없는 칸 하나 (없으면 null) */
  _randomFreeTile() {
    const free = []
    for (let r = 0; r < this.mapDef.rows; r += 1) {
      for (let c = 0; c < this.mapDef.cols; c += 1) {
        if (!isBuildable(this.mapDef, this.path, c, r)) continue
        if (this.towerAt(c, r)) continue
        if (this.crystals.some((k) => k.x === c + 0.5 && k.y === r + 0.5)) continue
        free.push({ c, r })
      }
    }
    if (free.length === 0) return null
    return free[Math.floor(this.random() * free.length)]
  }

  /**
   * 크리스탈을 줍는다. 손가락이 정확하지 않으므로 반경 안이면 잡아준다.
   * @returns {{ok:boolean, gained?:number}}
   */
  collectCrystalNear(x, y, radius = 0.9) {
    let best = -1
    let bestDist = radius
    for (let i = 0; i < this.crystals.length; i += 1) {
      const d = Math.hypot(this.crystals[i].x - x, this.crystals[i].y - y)
      if (d < bestDist) { best = i; bestDist = d }
    }
    if (best < 0) return { ok: false }
    const [c] = this.crystals.splice(best, 1)
    const gained = this.addMana(c.amount, { show: true, x: c.x, y: c.y, scale: 1.1 })
    this.spawnParticle(c.x, c.y, { kind: 'burst', color: '#bfe6ff', count: 14 })
    this.playSfx('crystal_get')
    return { ok: true, gained }
  }

  /** 보스 능력이 부르는 소환 (게임 규칙상 웨이브 카운트에는 들어가지 않는다) */
  spawnMinion(enemyId, opts = {}) {
    return this._createEnemy(enemyId, opts)
  }

  // ------------------------------------------------------------ 효과 핸들러가 쓰는 도구

  /**
   * 지속 피해를 한 스택 건다. 스택이 꽉 차 있으면 가장 빨리 끝나는 것을 밀어낸다.
   * 상한이 없으면 속사 타워가 스택을 무한정 쌓아 사실상 즉사기가 된다.
   */
  addDot(enemy, dps, duration, maxStacks = 3, element = null) {
    if (!enemy || !enemy.alive || !(dps > 0) || !(duration > 0)) return
    const cap = Math.max(1, Math.floor(maxStacks))
    const until = this.time + duration
    if (enemy.dots.length >= cap) {
      let soonest = 0
      for (let i = 1; i < enemy.dots.length; i += 1) {
        if (enemy.dots[i].until < enemy.dots[soonest].until) soonest = i
      }
      // 더 짧은 것만 밀어낸다 — 더 긴 스택을 짧은 걸로 덮어쓰면 오히려 약해진다
      if (enemy.dots[soonest].until >= until) return
      enemy.dots.splice(soonest, 1)
    }
    enemy.dots.push({ dps, until, element })
  }

  /**
   * 눈부심까지 반영한 실제 사거리.
   *
   * 전에는 세 곳(조준 · 타워 패널 표시 · 효과 ctx)이 각자 `lv.range + mods.rangeAdd` 를
   * 계산했다. 일시 효과가 생기면서 한 곳만 고치면 **보이는 고리와 실제 사거리가 어긋난다** —
   * 그래서 한 함수로 모았다.
   *
   * 타워의 mods 에는 쓰지 않는다: mods 는 배치·판매 때만 다시 계산되므로(_recomputeMods)
   * 일시 효과를 넣으면 다음 재계산까지 남거나 지워진다. 적 쪽 markUntil 과 같은 결이다.
   */
  rangeOf(tower) {
    const lv = tower.def.levels[tower.level - 1]
    const base = lv.range + (tower.mods ? tower.mods.rangeAdd : 0)
    if (!(this.time < (tower.dazzleUntil || 0))) return base
    return base * Math.max(DAZZLE_FLOOR, tower.dazzleMul || 1)
  }

  /**
   * 사거리를 잠깐 줄인다(빛 보스의 눈부심). 겹치면 더 센 쪽이 남는다 —
   * 곱하면 보스 둘이 겹칠 때 사거리가 0 에 수렴한다.
   */
  dazzle(tower, mul = 0.7, sec = 2.5) {
    if (!tower) return
    const cur = this.time < (tower.dazzleUntil || 0) ? (tower.dazzleMul || 1) : 1
    tower.dazzleMul = Math.max(DAZZLE_FLOOR, Math.min(cur, mul))
    tower.dazzleUntil = this.time + sec
  }

  /** 전투 함성 등 오라까지 더한 실제 방어력 */
  armorOf(enemy) {
    const base = enemy.def.armor + (enemy.auraArmor || 0) + (enemy.eliteArmor || 0) + (this.rules.armorAdd || 0)
    // 벗겨진 장갑은 시간이 지나면 도로 붙는다. 0 밑으로는 안 내려간다 —
    // 음수 장갑은 applyArmor 에서 피해를 늘려 버려서 '벗기기'가 '증폭'이 된다.
    const off = this.time < enemy.sunderUntil ? (enemy.sunder || 0) : 0
    return Math.max(0, base - off)
  }

  /**
   * 장갑을 벗긴다 — **판 전체의 화력을 올리는 자리다.**
   * 장갑이 뺄셈이라 저피해 속사가 중장갑 앞에서 0 이 되는 게 이 게임의 구조인데,
   * dot·truestrike 가 그걸 혼자 피해 간다면 이건 옆의 모두를 위해 벗긴다.
   */
  sunder(enemy, amount = 1, max = 3, sec = 3) {
    if (!enemy || !enemy.alive) return
    const cur = this.time < enemy.sunderUntil ? (enemy.sunder || 0) : 0
    enemy.sunder = Math.min(max, cur + amount)
    enemy.sunderUntil = this.time + sec
  }

  /** 표식 — 찍힌 적이 받는 피해가 커진다. 겹치지 않고 더 센 쪽이 남는다(중첩하면 곱해져 터진다). */
  mark(enemy, mul = 1.25, sec = 4) {
    if (!enemy || !enemy.alive) return
    const cur = this.time < enemy.markUntil ? (enemy.markMul || 1) : 1
    enemy.markMul = Math.max(cur, mul)
    enemy.markUntil = this.time + sec
  }

  /**
   * 길 뒤로 밀어낸다. 경로 진행이 스칼라 하나라서 한 줄로 성립한다 — 그 모델의 유일한 선물이다.
   * 보스는 덜 밀린다: 그러지 않으면 보스가 문 앞에서 영영 제자리걸음을 한다.
   */
  knockback(enemy, tiles = 0.6, bossMul = 0.35) {
    if (!enemy || !enemy.alive) return
    const push = tiles * (enemy.def.boss ? bossMul : 1)
    enemy.progress = Math.max(0, enemy.progress - push)
  }

  /**
   * 피해를 준다. 크리티컬 → **상성** → 방어력 → 표식 → 보호막 순으로 적용된다.
   * 크리티컬과 상성이 방어력보다 먼저 곱해지므로 중장갑 상대로도 한 방이 시원하게 들어간다.
   * @param {object} enemy
   * @param {number} amount
   * @param {{canCrit?:boolean, ignoreArmor?:boolean, element?:string|null}} [opts]
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

    /* 상성 — **방어력을 빼기 전에** 곱한다 (L-2).
     * 원래는 뺀 뒤에 곱했다 — "×1.5 가 적마다 다른 값이 돼 화면에서 안 읽힌다"는 이유였다. 그런데 그 순서는
     * 저피해 속사에게 상성을 사실상 지웠다: 치즈냥(1발 12)이 장갑 12 상대로 바닥 1 로 눌린 뒤 ×1.5 를 받으면
     * 이득이 +0.5/발이다. 사람이 "상성이 있는데 왜 안 세지나"를 느끼는 자리라 앞으로 옮겼다 — 이제 ×1.5 는
     * 장갑을 **뚫는** 값이고 ×0.7 은 더 자주 바닥에 닿는다. 화면 숫자가 적마다 달라지는 것은 감수한다.
     * rules.elemental 이 꺼진 판에서는 늘 1.0 이라 자유 모드·시나리오는 한 톨도 안 움직인다(domain/elements.js 머리말). */
    if (this.rules.elemental && opts.element) {
      raw *= elementMul(opts.element, this._enemyElement(enemy))
    }

    // 장갑 무시(지속 피해). 장갑은 뺄셈이라 저피해 속사가 중장갑 앞에서 무력해지는데,
    // dot 은 그 규칙 밖에 두어 "긁어서 아프게 하는" 다른 답이 되게 한다.
    let dmg = opts.ignoreArmor ? Math.max(0, raw) : applyArmor(raw, this.armorOf(enemy))

    // 표식은 상성과 달리 모드를 안 가린다 — 찍은 고양이가 아니라 **적의 상태**라서다. 장갑 뒤에 곱한다.
    if (this.time < enemy.markUntil) dmg *= (enemy.markMul || 1)

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

    // 펫(까치)이 처치 골드를 올린다. 웨이브 클리어 보너스는 그대로 둔다 —
    // 그쪽까지 올리면 '잡지 않고 버티기'가 더 이득이 되어 게임이 뒤집힌다.
    const earned = Math.round(enemy.gold * this.runMods.goldMul)
    this.gold += earned
    this.stats.goldEarned += earned
    this.stats.killed += 1
    // 밀크 마나 — 잡을수록 다음 필살기가 가까워진다.
    // 단, 필살기로 잡은 적은 세지 않는다 (useSpecial 의 주석 참고).
    if (!this._suppressKillMana) {
      this.addMana(manaForKill(enemy.def), { show: !!enemy.def.boss, x: enemy.x, y: enemy.y - 0.9 })
    }
    // 떼로 잡히면 '+5' 가 수십 개 뜬다. 짧은 시간 안의 골드는 한 숫자로 합친다.
    this.addFloater(enemy.x, enemy.y, '', '#ffd166', 1, { key: 'gold', value: enemy.gold, prefix: '+' })

    if (enemy.def.boss) {
      this.bossOnField = Math.max(0, this.bossOnField - 1)
      this.stats.bossesKilled += 1
      this.stats.bossIdsKilled.add(enemy.def.id)
      this.stats.bossKillCounts[enemy.def.id] = (this.stats.bossKillCounts[enemy.def.id] || 0) + 1
      const tier = enemy.def.tier || 1
      const catnip = this._grantCatnip(catnipForBoss(tier, this.catnipMul))
      if (catnip > 0) this.addFloater(enemy.x, enemy.y - 0.6, tr('캣닢 +{catnip}', { catnip: catnip }), '#7fe08a')

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

  /**
   * 반경 안의 타워. 적 능력이 플레이어 쪽을 만지는 유일한 통로다(빛 보스의 눈부심).
   * selectAllInRange 는 적 전용(비행 판정이 있다)이라 여기서는 거리만 본다.
   */
  towersInRadius(x, y, r) {
    const rr = r * r
    return this.towers.filter((t) => {
      const dx = t.x - x, dy = t.y - y
      return dx * dx + dy * dy <= rr
    })
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
   * 파티클 상한. 플로터와 같은 이유로 둔다.
   *
   * 성능 때문이 아니다 — 실측하니 마왕전에서도 동시에 살아 있는 파티클은 10개 미만이라
   * 프레임에 영향이 없었다(느려지는 원인은 바닥 그리기였다). 이건 보험이다:
   * 지금은 수명(최대 0.9초)으로만 사라져서 상한이 아예 없고, 한 번에 수백 개를
   * 뿜는 연출을 나중에 넣으면 그때는 상한이 필요해진다.
   */
  static MAX_PARTICLES = 240

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
    // 넘치면 오래된 것부터 버린다 (플로터와 같은 방식)
    if (this.particles.length > Game.MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - Game.MAX_PARTICLES)
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
    this.addMana(MANA_PER_WAVE_CLEAR)

    const catnip = this._grantCatnip(catnipForWaveClear(this.waveNo, this.catnipMul))
    if (catnip > 0) this.addFloater(this.mapDef.cols / 2, 4, tr('캣닢 +{catnip}', { catnip: catnip }), '#7fe08a', 1.2)

    if (this.waveNo >= this.totalWaves) {
      this.phase = 'victory'
      this.playSfx('victory')
      this.emit('victory', this.summary())
      return
    }

    this.phase = 'prep'
    this.prepTotal = PREP_SEC
    this.prepRemaining = PREP_SEC
    this.nextWave = this._peekNextWave()
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
      // stats 밖에 있는 값은 스프레드로 안 따라온다. 여기서 직접 실어야 목표가 볼 수 있다.
      goldLeft: this.gold,
      elapsed: this.time,
      tableWaves: this.tableWaves,
      endless: this.endless,
      endlessWaves: Math.max(0, this.waveNo - this.tableWaves),
      challengeId: this.challenge ? this.challenge.id : null,
      weeklyKey: this.weekly || null,
      ...this.stats,
      // Set 은 JSON.stringify 에서 {} 가 된다. 저장·전달 경로가 여럿이라
      // 여기서 배열로 굳혀 내보낸다.
      towerIdsUsed: [...this.stats.towerIdsUsed],
      bossIdsKilled: [...this.stats.bossIdsKilled],
      combosMade: [...this.stats.combosMade],
      bossKillCounts: { ...this.stats.bossKillCounts },
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
