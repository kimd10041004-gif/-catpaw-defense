/**
 * 상점 — 캣닢으로 사는 소모품과, 실제 돈으로 사는 상품(IAP)을 데이터로만 정의한다.
 *
 * ▶ 새 상품을 추가하려면 아래 배열에 한 줄 넣으면 된다. 상점 UI는 이 배열을 순회해 만들어진다.
 *
 * 설계 방침 — "정말 최소한의 과금":
 *   · 캣닢은 플레이만으로도 모인다 (보스 처치, 5웨이브마다, 맵 클리어).
 *   · 유료 상품은 편의와 속도만 판다. 유료로만 얻는 타워나 맵은 없다.
 *   · 결제 없이 30웨이브 전부 클리어 가능하도록 설계했다.
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
 * sku는 Google Play Console에 등록할 상품 ID와 같아야 한다.
 */
export const IAP_PRODUCTS = [
  {
    id: 'catnip_small', order: 1, icon: 'svg:leaf', sku: 'catnip_100',
    name: '캣닢 한 봉지', catnip: 100, priceLabel: '₩1,200',
    desc: '캣닢 100개',
  },
  {
    id: 'catnip_large', order: 2, icon: 'svg:clover', sku: 'catnip_600',
    name: '캣닢 한 자루', catnip: 600, priceLabel: '₩5,900',
    desc: '캣닢 600개', badge: '20% 더',
  },
  {
    id: 'premium', order: 3, icon: 'svg:crown', sku: 'premium_pack',
    name: '프리미엄 팩', priceLabel: '₩4,900', permanent: true,
    desc: '시작 골드 +200 · 캣닢 획득 2배 (영구, 1회 구매)',
  },
]

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
