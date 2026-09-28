/**
 * 필살기 성장 — **로드아웃**(들고 들어갈 넷)과 필살기마다 **두 트리**(세기 · 쿨다운)의 영구 단계.
 *
 * 왜 있는가 (L-4): 필살기 4종은 고정이었고 성장이 없었다. 고양이에는 훈련(3단계 · 40/80/160 캣닢)이
 * 있는데 필살기에는 그 자리가 없어서, 고를 것도 키울 것도 없는 버튼 넷이었다. 사용자가 "골라 장착 ·
 * 새로 추가 · 업그레이드"를 원했다.
 *
 * 훈련(`growth.js`)을 그대로 본떴다 — 순수 함수만, 진행도는 제자리에서 안 바꾸고 새 객체를 돌려준다.
 * 저장 필드는 `progress.specials = { loadout: [id…], ranks: { id: { power, cooldown } } }` (save.js v8).
 *
 * **봇 결과를 안 바꾼다.** 시뮬레이터와 검사는 `defaultProgress()`(단계 0 · 로드아웃 비어 있음)로 돌고,
 * 로드아웃이 비어 있으면 `loadoutOf` 가 **기본 로드아웃**(등록 순 앞 넷 = 예전의 그 넷)을 돌려주므로
 * 새 필살기를 등록해도 봇은 그 넷만 쓴다. 배수는 단계 0 에서 정확히 1 이다.
 *
 * 세기 트리는 `game._specialCtx` 의 래퍼에서 **피해와 지속시간**에 곱한다 — 연계 배수(`_comboMul`)와
 * 같은 자리라 `content/specials.js` 를 한 글자도 안 고친다. 공속 버프의 **배수**(2.2)에는 안 곱한다 —
 * 지속에만 곱한다. 배수에 곱하면 3단계에서 ×2.86 이 되고 그건 폭주다.
 */
import { addCatnip, SPECIAL_RANK_MAX } from './save.js'
import { tr } from '../i18n/index.js'

export { SPECIAL_RANK_MAX }

/** HUD 에 늘어서는 필살기 수. 늘리면 버튼이 늘어나 한 손에 안 잡힌다 — 로드아웃이 있는 이유다. */
export const SPECIAL_SLOTS = 4
/* 트리마다 최고 단계는 save.js 의 SPECIAL_RANK_MAX (순환 import 를 피하려고 저장 쪽에 있다) — 위에서 다시 내보낸다 */
/** 단계별 비용 (0→1, 1→2, 2→3) — 훈련과 같은 표. 캣닢의 장기 소비처 하나가 더 생긴다. */
export const SPECIAL_RANK_COST = [40, 80, 160]
/** 세기 트리: 단계당 피해·지속 +10% */
export const SPECIAL_POWER_PER_RANK = 0.10
/** 쿨다운 트리: 단계당 쿨다운 −10% (최저 ×0.7) */
export const SPECIAL_COOLDOWN_PER_RANK = 0.10
/** 프리미엄 팩 할인 (훈련과 같다) */
export const SPECIAL_PREMIUM_DISCOUNT = 0.2
export const SPECIAL_TREES = ['power', 'cooldown']

const clampRank = (n) => (Number.isFinite(n) && n > 0 ? Math.min(SPECIAL_RANK_MAX, Math.floor(n)) : 0)

/** 한 필살기의 한 트리 단계 (0~SPECIAL_RANK_MAX). 망가진 값은 0 이다. */
export function specialRank(progress, id, tree) {
  const ranks = progress && progress.specials && progress.specials.ranks
  const r = ranks && ranks[id]
  return clampRank(r && Number(r[tree]))
}

/** 다음 단계 비용. 이미 최고면 null. */
export function specialRankCost(rank, { premium = false } = {}) {
  if (!Number.isInteger(rank) || rank < 0 || rank >= SPECIAL_RANK_MAX) return null
  const base = SPECIAL_RANK_COST[rank]
  return premium ? Math.round(base * (1 - SPECIAL_PREMIUM_DISCOUNT)) : base
}

/** 세기 배수 — 피해와 지속시간에 곱한다 */
export function powerMul(rank) {
  return 1 + SPECIAL_POWER_PER_RANK * clampRank(Number(rank))
}

/** 쿨다운 배수 — def.cooldown 에 곱한다 */
export function cooldownMul(rank) {
  return Math.max(0.7, 1 - SPECIAL_COOLDOWN_PER_RANK * clampRank(Number(rank)))
}

/** 전부 최고 단계까지 올리는 데 드는 캣닢 (문서·검사용): 필살기 수 × 두 트리 */
export function totalSpecialGrowthCost(specialCount, { premium = false } = {}) {
  let per = 0
  for (let r = 0; r < SPECIAL_RANK_MAX; r += 1) per += specialRankCost(r, { premium })
  return per * SPECIAL_TREES.length * specialCount
}

/**
 * 살 수 있나. 실제 효과는 upgradeSpecial() 이 낸다.
 * @returns {{ ok: boolean, reason?: string, rank: number, cost: number|null }}
 */
export function canUpgradeSpecial(progress, id, tree) {
  if (!SPECIAL_TREES.includes(tree)) return { ok: false, reason: tr('모르는 트리다'), rank: 0, cost: null }
  const rank = specialRank(progress, id, tree)
  const cost = specialRankCost(rank, { premium: !!(progress && progress.premium) })
  if (cost === null) return { ok: false, reason: tr('이미 최고 단계다'), rank, cost }
  const have = (progress && progress.catnip) || 0
  if (have < cost) return { ok: false, reason: tr('캣닢 부족 ({have}/{cost})', { have: have, cost: cost }), rank, cost }
  return { ok: true, rank, cost }
}

/** 한 단계 올린다 (제자리 변경 없이 새 객체). 못 올리면 progress 그대로. */
export function upgradeSpecial(progress, id, tree) {
  const check = canUpgradeSpecial(progress, id, tree)
  if (!check.ok) return { progress, ok: false, reason: check.reason, rank: check.rank }
  const rank = check.rank + 1
  const next = addCatnip(progress, -check.cost)
  const sp = specialsOf(next)
  const cur = sp.ranks[id] || {}
  return {
    progress: { ...next, specials: { ...sp, ranks: { ...sp.ranks, [id]: { ...cur, [tree]: rank } } } },
    ok: true, rank, cost: check.cost,
  }
}

/** progress.specials 를 늘 같은 모양으로 읽는다 (없거나 망가져도) */
export function specialsOf(progress) {
  const sp = (progress && progress.specials) || {}
  return {
    loadout: Array.isArray(sp.loadout) ? sp.loadout.filter((x) => typeof x === 'string') : [],
    ranks: sp.ranks && typeof sp.ranks === 'object' ? sp.ranks : {},
  }
}

/** 기본 로드아웃 — 등록 순 앞 SPECIAL_SLOTS 개. `listSpecials()`(order 정렬) 결과를 넘긴다. */
export function defaultLoadout(specials) {
  return (specials || []).slice(0, SPECIAL_SLOTS).map((s) => (typeof s === 'string' ? s : s.id))
}

/**
 * 지금 들고 들어갈 필살기 id 목록.
 * 저장된 로드아웃에서 **등록된 것만** 남기고(콘텐츠에서 뺀 필살기는 조용히 빠진다), 비어 있으면 기본 로드아웃.
 * 슬롯보다 많으면 앞에서 자른다. 슬롯보다 적은 것은 그대로 둔다 — 사람이 일부러 셋만 들 수도 있다.
 */
export function loadoutOf(progress, specials) {
  const known = new Set((specials || []).map((s) => (typeof s === 'string' ? s : s.id)))
  const saved = specialsOf(progress).loadout.filter((id) => known.has(id))
  const dedup = [...new Set(saved)].slice(0, SPECIAL_SLOTS)
  return dedup.length > 0 ? dedup : defaultLoadout(specials)
}

/**
 * 장착/해제 토글. 꽉 찼으면 넣지 않고(하나 빼야 한다), 마지막 하나는 빼지 않는다(빈 손으로는 못 들어간다).
 * @returns {{ ok: boolean, reason?: string, progress: object, loadout: string[] }}
 */
export function toggleLoadout(progress, id, specials) {
  const known = new Set((specials || []).map((s) => (typeof s === 'string' ? s : s.id)))
  if (!known.has(id)) return { ok: false, reason: tr('없는 필살기다'), progress, loadout: loadoutOf(progress, specials) }
  const cur = loadoutOf(progress, specials)
  let next
  if (cur.includes(id)) {
    if (cur.length <= 1) return { ok: false, reason: tr('필살기는 하나는 들고 가야 한다'), progress, loadout: cur }
    next = cur.filter((x) => x !== id)
  } else {
    if (cur.length >= SPECIAL_SLOTS) return { ok: false, reason: tr('자리가 {n}개뿐이다 — 하나를 빼야 넣는다', { n: SPECIAL_SLOTS }), progress, loadout: cur }
    next = [...cur, id]
  }
  const sp = specialsOf(progress)
  return { ok: true, progress: { ...progress, specials: { ...sp, loadout: next } }, loadout: next }
}

/** 로드아웃 안에서 한 칸 앞/뒤로 (dir = -1 | +1). HUD 버튼 순서가 이것이다. 끝이면 그대로. */
export function moveInLoadout(progress, id, dir, specials) {
  const cur = loadoutOf(progress, specials)
  const i = cur.indexOf(id)
  const j = i + (dir < 0 ? -1 : 1)
  if (i < 0 || j < 0 || j >= cur.length) return { ok: false, progress, loadout: cur }
  const next = [...cur]
  next[i] = cur[j]
  next[j] = cur[i]
  const sp = specialsOf(progress)
  return { ok: true, progress: { ...progress, specials: { ...sp, loadout: next } }, loadout: next }
}

/** 기록 탭·업적용: 모든 필살기 두 트리 단계 합 */
export function totalSpecialRanks(progress) {
  let n = 0
  for (const r of Object.values(specialsOf(progress).ranks)) {
    for (const tree of SPECIAL_TREES) n += clampRank(Number(r && r[tree]))
  }
  return n
}
