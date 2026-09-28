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
  // 'sightaura' 는 사거리만 올리는 buff 다 — 파라미터 모양이 같아 같은 자리에서 읽는다.
  // kind 를 나눈 이유는 알약 문구와 도감이 "무엇을 올려 주는지"를 다르게 읽어야 해서다.
  return lv.effects.find((e) => e && (e.kind === 'buff' || e.kind === 'sightaura')) || null
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
 * @param {{combo:object, members:object[]}[]} matched 이미 성립한 조합들.
 *        조합 판정(matchCombo)은 타워마다가 아니라 한 번만 돌려서 넘긴다.
 */
export function towerModsFor(tower, towers, matched = []) {
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
  for (const m of matched) {
    if (m && m.members && m.members.includes(tower)) parts.push(m.combo.mods)
  }

  return combineMods(...parts)
}

/** 격자 좌표가 같은 칸인가 */
const sameCell = (a, b) => a.c === b.c && a.r === b.r

/**
 * 조합의 모양이 성립하는가.
 *
 *   adjacent  상하좌우로 맞닿음 — 모든 구성원이 하나의 덩어리로 이어져 있다
 *   diagonal  대각선으로 맞닿음 (2마리 전용)
 *   line      같은 행 또는 같은 열에서 빈칸 없이 연속
 *   near      전원이 어느 한 칸을 중심으로 3×3 안
 */
export function shapeHolds(shape, group) {
  if (group.length < 2) return false
  const dc = (a, b) => Math.abs(a.c - b.c)
  const dr = (a, b) => Math.abs(a.r - b.r)

  if (shape === 'diagonal') {
    return group.length === 2 && dc(group[0], group[1]) === 1 && dr(group[0], group[1]) === 1
  }
  if (shape === 'near') {
    const cs = group.map((t) => t.c)
    const rs = group.map((t) => t.r)
    return Math.max(...cs) - Math.min(...cs) <= 2 && Math.max(...rs) - Math.min(...rs) <= 2
  }
  if (shape === 'line') {
    const sameRow = group.every((t) => t.r === group[0].r)
    const sameCol = group.every((t) => t.c === group[0].c)
    if (!sameRow && !sameCol) return false
    const vals = group.map((t) => (sameRow ? t.c : t.r)).sort((a, b) => a - b)
    // 빈칸 없이 연속이어야 한다. 사이가 비면 "한 줄로 섰다"고 보기 어렵다.
    for (let i = 1; i < vals.length; i += 1) if (vals[i] !== vals[i - 1] + 1) return false
    return true
  }
  // adjacent — 상하좌우로 전부 이어져 있는 한 덩어리인가 (너비 우선 탐색)
  const seen = new Set([0])
  const queue = [0]
  while (queue.length > 0) {
    const i = queue.shift()
    for (let j = 0; j < group.length; j += 1) {
      if (seen.has(j)) continue
      if (dc(group[i], group[j]) + dr(group[i], group[j]) === 1) { seen.add(j); queue.push(j) }
    }
  }
  return seen.size === group.length
}

/**
 * 조합이 성립하는 타워 묶음을 찾는다. 없으면 null.
 *
 * combo.towers 는 필요한 고양이 id 목록이고 **같은 id 를 여러 번 적으면 그만큼 서로 다른
 * 고양이가 필요하다**(['cheese','cheese','cheese'] = 치즈냥 세 마리).
 * 여러 묶음이 성립하면 먼저 찾은 하나만 돌려준다 — 같은 조합을 겹쳐 쌓지 않는다.
 */
export function matchCombo(combo, towers) {
  const need = combo && combo.towers
  if (!Array.isArray(need) || need.length === 0) return null

  const pick = (idx, chosen) => {
    if (idx === need.length) return shapeHolds(combo.shape, chosen) ? chosen : null
    for (const t of towers) {
      if (t.def.id !== need[idx]) continue
      if (chosen.some((c) => sameCell(c, t))) continue
      const got = pick(idx + 1, [...chosen, t])
      if (got) return got
    }
    return null
  }
  return pick(0, [])
}

// ─────────────────────────────────────────────────────────────────────────────
// 필살기 연계
//
// 고양이 조합이 "어디에 놓았나"를 본다면 이쪽은 "어떤 순서로 언제 썼나"를 본다.
// 둘 다 결국 배수를 만들어 내므로 같은 모듈에 둔다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 방금 쓴 필살기와 이어지는 연계를 찾는다. 없으면 null.
 *
 * @param {object[]} combos  등록된 연계들 { id, from, to, window, bonus }
 * @param {{id:string, at:number}|null} last 직전에 쓴 필살기
 * @param {string} nextId 지금 쓰려는 필살기
 * @param {number} now 게임 내부 시각(초)
 */
export function matchSpecialCombo(combos, last, nextId, now) {
  if (!last || !Array.isArray(combos)) return null
  for (const c of combos) {
    if (!c || c.from !== last.id || c.to !== nextId) continue
    // 같은 필살기를 두 번 쓴 건 연계가 아니다 (from === to 인 연계는 등록 자체를 막는다)
    if (now - last.at > c.window) continue
    return c
  }
  return null
}

/**
 * 다음에 어떤 필살기를 쓰면 연계가 되는지. HUD 힌트에 쓴다.
 * 안 알려주면 아무도 못 찾는다.
 */
export function specialComboHints(combos, last, now) {
  if (!last || !Array.isArray(combos)) return []
  return combos
    .filter((c) => c && c.from === last.id && now - last.at <= c.window)
    .map((c) => c.to)
}
