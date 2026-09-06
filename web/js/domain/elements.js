/**
 * 속성과 상성 — 여섯 원소가 하나의 고리를 이룬다.
 *
 *   흙 → 번개 → 얼음 → 불 → 어둠 → 빛 → 흙
 *
 *   흙이 번개를 삼키고(접지), 번개가 얼음을 깨고, 얼음이 불을 끄고,
 *   불이 어둠을 몰아내고, 어둠이 빛을 삼키고, 빛이 흙에 싹을 틔운다.
 *
 * **왜 고리인가 — 빛↔어둠을 서로 강하게 두지 않은 이유.**
 * 처음엔 4원소 고리 + 빛↔어둠 상호 우위로 짰다. 그런데 그러면 빛과 어둠만
 * **약점이 하나도 없다**(서로에게 1.5, 나머지 넷에겐 1.0). 고양이는 공격만 하므로
 * 약점 없는 속성은 언제나 정답이 되고, 상성이 곧 죽는다.
 * 고리로 두면 여섯 전부 **강점 1 · 약점 1 · 무관 3** 으로 대칭이다 — 검사가 이 대칭을 지킨다.
 * (물리가 아니라 설계다. 다섯은 말이 되고 '빛 → 흙' 하나는 고리를 닫으려고 고른 것이다.)
 *
 * **어디에 곱하나**: `game.js` 의 `applyDamage` 가 **방어력을 뺀 뒤에** 곱한다.
 * 앞에 곱하면 장갑이 뺄셈이라 "×1.5" 가 적마다 다른 값이 돼 화면에서 안 읽힌다.
 *
 * **언제 켜지나**: `rules.elemental` 이 켜진 판에서만. 자유 모드와 시나리오는 그대로다 —
 * 맵을 깨고 나가는 길이 속성 수집에 걸리면 안 된다(README 무료 범위 약속).
 */

/** 고리 순서 그대로. 각 원소는 **다음** 원소에게 강하다. */
export const ELEMENTS = ['earth', 'bolt', 'ice', 'fire', 'dark', 'light']

/** 상성 배수 — 이 셋 말고는 없다 */
export const STRONG = 1.5
export const NEUTRAL = 1.0
export const WEAK = 0.7

/** 속성 이름 (UI·도감). i18n 은 표시하는 쪽에서 tr() 로 감싼다 */
export const ELEMENT_NAMES = {
  earth: '흙',
  bolt: '번개',
  ice: '얼음',
  fire: '불',
  dark: '어둠',
  light: '빛',
}

/** 배지에 쓰는 한 글자와 색 (render/ui 가 쓴다) */
export const ELEMENT_LOOK = {
  earth: { glyph: '⛰', color: '#c9a227' },
  bolt: { glyph: '⚡', color: '#ffd166' },
  ice: { glyph: '❄', color: '#7fd8ff' },
  fire: { glyph: '🔥', color: '#ff7a59' },
  dark: { glyph: '☾', color: '#a78bfa' },
  light: { glyph: '☀', color: '#fff3b0' },
}

/** 아는 속성인가 — 등록 검증과 세이브 정규화가 쓴다 */
export function isElement(id) {
  return ELEMENTS.includes(id)
}

/** `a` 가 강한 상대 (고리의 다음 칸) */
export function beats(a) {
  const i = ELEMENTS.indexOf(a)
  return i < 0 ? null : ELEMENTS[(i + 1) % ELEMENTS.length]
}

/** 이 속성에게 강한 속성 — 고리의 **앞** 하나. `beats` 의 역이다(약점을 화면에 적을 때 쓴다). */
export function beatenBy(a) {
  const i = ELEMENTS.indexOf(a)
  return i < 0 ? null : ELEMENTS[(i + ELEMENTS.length - 1) % ELEMENTS.length]
}

/**
 * 공격 속성이 방어 속성에게 주는 배수.
 * 한쪽이라도 속성이 없으면 1.0 — 속성 없는 콘텐츠(필살기 등)가 조용히 섞여도 안전하다.
 */
export function elementMul(attacker, defender) {
  if (!isElement(attacker) || !isElement(defender)) return NEUTRAL
  if (attacker === defender) return NEUTRAL
  if (beats(attacker) === defender) return STRONG
  if (beats(defender) === attacker) return WEAK
  return NEUTRAL
}

/** 사람이 읽는 상성 설명 — 도감과 원정 안내가 쓴다 */
export function describeMatchup(attacker, defender) {
  const m = elementMul(attacker, defender)
  if (m === STRONG) return '효과가 좋다'
  if (m === WEAK) return '효과가 나쁘다'
  return '보통'
}
