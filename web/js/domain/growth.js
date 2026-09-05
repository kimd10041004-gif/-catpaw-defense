/**
 * 훈련 — 고양이마다 영구 단계(0~GROWTH_MAX)를 캣닢으로 올린다. 판 밖에서 사고 판 안에서 공격력 배수로 걸린다.
 *
 * 왜 있는가: 캣닢 쓸 곳이 펫 7마리와 소모품뿐이라 펫을 다 사면 캣닢이 쌓이기만 했다. 훈련은
 * 9마리 × (40+80+160) = 2,520 캣닢짜리 장기 소비처다 — 캣닢 팩(결제)이 의미를 갖는 자리이기도 하다.
 *
 * 순수 함수만. 저장 필드는 progress.growth = { 고양이id: 단계 } (save.js v6, 0 은 안 남긴다).
 * 밸런스 검사·시뮬레이터는 defaultProgress()(전부 0단계)로 돌므로 훈련이 봇 결과를 바꾸지 않는다.
 */
import { addCatnip, GROWTH_MAX } from './save.js'
import { tr } from '../i18n/index.js'

export { GROWTH_MAX }
/** 단계별 비용 (0→1, 1→2, 2→3) */
export const GROWTH_COST = [40, 80, 160]
/** 단계당 공격력 배수 증가 */
export const GROWTH_DAMAGE_PER_RANK = 0.05
/** 프리미엄 팩 할인 (C-1 혜택) */
export const GROWTH_PREMIUM_DISCOUNT = 0.2

export function growthRank(progress, towerId) {
  const g = progress && progress.growth
  const n = g && Number(g[towerId])
  return Number.isFinite(n) && n > 0 ? Math.min(GROWTH_MAX, Math.floor(n)) : 0
}

/** 다음 단계 비용. 이미 최고면 null. */
export function growthCost(rank, { premium = false } = {}) {
  if (!Number.isInteger(rank) || rank < 0 || rank >= GROWTH_MAX) return null
  const base = GROWTH_COST[rank]
  return premium ? Math.round(base * (1 - GROWTH_PREMIUM_DISCOUNT)) : base
}

/** 단계가 주는 배수 — mods.js 의 combineMods 에 그대로 넣는다 (곱셈, MODS_CAP 이 상한) */
export function growthMods(rank) {
  const r = Math.max(0, Math.min(GROWTH_MAX, Number(rank) || 0))
  return { damageMul: 1 + GROWTH_DAMAGE_PER_RANK * r }
}

/** 전부 최고 단계까지 올리는 데 드는 캣닢 (문서·검사용) */
export function totalGrowthCost(towerCount, { premium = false } = {}) {
  let per = 0
  for (let r = 0; r < GROWTH_MAX; r += 1) per += growthCost(r, { premium })
  return per * towerCount
}

/**
 * 살 수 있나. 실제 효과는 train() 이 낸다.
 * @returns {{ ok: boolean, reason?: string, rank: number, cost: number|null }}
 */
export function canTrain(progress, towerId) {
  const rank = growthRank(progress, towerId)
  const cost = growthCost(rank, { premium: !!(progress && progress.premium) })
  if (cost === null) return { ok: false, reason: tr('이미 최고 단계다'), rank, cost }
  const have = (progress && progress.catnip) || 0
  if (have < cost) return { ok: false, reason: tr('캣닢 부족 ({have}/{cost})', { have: have, cost: cost }), rank, cost }
  return { ok: true, rank, cost }
}

/** 한 단계 올린다 (제자리 변경 없이 새 객체). 못 올리면 progress 그대로. */
export function train(progress, towerId) {
  const check = canTrain(progress, towerId)
  if (!check.ok) return { progress, ok: false, reason: check.reason, rank: check.rank }
  const rank = check.rank + 1
  const next = addCatnip(progress, -check.cost)
  return { progress: { ...next, growth: { ...(next.growth || {}), [towerId]: rank } }, ok: true, rank, cost: check.cost }
}

/** 기록 탭·업적용: 모든 고양이 단계 합 */
export function totalRanks(progress) {
  return Object.values((progress && progress.growth) || {}).reduce((a, v) => a + (Number(v) || 0), 0)
}
