/**
 * 골드 경제 — 건설비/업그레이드비/판매 환급 계산.
 * 레벨은 1-based다: level 1 = 갓 지은 상태, def.levels[level - 1]이 현재 스탯.
 */

export class EconomyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EconomyError'
  }
}

/** 판매 시 되돌려받는 비율 (투자한 총액 기준) */
export const DEFAULT_REFUND_RATE = 0.6

/** 타워 정의의 levels 배열을 꺼내며 형식을 검증한다. */
function requireLevels(def) {
  if (!def || !Array.isArray(def.levels) || def.levels.length === 0) {
    throw new EconomyError(`타워 정의에 levels 배열이 없습니다: ${def && def.id}`)
  }
  return def.levels
}

/** 해당 타워의 최대 레벨 (1-based) */
export function maxLevel(def) {
  return requireLevels(def).length
}

/** 1레벨 건설 비용 */
export function buildCost(def) {
  return requireLevels(def)[0].cost
}

/**
 * 현재 level에서 다음 레벨로 올리는 비용.
 * 이미 만렙이면 null을 반환한다 (예외가 아니라 null — UI가 버튼을 숨기는 근거).
 * @param {object} def 타워 정의
 * @param {number} level 현재 레벨 (1-based)
 * @returns {number|null}
 */
export function upgradeCost(def, level) {
  const levels = requireLevels(def)
  if (!Number.isInteger(level) || level < 1 || level > levels.length) {
    throw new EconomyError(`level은 1 이상 ${levels.length} 이하의 정수여야 합니다: ${String(level)}`)
  }
  if (level === levels.length) return null
  return levels[level].cost
}

/**
 * 현재 레벨까지 이 타워에 넣은 총 골드 (건설비 + 여태 업그레이드비).
 * @param {object} def 타워 정의
 * @param {number} level 현재 레벨 (1-based)
 */
export function totalInvested(def, level) {
  const levels = requireLevels(def)
  if (!Number.isInteger(level) || level < 1 || level > levels.length) {
    throw new EconomyError(`level은 1 이상 ${levels.length} 이하의 정수여야 합니다: ${String(level)}`)
  }
  let sum = 0
  for (let i = 0; i < level; i += 1) sum += levels[i].cost
  return sum
}

/**
 * 판매 시 돌려받는 골드 (내림 처리 — 판매 반복으로 골드가 늘어나지 않게).
 * @param {object} def 타워 정의
 * @param {number} level 현재 레벨 (1-based)
 * @param {number} rate 환급 비율
 */
export function sellValue(def, level, rate = DEFAULT_REFUND_RATE) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new EconomyError(`rate는 0~1 사이여야 합니다: ${String(rate)}`)
  }
  return Math.floor(totalInvested(def, level) * rate)
}

/** 보유 골드로 살 수 있는지 */
export function canAfford(gold, cost) {
  if (cost === null || cost === undefined) return false
  return gold >= cost
}

// ─────────────────────────────────────────────────────────────────────────────
// 캣닢 — 게임을 하면 조금씩 쌓이고, 상점에서 살 수도 있는 프리미엄 재화.
// 플레이만으로도 모을 수 있어야 하므로 지급 규칙을 여기 한곳에 모아둔다.
// ─────────────────────────────────────────────────────────────────────────────

/** 보스 한 마리 처치당 (등급이 높을수록 더 준다) */
export const CATNIP_PER_BOSS_TIER = 2
/** 5웨이브마다 */
export const CATNIP_PER_5_WAVES = 2
/**
 * 맵을 끝까지 클리어하면.
 * 한 판을 다 깨면 이어하기 한 번 값(50)은 넘도록 잡았다 —
 * 결제 없이도 계속 굴러가야 한다는 설계 원칙의 실제 근거이고, 테스트가 이걸 지킨다.
 */
export const CATNIP_MAP_CLEAR = 20
/**
 * 무한 모드에서 더 벌 수 있는 캣닢의 상한 (맵 클리어 한 번 값). 무한은 '얼마나 버티나'지
 * 캣닢 농사가 아니다 — 상한이 없으면 첫 맵 무한만 도는 게 최적이 된다.
 */
export const CATNIP_ENDLESS_CAP = 20

/**
 * 보스를 잡았을 때 주는 캣닢. tier 1=2, 2=4, 3=6.
 * @param {number} tier 보스 등급 (1~3)
 * @param {number} mul 프리미엄 배수
 */
export function catnipForBoss(tier = 1, mul = 1) {
  const t = Math.max(1, Math.floor(tier))
  return Math.round(t * CATNIP_PER_BOSS_TIER * mul)
}

/**
 * 웨이브를 클리어했을 때 주는 캣닢. 5의 배수 웨이브에서만 나온다.
 * @param {number} waveNo 방금 클리어한 웨이브
 * @param {number} mul 프리미엄 배수
 */
export function catnipForWaveClear(waveNo, mul = 1) {
  if (!Number.isInteger(waveNo) || waveNo < 1) return 0
  if (waveNo % 5 !== 0) return 0
  return Math.round(CATNIP_PER_5_WAVES * mul)
}

/** 맵 클리어 보상 */
export function catnipForMapClear(mul = 1) {
  return Math.round(CATNIP_MAP_CLEAR * mul)
}
