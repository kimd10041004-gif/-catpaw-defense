/**
 * 결제 추상화 — 게임 코드는 "어디서 결제되는지" 몰라야 한다.
 *
 * 제공자 두 가지:
 *   MockBillingProvider    웹/개발용. 실제 청구가 전혀 없고 UI에 '데모 결제'라고 표시된다.
 *   AndroidBillingProvider 안드로이드 앱이 주입한 window.CatpawBilling 브리지를 통해
 *                          Google Play 결제를 부른다.
 *
 * ▶ 실제 결제를 켜려면 docs/결제연동.md 의 절차를 따른다.
 *   지금 상태에서는 안드로이드 브리지가 'not_configured'를 돌려주므로
 *   결제가 조용히 성공한 척하지 않는다 — 반드시 실패로 표시된다.
 */

export class BillingError extends Error {
  constructor(message, code = 'unknown') {
    super(message)
    this.name = 'BillingError'
    this.code = code
  }
}

/**
 * 실제 청구가 없는 데모 제공자.
 * 웹에서 게임 흐름을 그대로 체험할 수 있게 하되, 진짜 결제인 척하지 않는다.
 */
export class MockBillingProvider {
  get id() { return 'mock' }
  get label() { return '데모 결제 (실제 청구 없음)' }
  get isReal() { return false }

  async purchase(product) {
    if (!product) throw new BillingError('상품 정보가 없다', 'no_product')
    return {
      ok: true,
      productId: product.id,
      sku: product.sku,
      token: `mock-${product.sku}-${Date.now()}`,
      mock: true,
    }
  }

  /** 데모에는 복원할 영수증이 없다 */
  async restore() { return [] }
}

/**
 * 안드로이드 브리지 제공자.
 * MainActivity가 addJavascriptInterface로 넣어준 window.CatpawBilling을 쓴다.
 * 브리지 계약(문자열 JSON을 주고받는다 — WebView 인터페이스는 원시 타입만 안전하다):
 *   CatpawBilling.isReady() -> 'true' | 'false'
 *   CatpawBilling.describe() -> '{"configured":bool,"label":"..."}'
 *   CatpawBilling.purchase(sku) -> '{"ok":bool,"code":"...","token":"...","message":"..."}'
 *   CatpawBilling.restore() -> '[{"sku":"...","token":"..."}]'
 */
export class AndroidBillingProvider {
  constructor(bridge) {
    this.bridge = bridge
    let info = { configured: false, label: 'Google Play 결제' }
    try {
      info = JSON.parse(this.bridge.describe())
    } catch { /* 브리지가 오래된 버전이면 기본값을 쓴다 */ }
    this.info = info
  }

  get id() { return 'android' }
  get label() {
    return this.info.configured
      ? (this.info.label || 'Google Play 결제')
      : 'Google Play 결제 (미설정)'
  }

  get isReal() { return !!this.info.configured }

  async purchase(product) {
    if (!product) throw new BillingError('상품 정보가 없습니다', 'no_product')
    let res
    try {
      res = JSON.parse(this.bridge.purchase(product.sku))
    } catch (err) {
      throw new BillingError(`결제 브리지 호출 실패: ${err.message}`, 'bridge_error')
    }
    if (!res.ok) {
      throw new BillingError(res.message || '결제가 끝나지 않았다', res.code || 'failed')
    }
    return { ok: true, productId: product.id, sku: product.sku, token: res.token, mock: false }
  }

  async restore() {
    try {
      return JSON.parse(this.bridge.restore()) || []
    } catch {
      return []
    }
  }
}

/**
 * 실행 환경에 맞는 제공자를 고른다.
 * @param {object} [globalScope] 테스트에서 가짜 window를 넘길 수 있다
 */
export function detectBilling(globalScope) {
  const g = globalScope || (typeof window !== 'undefined' ? window : {})
  const bridge = g.CatpawBilling
  if (bridge && typeof bridge.purchase === 'function' && typeof bridge.describe === 'function') {
    return new AndroidBillingProvider(bridge)
  }
  return new MockBillingProvider()
}

/**
 * 구매 결과를 진행도에 반영한다 (제자리 변경 없이 새 객체 반환).
 * 같은 영수증을 두 번 적용하지 않도록 token을 기록한다.
 * @returns {{progress:object, applied:boolean, reason?:string}}
 */
export function applyPurchase(progress, product, receipt) {
  if (!product || !receipt || !receipt.ok) {
    return { progress, applied: false, reason: '영수증이 올바르지 않다' }
  }
  const purchases = Array.isArray(progress.purchases) ? [...progress.purchases] : []
  if (receipt.token && purchases.some((p) => p.token === receipt.token)) {
    return { progress, applied: false, reason: '이미 처리된 구매다' }
  }

  purchases.push({
    productId: product.id,
    sku: product.sku,
    token: receipt.token,
    mock: !!receipt.mock,
    at: Date.now(),
  })

  const next = { ...progress, purchases }
  if (product.catnip) next.catnip = (progress.catnip || 0) + product.catnip
  if (product.permanent) next.premium = true

  return { progress: next, applied: true }
}

/**
 * 모의 영수증 격리 — 실제 결제 환경(Google Play 가 설정된 APK)에서는 데모 결제로 받은 프리미엄이
 * 효력을 잃는다. 웹에서 '데모 결제'로 누른 프리미엄 팩을 APK 로 옮겨 와 진짜 구매처럼 누리면 안 된다.
 *
 * 하지 않는 것: 모의 영수증을 지우지 않는다(토큰 중복 방지 기록이다). 모의 캣닢을 회수하지 않는다 —
 * 쓴/번 캣닢과 구분이 안 되고, addCatnip 의 0 하한 때문에 회수가 정당한 캣닢까지 조용히 없앨 수 있으며,
 * 그때 상점이 '데모 결제 (실제 청구 없음)' 이라고 적어 놓고 준 유한한 양이다.
 *
 * @param {object} progress
 * @param {{isReal:boolean}} provider  detectBilling() 결과
 * @param {(p:object) => boolean} [isPremiumProduct]  productId 가 영구 상품인지 (기본: premium_pack 계열)
 * @returns {{ progress: object, changed: boolean, reason: string|null }}
 */
export function reconcilePurchases(progress, provider, isPremiumProduct = (p) => /^premium/.test(p.productId || p.sku || '')) {
  if (!progress || !provider || !provider.isReal) return { progress, changed: false, reason: null }
  const purchases = Array.isArray(progress.purchases) ? progress.purchases : []
  const realPremium = purchases.some((p) => !p.mock && isPremiumProduct(p))
  const mockPremium = purchases.some((p) => p.mock && isPremiumProduct(p))
  if (progress.premium && !realPremium && mockPremium) {
    return {
      progress: { ...progress, premium: false },
      changed: true,
      reason: '데모 결제로 받은 프리미엄은 실제 결제 환경에서 사라졌다 · 구매 복원을 눌러 보세요',
    }
  }
  return { progress, changed: false, reason: null }
}
