/**
 * 결제 추상화 — 게임 코드는 "어디서 결제되는지" 몰라야 한다.
 *
 * 제공자 세 가지:
 *   MockBillingProvider     웹/개발용. 실제 청구가 전혀 없고 UI에 '데모 결제'라고 표시된다.
 *   AndroidBillingProvider  안드로이드 앱이 주입한 window.CatpawBilling 브리지를 통해
 *                           Google Play 결제를 부른다.
 *   DisabledBillingProvider 데모 웹 빌드(site/play/). 아무것도 못 산다 — 데모 결제조차 없다.
 *
 * ▶ 실제 결제를 켜려면 docs/결제연동.md 의 절차를 따른다 (Play Console 에 상품 등록 · 라이선스 테스터).
 *   브리지는 구현돼 있고(BillingBridge.kt), Play 에 연결이 안 되거나 상품이 없으면 not_available / not_configured
 *   를 돌려주므로 결제가 조용히 성공한 척하지 않는다 — 반드시 실패로 표시된다.
 */

import { DEMO } from '../build.js'
import { IAP_PRODUCTS } from './shop.js'
import { applyGrants, ownsGrants, grantsFromReceipts } from './entitlements.js'
import { tr } from '../i18n/index.js'

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
  get label() { return tr('데모 결제 (실제 청구 없음)') }
  get isReal() { return false }

  async purchase(product) {
    if (!product) throw new BillingError(tr('상품 정보가 없다'), 'no_product')
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

  /** 데모에는 소모·승인할 것이 없다 */
  finish() {}
}

/**
 * 데모 웹 빌드의 제공자 — **아무것도 팔지 않는다.**
 *
 * MockBillingProvider 와 다른 점이 이 클래스의 존재 이유다: 데모 결제는 성공해서 유료 콘텐츠를
 * 열어 준다. 데모 빌드에서 그러면 파는 물건을 나눠 주는 셈이라 못 쓴다. 그래서 늘 거절하고,
 * 어디서 살 수 있는지 알려 준다. 잠긴 척하지도, 곧 될 것처럼 굴지도 않는다.
 *
 * 데모에는 유료 콘텐츠 자체가 안 들어 있으므로(build.js) 여기까지 오는 일은 드물다 —
 * 예전 세이브에 남은 상품 id 같은 것으로 들어올 수 있어 막아 둔다.
 */
export class DisabledBillingProvider {
  get id() { return 'disabled' }
  get label() { return tr('이 데모에서는 구매가 없다') }
  get isReal() { return false }

  async purchase() {
    throw new BillingError(tr('데모판이라 구매가 없다. 전체판은 안드로이드 앱에서.'), 'demo_build')
  }

  async restore() { return [] }

  finish() {}
}

/**
 * 안드로이드 브리지 제공자.
 * MainActivity 가 addJavascriptInterface 로 넣어준 window.CatpawBilling 을 쓴다 (BillingBridge.kt · Play Billing Library 9).
 *
 * 계약(문자열 JSON — WebView 인터페이스는 원시 타입만 안전하다). 결제 화면은 비동기라 **요청 id** 로 주고받는다:
 *   CatpawBilling.configure(catalogJson)          상품 목록을 브리지에 준다 — shop.js 가 단 하나의 출처다
 *   CatpawBilling.describe()                      '{"configured":bool,"state":"connecting|ready|no_products|unavailable|error",
 *                                                   "message":"…","prices":{sku:"₩1,200"}}' — 부를 때마다 지금 상태
 *   CatpawBilling.purchaseAsync(requestId, sku)   답은 window.CatpawBillingCallbacks.deliver(requestId, json) 으로 온다
 *   CatpawBilling.restoreAsync(requestId)         deliver(requestId, '[{"sku":…,"token":…}]') — 소모하지 않고 돌려준다
 *   CatpawBilling.finish(token)                   **지급이 저장된 뒤에** 부른다: 소모품은 소모, 영구 상품은 (아직이면) 승인
 *   콜백 onReady() — 상품 정보가 도착했을 때 · onPurchase(json) — 요청 없이 도착한 구매(대기 중이던 결제의 승인)
 * 옛 계약(purchase(sku) · restore() 동기)도 받는다 — purchaseAsync 가 없는 브리지면 그쪽으로 간다.
 *
 * `isReal` · `label` 은 부를 때마다 describe() 를 다시 읽는다. Play 연결과 상품 조회는 앱이 뜬 뒤에 끝나므로
 * 생성 시점의 값을 굳히면 늘 '미설정' 이다.
 */
const PURCHASE_TIMEOUT_MS = 10 * 60 * 1000   // 결제 시트를 열어 둔 채 오래 고민할 수 있다
const RESTORE_TIMEOUT_MS = 60 * 1000

export class AndroidBillingProvider {
  constructor(bridge, { timeoutMs = null } = {}) {
    this.bridge = bridge
    this._timeoutMs = timeoutMs
    this._pending = new Map()      // requestId → { resolve, reject, timer }
    this._nextId = 1
    this._readyHooks = []
    this._purchaseHooks = []
    this._install()
    if (typeof bridge.configure === 'function') {
      try {
        bridge.configure(JSON.stringify(IAP_PRODUCTS.map((p) => ({ sku: p.sku, consumable: p.kind === 'consumable' }))))
      } catch { /* 브리지가 거부해도 describe() 가 상태를 말해 준다 */ }
    }
  }

  get id() { return 'android' }

  /** 지금 상태 — 브리지가 없거나 옛 버전이면 미설정으로 본다 */
  get info() {
    try {
      const info = JSON.parse(this.bridge.describe())
      return info && typeof info === 'object' ? info : { configured: false }
    } catch {
      return { configured: false }
    }
  }

  get label() { return this.info.configured ? tr('Google Play 결제') : tr('Google Play 결제 (미설정)') }
  get isReal() { return !!this.info.configured }
  /** Play 가 준 실제 가격 문자열 (sku → '₩1,200'). 없으면 빈 객체 — 화면은 priceLabel 자리표시자로 떨어진다 */
  get prices() { const p = this.info.prices; return p && typeof p === 'object' ? p : {} }

  /** 상품 정보가 도착하면 부른다 (비동기 브리지만). 결제 환경 대조(reconcile)를 다시 돌릴 자리다 */
  onReady(fn) { this._readyHooks.push(fn) }
  /** 요청 없이 도착한 구매 — 대기 중이던 결제가 승인됐을 때. 영수증 { sku, token, … } 을 준다 */
  onPurchase(fn) { this._purchaseHooks.push(fn) }

  async purchase(product) {
    if (!product) throw new BillingError(tr('상품 정보가 없습니다'), 'no_product')
    let res
    if (typeof this.bridge.purchaseAsync === 'function') {
      res = await this._request((id) => this.bridge.purchaseAsync(id, product.sku), this._timeoutMs || PURCHASE_TIMEOUT_MS)
    } else {
      try {
        res = JSON.parse(this.bridge.purchase(product.sku))
      } catch (err) {
        throw new BillingError(tr('결제 브리지 호출 실패: {message}', { message: err.message }), 'bridge_error')
      }
    }
    if (!res || !res.ok) throw new BillingError(this._message(res || {}), (res && res.code) || 'failed')
    return { ok: true, productId: product.id, sku: product.sku, token: res.token, orderId: res.orderId || null, mock: false }
  }

  async restore() {
    try {
      if (typeof this.bridge.restoreAsync === 'function') {
        const list = await this._request((id) => this.bridge.restoreAsync(id), this._timeoutMs || RESTORE_TIMEOUT_MS)
        return Array.isArray(list) ? list : []
      }
      return JSON.parse(this.bridge.restore()) || []
    } catch {
      return []
    }
  }

  /**
   * 지급이 **저장된 뒤에** 부른다(`takeReceipts` 가 부른다) — 소모품은 이때 소모되고, 영구 상품은 아직이면 승인된다.
   * 옛 브리지(finish 가 없다)는 스스로 먼저 소모하므로 여기서는 할 일이 없다.
   */
  finish(receipt) {
    if (!receipt || !receipt.token || receipt.mock) return
    if (typeof this.bridge.finish !== 'function') return
    try { this.bridge.finish(String(receipt.token)) } catch { /* 못 끝낸 구매는 다음 복원에서 다시 온다 */ }
  }

  /** 브리지의 실패 코드를 사람 말로. 브리지가 준 message 는 개발자용(응답 코드 이름)이라 마지막에만 쓴다 */
  _message(res) {
    switch (res.code) {
      case 'user_canceled': return tr('결제를 취소했다')
      case 'pending': return tr('결제 승인 대기 중 — 승인되면 지급된다')
      case 'already_owned': return tr('이미 산 상품이다 · 구매 복원을 누른다')
      case 'not_configured': return tr('Play 에 이 상품이 없다 — 결제가 아직 연결되지 않았다')
      case 'not_available': return tr('이 기기에서는 Google Play 결제를 쓸 수 없다')
      case 'timeout': return tr('결제 응답이 없다 — 다시 시도한다')
      default: return res.message || tr('결제가 끝나지 않았다')
    }
  }

  _request(send, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = this._nextId
      this._nextId += 1
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new BillingError(this._message({ code: 'timeout' }), 'timeout'))
      }, timeoutMs)
      this._pending.set(id, { resolve, reject, timer })
      try {
        send(id)
      } catch (err) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(new BillingError(tr('결제 브리지 호출 실패: {message}', { message: err.message }), 'bridge_error'))
      }
    })
  }

  _deliver(id, json) {
    const p = this._pending.get(Number(id))
    if (!p) return
    clearTimeout(p.timer)
    this._pending.delete(Number(id))
    try {
      p.resolve(JSON.parse(json))
    } catch {
      p.reject(new BillingError(tr('결제 응답을 못 읽었다'), 'bad_response'))
    }
  }

  /** 브리지가 되부르는 자리 — window.CatpawBillingCallbacks (WebView 에서는 window === globalThis) */
  _install() {
    const g = typeof window !== 'undefined' ? window : globalThis
    g.CatpawBillingCallbacks = {
      deliver: (id, json) => this._deliver(id, json),
      onReady: () => { for (const fn of this._readyHooks) { try { fn(this) } catch { /* 훅 하나가 죽어도 나머지는 돈다 */ } } },
      onPurchase: (json) => {
        let r = null
        try { r = JSON.parse(json) } catch { return }
        if (!r || !r.ok || !r.sku) return
        for (const fn of this._purchaseHooks) { try { fn(r) } catch { /* 위와 같다 */ } }
      },
    }
  }
}

/**
 * 실행 환경에 맞는 제공자를 고른다.
 * @param {object} [globalScope] 테스트에서 가짜 window를 넘길 수 있다
 */
export function detectBilling(globalScope) {
  const g = globalScope || (typeof window !== 'undefined' ? window : {})
  // 데모 빌드가 먼저다 — 브리지가 있든 없든 데모에서는 못 산다
  if (DEMO) return new DisabledBillingProvider()
  const bridge = g.CatpawBilling
  if (bridge && typeof bridge.purchase === 'function' && typeof bridge.describe === 'function') {
    return new AndroidBillingProvider(bridge)
  }
  return new MockBillingProvider()
}

/** 예전 필드(catnip · permanent)만 있는 상품도 grants 로 읽는다 */
export function grantsOf(product) {
  if (!product) return null
  if (product.grants) return product.grants
  const g = {}
  if (product.catnip) g.catnip = product.catnip
  if (product.permanent) g.premium = true
  return g
}

/**
 * 구매 결과를 진행도에 반영한다 (제자리 변경 없이 새 객체 반환).
 * 같은 영수증을 두 번 적용하지 않도록 token을 기록한다. 영구 상품(kind 'once')은 이미 가졌으면 다시 안 판다.
 * @returns {{progress:object, applied:boolean, reason?:string}}
 */
export function applyPurchase(progress, product, receipt) {
  if (!product || !receipt || !receipt.ok) {
    return { progress, applied: false, reason: tr('영수증이 올바르지 않다') }
  }
  const purchases = Array.isArray(progress.purchases) ? [...progress.purchases] : []
  if (receipt.token && purchases.some((p) => p.token === receipt.token)) {
    return { progress, applied: false, reason: tr('이미 처리된 구매다') }
  }
  const grants = grantsOf(product)
  // 영구 상품을 데모 결제로 두 번 사는 건 뜻이 없다. 실제 영수증은 늘 기록한다 — 데모로 받았던 프리미엄을
  // 진짜로 산 사람의 영수증이 빠지면 reconcile 이 그 프리미엄을 모의로 보고 꺼 버린다.
  if (product.kind === 'once' && receipt.mock && ownsGrants(progress, grants)) {
    return { progress, applied: false, reason: tr('이미 가진 상품이다') }
  }

  purchases.push({
    productId: product.id,
    sku: product.sku,
    token: receipt.token,
    mock: !!receipt.mock,
    at: Date.now(),
  })

  return { progress: applyGrants({ ...progress, purchases }, grants), applied: true }
}

/** 이 토큰의 영수증이 이미 진행도에 있나 — 있으면 지급은 끝났고 소모·승인만 남았을 수 있다 */
export function hasReceipt(progress, token) {
  return !!token && Array.isArray(progress && progress.purchases) && progress.purchases.some((p) => p.token === token)
}

/**
 * 영수증 묶음을 진행도에 넣고, **저장된 것만** 결제 쪽에 '끝났다'고 알린다(소모품은 소모, 영구 상품은 승인).
 *
 * 순서가 이 함수의 전부다 — **지급 → 저장 → 소모.** 전에는 안드로이드 브리지가 소모를 먼저 했다(W 에서 고쳤다).
 * 그 사이 렌더러나 앱이 죽으면 캣닢은 소모돼 Play 의 구매 목록에서 빠지고 지급은 안 된 채로 남는다 —
 * **산 캣닢이 영영 사라진다.** 지금 순서면 어디서 끊겨도 둘 중 하나다: 아직 소모 전이라 다음 복원에서 다시 오거나,
 * 이미 저장돼 있어 토큰 기록이 두 번 지급을 막거나.
 *
 * - 이미 처리된 토큰(중복)도 끝낸다 — 지급은 저장됐는데 소모만 못 한 구매가 그렇게 남는다
 * - 저장이 실패하면(용량 초과·시크릿 모드) **아무것도 끝내지 않는다** — 소모해 버리면 다음 실행에서 지급이 없다
 * - 모르는 상품(sku)은 넣지도 끝내지도 않는다 — 소모하면 되돌릴 수 없다. 다음 버전이 알아보게 남긴다
 *
 * @param {object} progress
 * @param {Array<object>} receipts  브리지가 준 영수증 — { sku, token, orderId? } (결제 한 건이면 한 칸짜리)
 * @param {{ persist?: (progress: object) => boolean, finish?: (receipt: object) => void }} [io]
 * @returns {{ progress: object, granted: Array<{product: object, receipt: object}>,
 *             skipped: Array<{receipt: object, reason: string}>, finished: number, saved: boolean }}
 */
export function takeReceipts(progress, receipts, { persist = null, finish = null } = {}) {
  let next = progress
  const granted = []
  const skipped = []
  const settle = []
  for (const r of receipts || []) {
    if (!r || typeof r !== 'object') continue
    const product = IAP_PRODUCTS.find((pr) => pr.sku === r.sku)
    if (!product) { skipped.push({ receipt: r, reason: tr('모르는 상품이다') }); continue }
    const receipt = { ok: true, mock: false, ...r }
    const res = applyPurchase(next, product, receipt)
    if (res.applied) {
      next = res.progress
      granted.push({ product, receipt })
      settle.push(receipt)
    } else {
      skipped.push({ receipt, reason: res.reason })
      if (hasReceipt(next, receipt.token)) settle.push(receipt)   // 지급은 됐다 — 소모·승인만 남았을 수 있다
    }
  }
  if (!settle.length) return { progress: next, granted, skipped, finished: 0, saved: true }
  const saved = !!(persist && persist(next))
  let finished = 0
  if (saved && finish) {
    for (const r of settle) {
      try { finish(r); finished += 1 } catch { /* 한 건이 실패해도 나머지는 끝낸다 — 못 끝낸 건 다음 복원에서 다시 온다 */ }
    }
  }
  return { progress: next, granted, skipped, finished, saved }
}

/**
 * 모의 영수증 격리 — 실제 결제 환경(Google Play 가 설정된 APK)에서는 데모 결제로 받은 영구 자격
 * (프리미엄 · 3막 · 도전 팩 · 스킨 팩의 스킨)이 효력을 잃는다. 웹에서 '데모 결제'로 누른 것을 APK 로
 * 옮겨 와 진짜 구매처럼 누리면 안 된다.
 *
 * 하지 않는 것: 모의 영수증을 지우지 않는다(토큰 중복 방지 기록이다). 캣닢을 회수하지 않는다 — 쓴/번 캣닢과
 * 구분이 안 되고, addCatnip 의 0 하한 때문에 회수가 정당한 캣닢까지 조용히 없앨 수 있으며, 그때 상점이
 * '데모 결제 (실제 청구 없음)' 이라고 적어 놓고 준 유한한 양이다. 펫도 회수하지 않는다 — 캣닢으로도 사는 것이라
 * 어느 쪽인지 알 수 없다. 캣닢으로 산 스킨(영수증에 없는 스킨)은 그대로다.
 *
 * @returns {{ progress: object, changed: boolean, reason: string|null }}
 */
export function reconcilePurchases(progress, provider) {
  if (!progress || !provider || !provider.isReal) return { progress, changed: false, reason: null }
  const purchases = Array.isArray(progress.purchases) ? progress.purchases : []
  const real = grantsFromReceipts(IAP_PRODUCTS, purchases.filter((p) => !p.mock))
  const mock = grantsFromReceipts(IAP_PRODUCTS, purchases.filter((p) => p.mock))
  const keep = (list, realList, mockList) => list.filter((x) => realList.includes(x) || !mockList.includes(x))

  const unlocks = progress.unlocks || { acts: [], packs: [] }
  const skins = progress.skins || { owned: [], equipped: {} }
  const next = {
    ...progress,
    premium: !!progress.premium && (real.premium || !mock.premium),
    unlocks: { acts: keep(unlocks.acts || [], real.acts, mock.acts), packs: keep(unlocks.packs || [], real.packs, mock.packs) },
    skins: { owned: keep(skins.owned || [], real.skins, mock.skins), equipped: { ...(skins.equipped || {}) } },
  }
  for (const [towerId, skinId] of Object.entries(next.skins.equipped)) {
    if (!next.skins.owned.includes(skinId)) delete next.skins.equipped[towerId]
  }
  const changed = next.premium !== !!progress.premium
    || next.unlocks.acts.length !== (unlocks.acts || []).length
    || next.unlocks.packs.length !== (unlocks.packs || []).length
    || next.skins.owned.length !== (skins.owned || []).length
  if (!changed) return { progress, changed: false, reason: null }
  return {
    progress: next,
    changed: true,
    reason: tr('데모 결제로 받은 프리미엄·콘텐츠·스킨은 실제 결제 환경에서 사라졌다 · 구매 복원을 눌러 보세요'),
  }
}
