/**
 * 상점 — 캣닢으로 사는 소모품과, 실제 돈으로 사는 상품(IAP)을 데이터로만 정의한다.
 *
 * ▶ 새 상품을 추가하려면 아래 배열에 한 줄 넣으면 된다. 상점 UI는 이 배열을 순회해 만들어진다.
 *   grants 가 상품 효과다 (domain/entitlements.js 의 GRANT_KEYS): catnip · premium · act · pack · skins · pet.
 *   kind 는 'consumable'(캣닢) 또는 'once'(영구 — 가졌으면 '보유 중', 다시 안 판다). sku 는 Play Console 상품 ID.
 *
 * 무료 범위 (약속 — content.test 가 검사한다):
 *   · 자유 모드 6맵 · 시나리오 1~2막 · 도전 5종(팩 1) · 펫 · 훈련 · 무한 · 주간 도전은 결제 없이 전부 열린다.
 *   · 캣닢은 플레이만으로도 모인다 (보스 처치, 5웨이브마다, 맵 클리어, 도전·주간 첫 클리어).
 *   · 결제 없이 30웨이브 전부 클리어 가능하도록 설계했다.
 * 유료:
 *   · 시나리오 3막(19~24장) · 도전 팩 2(규칙 5) · 스킨 팩 2개 · 스타터 팩 · 프리미엄 팩 · 캣닢 팩.
 *   · 유료 콘텐츠가 무료 콘텐츠를 잠그지 않고, 스킨은 능력치가 없다.
 *   · 결제가 안 붙은 빌드에서는 성공한 척하지 않는다 (billing.js).
 */

export class ShopError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ShopError'
  }
}

/** 캣닢으로 사는 판 안에서 쓰는 소모품 */
export const CATNIP_ITEMS = [
  {
    id: 'revive', order: 1, icon: 'svg:heart', name: '이어하기', cost: 50,
    desc: '목숨 10 회복. 그 자리에서 계속 싸운다',
    onlyWhen: 'defeat',   // 패배 화면에서만 살 수 있다
  },
  {
    id: 'goldrush', order: 2, icon: 'svg:coin', name: '골드 러시', cost: 30,
    desc: '즉시 400 골드',
    onlyWhen: 'ingame',
  },
  {
    id: 'recharge', order: 3, icon: 'svg:bolt', name: '필살기 충전', cost: 35,
    desc: '필살기 쿨다운 전부 초기화',
    onlyWhen: 'ingame',
  },
  {
    id: 'lifeup', order: 4, icon: 'svg:shield', name: '목숨 보충', cost: 40,
    desc: '목숨 5 회복',
    onlyWhen: 'ingame',
  },
]

/**
 * 실제 결제 상품.
 * sku는 Google Play Console에 등록할 상품 ID와 같아야 한다. priceLabel 은 화면용 자리표시자다 —
 * 실제 가격은 Play 가 준다(docs/결제연동.md). section 은 상점의 어느 묶음에 보일지.
 * catnip / permanent 는 예전 필드다 — grants 와 같은 값을 갖고 있어야 한다(shop.test).
 */
export const IAP_PRODUCTS = [
  {
    id: 'catnip_small', order: 1, icon: 'svg:leaf', sku: 'catnip_100', kind: 'consumable', section: 'catnip',
    name: '캣닢 한 봉지', catnip: 100, priceLabel: '₩1,200',
    desc: '캣닢 100개', grants: { catnip: 100 },
  },
  {
    id: 'catnip_large', order: 2, icon: 'svg:clover', sku: 'catnip_600', kind: 'consumable', section: 'catnip',
    name: '캣닢 한 자루', catnip: 600, priceLabel: '₩5,900',
    desc: '캣닢 600개', badge: '20% 더', grants: { catnip: 600 },
  },
  {
    id: 'starter', order: 3, icon: 'svg:paw', sku: 'starter_pack', kind: 'once', section: 'content',
    name: '스타터 팩', priceLabel: '₩2,900',
    desc: '캣닢 300 + 펫 부엉이 + 황금 치즈냥 스킨 (1회)',
    grants: { catnip: 300, pet: 'owl', skins: ['cheese-golden'] },
  },
  {
    id: 'premium', order: 4, icon: 'svg:crown', sku: 'premium_pack', kind: 'once', section: 'premium',
    name: '프리미엄 팩', priceLabel: '₩4,900', permanent: true,
    desc: '시작 골드 +200 · 캣닢 획득 2배 · 주간 도전 보상 2배 · 훈련 20% 할인 (영구, 1회 구매)',
    grants: { premium: true },
  },
  {
    id: 'act3', order: 5, icon: 'svg:book', sku: 'story_act3', kind: 'once', section: 'content',
    name: '시나리오 3막', priceLabel: '₩3,900',
    desc: '19~24장 여섯 장과 새 웨이브 구성 두 개. 24장을 깨면 자정의 검은냥 스킨',
    grants: { act: 3 },
  },
  {
    id: 'challenges2', order: 6, icon: 'svg:shield', sku: 'challenge_pack2', kind: 'once', section: 'content',
    name: '도전 팩 2', priceLabel: '₩2,900',
    desc: '판매 금지 · 질주 · 철갑 · 마나 가뭄 · 외줄 — 모든 맵에서 규칙 다섯 개',
    grants: { pack: 'challenges2' },
  },
  {
    id: 'skins1', order: 7, icon: 'svg:sparkle', sku: 'skin_pack_1', kind: 'once', section: 'skins',
    name: '스킨 팩 1', priceLabel: '₩2,900',
    desc: '벚꽃 삼색냥 · 설원 샴냥 · 민트 뚱냥',
    grants: { skins: ['calico-blossom', 'siamese-snow', 'chonk-mint'] },
  },
  {
    id: 'skins2', order: 8, icon: 'svg:sparkle', sku: 'skin_pack_2', kind: 'once', section: 'skins',
    name: '스킨 팩 2', priceLabel: '₩2,900',
    desc: '노을 고등어냥 · 보랏빛 러시안블루냥 · 적갈 턱시도냥',
    grants: { skins: ['mackerel-sunset', 'bluerussian-violet', 'tuxedo-rust'] },
  },
]

/** 이 자격을 파는 상품 — 잠긴 카드에서 상점을 열 때 강조한다 */
export function productForAct(act) {
  return IAP_PRODUCTS.find((p) => p.grants && p.grants.act === Number(act)) || null
}
export function productForPack(packId) {
  return IAP_PRODUCTS.find((p) => p.grants && p.grants.pack === packId) || null
}
export function productForSkin(skinId) {
  return IAP_PRODUCTS.find((p) => p.grants && Array.isArray(p.grants.skins) && p.grants.skins.includes(skinId)) || null
}

/** 프리미엄 팩을 산 사람이 받는 혜택 */
export const PREMIUM_BONUS_GOLD = 200
export const PREMIUM_CATNIP_MULTIPLIER = 2

export function catnipItem(id) {
  return CATNIP_ITEMS.find((i) => i.id === id) || null
}

export function iapProduct(id) {
  return IAP_PRODUCTS.find((p) => p.id === id) || null
}

/** 현재 화면(ingame / defeat)에서 살 수 있는 소모품만 */
export function availableItems(where) {
  return CATNIP_ITEMS.filter((i) => i.onlyWhen === where).sort((a, b) => a.order - b.order)
}

/** 프리미엄 구매 여부에 따른 캣닢 획득 배수 */
export function catnipMultiplier(progress) {
  return progress && progress.premium ? PREMIUM_CATNIP_MULTIPLIER : 1
}

/** 프리미엄 구매 여부에 따른 시작 골드 보너스 */
export function startGoldBonus(progress) {
  return progress && progress.premium ? PREMIUM_BONUS_GOLD : 0
}

/**
 * 캣닢으로 소모품을 살 수 있는지 판정한다 (실제 효과 적용은 game.js가 한다).
 * @returns {{ok:boolean, reason?:string, item?:object, remaining?:number}}
 */
export function canBuy(progress, itemId) {
  const item = catnipItem(itemId)
  if (!item) return { ok: false, reason: '없는 상품이다' }
  const have = (progress && progress.catnip) || 0
  if (have < item.cost) {
    return { ok: false, reason: `캣닢 부족 (${have}/${item.cost})`, item }
  }
  return { ok: true, item, remaining: have - item.cost }
}
