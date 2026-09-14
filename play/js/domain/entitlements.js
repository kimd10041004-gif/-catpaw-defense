/**
 * 유료 콘텐츠 자격 — "이 사람이 3막을 열 수 있나, 도전 팩 2 를 갖고 있나, 이 스킨을 가졌나".
 *
 * 무료 범위(변하지 않는 약속): 자유 모드 6맵 · 시나리오 1~2막 · 도전 5종(팩 1) · 펫 · 훈련 · 무한 · 주간 도전.
 * 유료: 3막 · 도전 팩 2 · 스킨 팩 · 스타터 팩. 유료가 무료를 잠그지 않는다 — content.test 가 못 박는다.
 *
 * 자격은 progress.unlocks / skins.owned / premium 에 있고, 영수증(progress.purchases)에서 applyGrants 로 들어온다.
 * 실제 결제 환경에서는 billing.reconcilePurchases 가 모의 영수증으로 받은 자격을 되돌린다. 순수 함수만.
 */

/** 무료로 열리는 막 — 이 밖의 막은 unlocks.acts 에 번호가 있어야 한다 */
export const FREE_ACTS = [1, 2]

/** 상품 grants 가 쓸 수 있는 키 (shop.test 가 화이트리스트로 검사) */
export const GRANT_KEYS = ['catnip', 'premium', 'act', 'pack', 'skins', 'pet']

export function hasAct(progress, act) {
  const n = Number(act) || 1
  if (FREE_ACTS.includes(n)) return true
  const acts = progress && progress.unlocks && Array.isArray(progress.unlocks.acts) ? progress.unlocks.acts : []
  return acts.includes(n)
}

export function hasPack(progress, packId) {
  if (!packId) return true
  const packs = progress && progress.unlocks && Array.isArray(progress.unlocks.packs) ? progress.unlocks.packs : []
  return packs.includes(packId)
}

export function ownsSkin(progress, skinId) {
  const owned = progress && progress.skins && Array.isArray(progress.skins.owned) ? progress.skins.owned : []
  return owned.includes(skinId)
}

/** 영구 자격(소모품 제외)을 전부 가졌나 — '보유 중' 표시와 재구매 거부에 쓴다 */
export function ownsGrants(progress, grants) {
  if (!grants) return false
  let any = false
  if (grants.premium) { any = true; if (!(progress && progress.premium)) return false }
  if (grants.act !== undefined) { any = true; if (!hasAct(progress, grants.act)) return false }
  if (grants.pack !== undefined) { any = true; if (!hasPack(progress, grants.pack)) return false }
  if (Array.isArray(grants.skins) && grants.skins.length) { any = true; if (!grants.skins.every((s) => ownsSkin(progress, s))) return false }
  if (grants.pet !== undefined) {
    any = true
    const owned = progress && progress.pets && Array.isArray(progress.pets.owned) ? progress.pets.owned : []
    if (!owned.includes(grants.pet)) return false
  }
  return any
}

const uniq = (list) => [...new Set(list)]

/**
 * 상품 효과를 진행도에 넣는다 (제자리 변경 없이). 캣닢은 더하고, 나머지는 집합에 넣는다.
 * 펫은 보유 목록에만 넣고 장착은 바꾸지 않는다 (판 밖에서 고르는 선택이다).
 */
export function applyGrants(progress, grants) {
  if (!grants || typeof grants !== 'object') return progress
  let next = { ...progress }
  if (Number.isFinite(grants.catnip) && grants.catnip > 0) next.catnip = Math.max(0, (next.catnip || 0) + Math.round(grants.catnip))
  if (grants.premium) next.premium = true
  const unlocks = next.unlocks || { acts: [], packs: [] }
  let acts = unlocks.acts || []; let packs = unlocks.packs || []
  if (grants.act !== undefined) acts = uniq([...acts, Number(grants.act)])
  if (grants.pack !== undefined) packs = uniq([...packs, String(grants.pack)])
  next.unlocks = { acts, packs }
  if (Array.isArray(grants.skins) && grants.skins.length) {
    const skins = next.skins || { owned: [], equipped: {} }
    next.skins = { owned: uniq([...(skins.owned || []), ...grants.skins]), equipped: { ...(skins.equipped || {}) } }
  }
  if (grants.pet !== undefined) {
    const pets = next.pets || { owned: [], equipped: null }
    const owned = uniq([...(pets.owned || []), String(grants.pet)])
    next.pets = { owned, equipped: pets.equipped || owned[0] }
  }
  return next
}

/**
 * 영수증 묶음이 주는 영구 자격의 합 — 결제 환경 대조(reconcile)와 복원에 쓴다. 소모품(캣닢)은 안 센다.
 * @param {Array<{sku:string, grants?:object, id?:string}>} products  상품 카탈로그
 * @param {Array<{sku?:string, productId?:string}>} receipts
 */
export function grantsFromReceipts(products, receipts) {
  const out = { premium: false, acts: [], packs: [], skins: [], pets: [] }
  for (const r of receipts || []) {
    const product = products.find((p) => (r.sku && p.sku === r.sku) || (r.productId && p.id === r.productId))
    const g = product && product.grants
    if (!g) continue
    if (g.premium) out.premium = true
    if (g.act !== undefined) out.acts.push(Number(g.act))
    if (g.pack !== undefined) out.packs.push(String(g.pack))
    if (Array.isArray(g.skins)) out.skins.push(...g.skins)
    if (g.pet !== undefined) out.pets.push(String(g.pet))
  }
  out.acts = uniq(out.acts); out.packs = uniq(out.packs); out.skins = uniq(out.skins); out.pets = uniq(out.pets)
  return out
}
