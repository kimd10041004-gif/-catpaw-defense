/**
 * 수정자(mods) — 타워나 판 전체의 숫자를 올리는 것들을 한곳에 모은다.
 *
 * 왜 한곳인가: 펫 · 고양이 조합 · buff 고양이는 전부 "어떤 타워의 공격력을 올린다"를
 * 한다. 셋을 각자 만들면 세 군데에서 곱셈이 일어나고 서로를 모른 채 겹쳐서
 * 곱이 터진다. 여기서 다 합치고 마지막에 상한을 씌운다.
 *
 * DOM 도 레지스트리도 모른다. 조합 정의는 인자로 받는다.
 */

/**
 * 곱해서 쌓이는 것들의 상한. 이걸 넘으면 밸런스가 무의미해진다.
 *
 * 근거: 펫(+12%) × 조합(+25%) × buff 고양이(+26%) × 황금 발바닥(×2) = 3.5배.
 * 셋만 겹쳐도 2배가 넘으므로, 늘어날 출처를 미리 감안해 2.5배에서 자른다.
 */
export const MODS_CAP = {
  damageMul: 2.5,
  fireRateMul: 2.0,
  rangeAdd: 1.5,
  goldMul: 2.0,
  manaMul: 2.0,
}

/** 곱은 1, 덧셈은 0 — 아무것도 안 붙은 상태 */
export function emptyMods() {
  return { damageMul: 1, fireRateMul: 1, rangeAdd: 0, goldMul: 1, manaMul: 1 }
}

const MUL_KEYS = ['damageMul', 'fireRateMul', 'goldMul', 'manaMul']

/**
 * 여러 수정자를 하나로 합친다. 배수는 곱하고 덧셈은 더한 뒤 상한을 씌운다.
 * null·undefined 는 무시한다 (없는 펫, 성립 안 한 조합).
 */
export function combineMods(...list) {
  const out = emptyMods()
  for (const m of list) {
    if (!m || typeof m !== 'object') continue
    for (const k of MUL_KEYS) {
      const v = m[k]
      if (Number.isFinite(v) && v > 0) out[k] *= v
    }
    if (Number.isFinite(m.rangeAdd)) out.rangeAdd += m.rangeAdd
  }
  for (const k of Object.keys(MODS_CAP)) out[k] = Math.min(out[k], MODS_CAP[k])
  return out
}

/** 타워의 현재 레벨 스탯. 없는 레벨이면 마지막 레벨로 떨어진다. */
function levelOf(tower) {
  const levels = (tower && tower.def && tower.def.levels) || []
  if (levels.length === 0) return null
  const i = Math.min(Math.max(1, tower.level || 1), levels.length) - 1
  return levels[i]
}

/**
 * 그 타워가 가진 buff 능력. 없으면 null.
 *
 * buff 는 effects.js 의 onFire/onHit 핸들러가 아니다 — 발사와 무관하게 옆 고양이를
 * 강하게 만드는 성질이라 여기서 읽는다. effects.js 에는 빈 핸들러만 등록해 둔다
 * (validateAll 이 등록된 kind 인지 검사하기 때문).
 */
export function buffOf(tower) {
  const lv = levelOf(tower)
  if (!lv || !Array.isArray(lv.effects)) return null
  return lv.effects.find((e) => e && e.kind === 'buff') || null
}

/** 두 타워 사이의 격자 거리 (체비쇼프가 아니라 실제 거리) */
function tileDist(a, b) {
  const dc = (a.c || 0) - (b.c || 0)
  const dr = (a.r || 0) - (b.r || 0)
  return Math.sqrt(dc * dc + dr * dr)
}

/**
 * 한 타워에 붙는 수정자를 계산한다.
 *
 * ▶ 매 프레임 부르지 않는다. 타워 집합이 바뀔 때만(배치·판매·업그레이드) 다시 계산해
 *   tower.mods 에 얹어 둔다. 9마리 × 9마리라도 한 판에 수십 번뿐이다.
 *
 * @param {object} tower 대상 타워 { c, r, def, level }
 * @param {object[]} towers 판에 있는 모든 타워
 * @param {object[]} combos 조합 정의 배열 (6단계에서 채운다. 없으면 빈 배열)
 * @param {Function} matchCombo (combo, towers) → 성립한 타워 배열 | null
 */
export function towerModsFor(tower, towers, combos = [], matchCombo = null) {
  const parts = []

  // 옆에 선 buff 고양이들. 자기 자신은 자기를 강화하지 않는다.
  for (const other of towers) {
    if (other === tower) continue
    const b = buffOf(other)
    if (!b) continue
    if (tileDist(tower, other) <= (b.radius || 0)) {
      parts.push({ damageMul: b.damageMul, fireRateMul: b.fireRateMul, rangeAdd: b.rangeAdd })
    }
  }

  // 성립한 조합 중 이 타워가 들어간 것
  if (matchCombo) {
    for (const combo of combos) {
      const members = matchCombo(combo, towers)
      if (members && members.includes(tower)) parts.push(combo.mods)
    }
  }

  return combineMods(...parts)
}
