/**
 * 재현 가능한 난수. 같은 시드면 같은 판 — 주간 도전(모두 같은 판)과 밸런스 시뮬레이터(운인지 실력인지)가 쓴다.
 * Game 은 생성자 옵션 random 으로 받는다; 시뮬레이션 난수(엘리트·크리티컬·크리스탈 칸)는 전부 그것을 지난다.
 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 문자열 → 32비트 시드 (FNV-1a). 'YYYY-Www' 같은 짧은 키를 시드로 바꾸는 데 쓴다. */
export function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
