/**
 * 엘리트(왕관) 변종 — 일반 적이 가끔 왕관을 쓰고 나온다.
 *
 * 왜 이렇게 하나: 적 종류를 늘리지 않고 후반 압박을 올리는 가장 싼 방법이다.
 * 정의를 새로 만들 필요가 없어서 웨이브 테이블도 그대로 둘 수 있다.
 * 스프라이트는 이미 palette.crown 을 그리게 돼 있어 그림도 공짜로 따라온다.
 *
 * 보스에게는 붙이지 않는다 — 보스는 이미 왕관을 쓰고 있고 능력도 따로 있다.
 */

/** 이 웨이브부터 엘리트가 나오기 시작한다 */
export const ELITE_FROM_WAVE = 6
/** 웨이브가 1 오를 때마다 등장 확률이 이만큼 오른다 */
export const ELITE_CHANCE_PER_WAVE = 0.012
/** 확률 상한 — 너무 높으면 화면이 왕관으로 뒤덮인다 */
export const ELITE_CHANCE_MAX = 0.22

export const ELITE_HP_MUL = 2.2
export const ELITE_ARMOR_ADD = 3
export const ELITE_GOLD_MUL = 3
/** 왕관 색 — 보스 왕관과 같은 금색을 쓴다 */
export const ELITE_CROWN = '#ffce4d'

/**
 * 이 웨이브에서 엘리트가 나올 확률 (0~ELITE_CHANCE_MAX).
 * @param {number} waveNo 1-based
 */
export function eliteChance(waveNo) {
  if (!Number.isInteger(waveNo) || waveNo < ELITE_FROM_WAVE) return 0
  const grown = (waveNo - ELITE_FROM_WAVE + 1) * ELITE_CHANCE_PER_WAVE
  return Math.min(ELITE_CHANCE_MAX, grown)
}

/**
 * 이번에 나오는 적이 엘리트인지 굴린다.
 * @param {object} enemyDef 적 정의 (보스는 항상 false)
 * @param {number} waveNo
 * @param {() => number} random 0~1 (테스트에서 주입한다)
 */
export function rollElite(enemyDef, waveNo, random = Math.random) {
  if (!enemyDef || enemyDef.boss) return false
  return random() < eliteChance(waveNo)
}

/**
 * 엘리트의 실제 수치. 원본을 바꾸지 않고 새 값만 돌려준다.
 * @param {{hp:number, armor:number, gold:number}} base
 */
export function eliteStats(base) {
  return {
    hp: Math.max(1, Math.round(base.hp * ELITE_HP_MUL)),
    armor: base.armor + ELITE_ARMOR_ADD,
    gold: Math.max(1, Math.round(base.gold * ELITE_GOLD_MUL)),
  }
}

/**
 * 왕관을 얹은 팔레트. 정의의 팔레트를 절대 건드리지 않는다
 * (건드리면 그 종류 전체가 다음 판까지 왕관을 쓰고 나온다).
 */
export function elitePalette(palette) {
  return { ...palette, crown: palette.crown || ELITE_CROWN }
}
