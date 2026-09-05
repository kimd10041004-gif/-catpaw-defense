import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MockBillingProvider, AndroidBillingProvider, detectBilling, applyPurchase, reconcilePurchases, BillingError,
} from '../../web/js/domain/billing.js'
import { iapProduct } from '../../web/js/domain/shop.js'
import { defaultProgress } from '../../web/js/domain/save.js'

/** 안드로이드가 주입하는 브리지의 대역 */
class FakeBridge {
  constructor({ configured = true, ok = true, message = '' } = {}) {
    this.configured = configured
    this.ok = ok
    this.message = message
    this.calls = []
  }
  describe() { return JSON.stringify({ configured: this.configured, label: 'Google Play 결제' }) }
  purchase(sku) {
    this.calls.push(sku)
    return JSON.stringify(this.ok
      ? { ok: true, token: `play-${sku}` }
      : { ok: false, code: 'not_configured', message: this.message })
  }
  restore() { return JSON.stringify([{ sku: 'premium_pack', token: 'play-restore' }]) }
}

test('detectBilling: 브리지가 없으면 데모 제공자를 고른다', () => {
  const p = detectBilling({})
  assert.equal(p.id, 'mock')
  assert.equal(p.isReal, false)
  assert.match(p.label, /데모/)
})

test('detectBilling: 안드로이드 브리지가 있으면 그것을 쓴다', () => {
  const p = detectBilling({ CatpawBilling: new FakeBridge() })
  assert.equal(p.id, 'android')
  assert.equal(p.isReal, true)
})

test('AndroidBillingProvider: 미설정 상태를 숨기지 않고 라벨에 드러낸다', () => {
  const p = new AndroidBillingProvider(new FakeBridge({ configured: false }))
  assert.equal(p.isReal, false)
  assert.match(p.label, /미설정/)
})

test('MockBillingProvider: 영수증에 mock 표시가 남아 진짜 결제인 척하지 않는다', async () => {
  const receipt = await new MockBillingProvider().purchase(iapProduct('catnip_small'))
  assert.equal(receipt.ok, true)
  assert.equal(receipt.mock, true)
  assert.equal(receipt.sku, 'catnip_100')
})

test('MockBillingProvider: 상품이 없으면 BillingError를 던진다', async () => {
  await assert.rejects(() => new MockBillingProvider().purchase(null), BillingError)
})

test('AndroidBillingProvider: 결제가 실패하면 코드와 메시지를 담아 던진다', async () => {
  const p = new AndroidBillingProvider(new FakeBridge({ ok: false, message: '결제가 설정되지 않았습니다' }))
  await assert.rejects(
    () => p.purchase(iapProduct('premium')),
    (err) => err instanceof BillingError && err.code === 'not_configured',
  )
})

test('AndroidBillingProvider: 성공하면 mock이 아닌 영수증을 준다', async () => {
  const bridge = new FakeBridge()
  const receipt = await new AndroidBillingProvider(bridge).purchase(iapProduct('catnip_large'))
  assert.equal(receipt.mock, false)
  assert.equal(receipt.token, 'play-catnip_600')
  assert.deepEqual(bridge.calls, ['catnip_600'])
})

test('applyPurchase: 캣닢 상품은 캣닢을 더한다', () => {
  const base = defaultProgress()
  const { progress, applied } = applyPurchase(base, iapProduct('catnip_small'),
    { ok: true, token: 't1', mock: true })
  assert.equal(applied, true)
  assert.equal(progress.catnip, base.catnip + 100)
  assert.equal(progress.purchases.length, 1)
})

test('applyPurchase: 프리미엄 팩은 영구 혜택을 켠다', () => {
  const { progress } = applyPurchase(defaultProgress(), iapProduct('premium'),
    { ok: true, token: 't2', mock: false })
  assert.equal(progress.premium, true)
})

test('applyPurchase: 같은 영수증을 두 번 적용하지 않는다 (중복 지급 방지)', () => {
  const first = applyPurchase(defaultProgress(), iapProduct('catnip_small'), { ok: true, token: 'same' })
  const second = applyPurchase(first.progress, iapProduct('catnip_small'), { ok: true, token: 'same' })
  assert.equal(second.applied, false)
  assert.match(second.reason, /이미 처리/)
  assert.equal(second.progress.catnip, first.progress.catnip)
})

test('applyPurchase: 유효하지 않은 영수증은 아무것도 바꾸지 않는다', () => {
  const base = defaultProgress()
  assert.equal(applyPurchase(base, iapProduct('premium'), { ok: false }).applied, false)
  assert.equal(applyPurchase(base, null, { ok: true, token: 'x' }).applied, false)
  assert.equal(base.premium, false)
})

test('applyPurchase: 원본 진행도를 변경하지 않는다', () => {
  const base = defaultProgress()
  applyPurchase(base, iapProduct('premium'), { ok: true, token: 't3' })
  assert.equal(base.premium, false)
  assert.equal(base.purchases.length, 0)
})

// ───────────────────────────── 모의 영수증 격리

const premium = () => iapProduct('premium')
const withMockPremium = () => applyPurchase(defaultProgress(), premium(), { ok: true, token: 'mock-p', mock: true }).progress
const real = { isReal: true }
const demo = { isReal: false }

test('reconcilePurchases: 실제 결제 환경에서는 데모 결제로 받은 프리미엄이 꺼진다 (캣닢·영수증은 그대로)', () => {
  const p = withMockPremium()
  assert.equal(p.premium, true)
  const r = reconcilePurchases(p, real)
  assert.equal(r.changed, true)
  assert.equal(r.progress.premium, false)
  assert.match(r.reason, /데모 결제/)
  assert.equal(r.progress.catnip, p.catnip, '캣닢은 회수하지 않는다')
  assert.deepEqual(r.progress.purchases, p.purchases, '영수증은 토큰 중복 방지 기록이라 남긴다')
})

test('reconcilePurchases: 실제 프리미엄 영수증이 있으면 모의 영수증이 섞여 있어도 유지된다', () => {
  const p = applyPurchase(withMockPremium(), premium(), { ok: true, token: 'play-p', mock: false }).progress
  const r = reconcilePurchases(p, real)
  assert.equal(r.changed, false)
  assert.equal(r.progress.premium, true)
})

test('reconcilePurchases: 데모 제공자에서는 아무것도 바꾸지 않는다 (웹에서는 데모 프리미엄이 그대로 논다)', () => {
  const p = withMockPremium()
  const r = reconcilePurchases(p, demo)
  assert.equal(r.changed, false)
  assert.equal(r.progress, p)
})

test('reconcilePurchases: 프리미엄이 아닌 모의 캣닢 구매는 건드리지 않고, 멱등이며, 원본을 바꾸지 않는다', () => {
  const catnipOnly = applyPurchase(defaultProgress(), iapProduct('catnip_small'), { ok: true, token: 'mock-c', mock: true }).progress
  assert.equal(reconcilePurchases(catnipOnly, real).changed, false)
  const p = withMockPremium()
  const once = reconcilePurchases(p, real)
  const twice = reconcilePurchases(once.progress, real)
  assert.equal(twice.changed, false)
  assert.deepEqual(twice.progress, once.progress)
  assert.equal(p.premium, true, '원본 불변')
  assert.equal(reconcilePurchases(null, real).changed, false)
})
