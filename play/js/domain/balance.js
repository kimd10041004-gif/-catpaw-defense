/**
 * 밸런스 계산 — 방어력 적용, 웨이브별 스케일링, 보너스 골드.
 * DOM에 의존하지 않는 순수 함수만 둔다 (node --test 대상).
 * 수치를 바꾸고 싶으면 이 파일의 상수만 만지면 된다.
 */

/** 웨이브가 1 오를 때마다 적 체력이 이만큼씩 누적 증가한다 (10%p) */
export const HP_GROWTH_PER_WAVE = 0.10

/** 10웨이브마다 킬 골드가 이만큼 증가한다 (25%p) */
export const GOLD_GROWTH_PER_10_WAVES = 0.25

/** 방어력이 아무리 높아도 한 방에 최소 이만큼은 들어간다 (무한 탱킹 방지) */
export const MIN_DAMAGE = 1

/** 웨이브 클리어 보너스 = BASE + wave * PER_WAVE */
export const CLEAR_BONUS_BASE = 25
export const CLEAR_BONUS_PER_WAVE = 5

/** 조기 호출 보너스 = 남은 준비시간 비율 * (BASE + wave * PER_WAVE) */
export const EARLY_BONUS_BASE = 10
export const EARLY_BONUS_PER_WAVE = 2

/** 크리티컬 확률과 배수 — 화력 임팩트의 근거 */
export const CRIT_CHANCE = 0.08
export const CRIT_MULTIPLIER = 2

export class BalanceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BalanceError'
  }
}

/** 유한한 숫자인지 확인한다. 아니면 BalanceError. */
function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BalanceError(`${label}은(는) 유한한 숫자여야 합니다: ${String(value)}`)
  }
}

/** 1 이상의 정수인지 확인한다. 아니면 BalanceError. */
function requireWave(wave) {
  if (!Number.isInteger(wave) || wave < 1) {
    throw new BalanceError(`wave는 1 이상의 정수여야 합니다: ${String(wave)}`)
  }
}

/**
 * 방어력을 적용한 실제 피해량. 최소 MIN_DAMAGE는 보장한다.
 * 이 규칙 때문에 "속사 저데미지" 타워가 중장갑 적 앞에서 무력해지는 트레이드오프가 생긴다.
 * @param {number} damage 타워의 1발 공격력
 * @param {number} armor 적의 방어력
 * @returns {number}
 */
export function applyArmor(damage, armor) {
  requireFinite(damage, 'damage')
  requireFinite(armor, 'armor')
  if (damage < 0) throw new BalanceError(`damage는 0 이상이어야 합니다: ${damage}`)
  if (armor < 0) throw new BalanceError(`armor는 0 이상이어야 합니다: ${armor}`)
  return Math.max(MIN_DAMAGE, damage - armor)
}

/**
 * 웨이브·맵 난이도·난이도 프리셋을 모두 반영한 적 체력.
 * @param {number} baseHp 적 정의의 기본 체력
 * @param {number} wave 1-based 웨이브 번호
 * @param {number} mapDifficulty 맵 난이도 배율 (예: 1.15)
 * @param {number} hpMul 난이도 프리셋 체력 배율 (예: 0.75)
 * @returns {number} 1 이상의 정수
 */
export function scaleHp(baseHp, wave, mapDifficulty = 1, hpMul = 1) {
  requireFinite(baseHp, 'baseHp')
  requireWave(wave)
  requireFinite(mapDifficulty, 'mapDifficulty')
  requireFinite(hpMul, 'hpMul')
  const grown = baseHp * (1 + (wave - 1) * HP_GROWTH_PER_WAVE)
  return Math.max(1, Math.round(grown * mapDifficulty * hpMul))
}

/**
 * 처치 시 얻는 골드. 10웨이브 단위로 계단식 상승한다(후반 인플레이션 통제).
 * @param {number} baseGold 적 정의의 기본 골드
 * @param {number} wave 1-based 웨이브 번호
 * @param {number} goldMul 난이도 프리셋 골드 배율
 * @returns {number} 1 이상의 정수
 */
export function scaleGold(baseGold, wave, goldMul = 1) {
  requireFinite(baseGold, 'baseGold')
  requireWave(wave)
  requireFinite(goldMul, 'goldMul')
  const tier = Math.floor((wave - 1) / 10)
  const grown = baseGold * (1 + tier * GOLD_GROWTH_PER_10_WAVES)
  return Math.max(1, Math.round(grown * goldMul))
}

/**
 * 웨이브를 끝까지 막아냈을 때 주는 보너스 골드.
 * @param {number} wave 1-based 웨이브 번호
 * @returns {number}
 */
export function waveClearBonus(wave) {
  requireWave(wave)
  return CLEAR_BONUS_BASE + wave * CLEAR_BONUS_PER_WAVE
}

/**
 * 준비 시간을 남기고 다음 웨이브를 먼저 호출했을 때 주는 보너스 골드.
 * 남은 시간이 많을수록 많이 준다 (숙련자 보상).
 * @param {number} remainingSec 남은 준비 시간(초)
 * @param {number} prepSec 준비 시간 총량(초)
 * @param {number} wave 방금 호출한 웨이브 번호
 * @returns {number} 0 이상의 정수
 */
export function earlyCallBonus(remainingSec, prepSec, wave) {
  requireFinite(remainingSec, 'remainingSec')
  requireFinite(prepSec, 'prepSec')
  requireWave(wave)
  if (prepSec <= 0) return 0
  const ratio = Math.min(1, Math.max(0, remainingSec / prepSec))
  return Math.round(ratio * (EARLY_BONUS_BASE + wave * EARLY_BONUS_PER_WAVE))
}

/**
 * 이번 공격이 크리티컬인지. 난수 주입이 가능해 테스트할 수 있다.
 * @param {() => number} random 0~1 난수 생성기
 */
export function rollCrit(random = Math.random) {
  return random() < CRIT_CHANCE
}

/** 크리티컬 피해량 (방어력 적용 전 기준) */
export function critDamage(damage) {
  requireFinite(damage, 'damage')
  return Math.round(damage * CRIT_MULTIPLIER)
}
