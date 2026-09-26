import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MockBillingProvider, AndroidBillingProvider, DisabledBillingProvider, detectBilling, applyPurchase, reconcilePurchases, BillingError,
  takeReceipts, hasReceipt,
} from '../../web/js/domain/billing.js'
import { iapProduct, IAP_PRODUCTS } from '../../web/js/domain/shop.js'
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

// ───────────────────────────── 자격(grants) 적용과 격리 일반화

const buy = (progress, id, over = {}) => applyPurchase(progress, iapProduct(id), { ok: true, token: `${id}-${over.mock ? 'mock' : 'play'}-${Math.random()}`, mock: false, ...over })

test('applyPurchase: 3막·도전 팩·스킨 팩·스타터 팩의 grants 가 진행도에 들어간다', () => {
  let p = buy(defaultProgress(), 'act3').progress
  assert.deepEqual(p.unlocks.acts, [3])
  p = buy(p, 'challenges2').progress
  assert.deepEqual(p.unlocks.packs, ['challenges2'])
  p = buy(p, 'skins1').progress
  assert.deepEqual(p.skins.owned, ['calico-blossom', 'siamese-snow', 'chonk-mint'])
  const catnipBefore = p.catnip
  p = buy(p, 'starter').progress
  assert.equal(p.catnip, catnipBefore + 300)
  assert.ok(p.pets.owned.includes('owl'))
  assert.ok(p.skins.owned.includes('cheese-golden'))
  assert.equal(p.pets.equipped, defaultProgress().pets.equipped, '펫 장착은 안 바꾼다')
})

test('applyPurchase: 영구 상품은 데모로 두 번 못 사지만, 실제 영수증은 이미 가졌어도 기록한다', () => {
  const demo = buy(defaultProgress(), 'act3', { mock: true })
  assert.equal(demo.applied, true)
  const again = buy(demo.progress, 'act3', { mock: true })
  assert.equal(again.applied, false)
  assert.match(again.reason, /이미 가진/)
  const realAfterDemo = buy(demo.progress, 'act3')
  assert.equal(realAfterDemo.applied, true, '데모로 가진 뒤 진짜로 사면 영수증이 남아야 한다')
  assert.equal(realAfterDemo.progress.purchases.filter((r) => r.sku === 'story_act3').length, 2)
  assert.deepEqual(realAfterDemo.progress.unlocks.acts, [3], '자격은 한 번만')
  // 소모품은 몇 번이든
  const c1 = buy(defaultProgress(), 'catnip_small', { mock: true }).progress
  assert.equal(buy(c1, 'catnip_small', { mock: true }).applied, true)
})

test('reconcilePurchases: 실제 환경에서 모의 영수증의 3막·팩·스킨은 사라지고, 실제 영수증·캣닢으로 산 스킨·펫·캣닢은 남는다', () => {
  let p = buy(defaultProgress(), 'act3', { mock: true }).progress
  p = buy(p, 'skins1', { mock: true }).progress
  p = buy(p, 'challenges2').progress                       // 실제
  p = buy(p, 'starter', { mock: true }).progress           // 캣닢 300 · 펫 owl · cheese-golden (모의)
  p = { ...p, skins: { owned: [...p.skins.owned, 'sphynx-obsidian'], equipped: { cheese: 'cheese-golden', sphynx: 'sphynx-obsidian' } } }
  const catnip = p.catnip
  const r = reconcilePurchases(p, real)
  assert.equal(r.changed, true)
  assert.deepEqual(r.progress.unlocks, { acts: [], packs: ['challenges2'] })
  assert.deepEqual(r.progress.skins.owned, ['sphynx-obsidian'], '캣닢으로 산 스킨만 남는다')
  assert.deepEqual(r.progress.skins.equipped, { sphynx: 'sphynx-obsidian' }, '잃은 스킨은 벗긴다')
  assert.equal(r.progress.catnip, catnip, '캣닢은 회수하지 않는다')
  assert.ok(r.progress.pets.owned.includes('owl'), '펫은 회수하지 않는다')
  assert.equal(r.progress.purchases.length, p.purchases.length, '영수증은 남긴다')
  assert.equal(reconcilePurchases(r.progress, real).changed, false, '멱등')
  assert.equal(reconcilePurchases(p, demo).changed, false, '데모 제공자는 안 건드린다')
})

// ───────────────────────────── 새 브리지 — 비동기 계약 (BillingBridge.kt · U-2)

/** 답을 다음 틱에 window.CatpawBillingCallbacks 로 되부르는 대역 */
class FakeAsyncBridge {
  constructor({ state = 'ready', answer = null, restoreList = null } = {}) {
    this.state = state
    this.answer = answer
    this.restoreList = restoreList
    this.catalog = null
    this.calls = []
  }
  configure(json) { this.catalog = JSON.parse(json) }
  describe() {
    return JSON.stringify({ configured: this.state === 'ready', label: 'Google Play 결제', state: this.state, prices: { catnip_100: '₩1,300' } })
  }
  purchase() { return JSON.stringify({ ok: false, code: 'use_async' }) }
  purchaseAsync(id, sku) {
    this.calls.push(sku)
    if (this.answer === 'never') return
    const res = this.answer || { ok: true, sku, token: `play-${sku}`, orderId: 'GPA.1' }
    setTimeout(() => globalThis.CatpawBillingCallbacks.deliver(id, JSON.stringify(res)), 0)
  }
  restoreAsync(id) {
    const list = this.restoreList || [{ sku: 'premium_pack', token: 'play-restore' }]
    setTimeout(() => globalThis.CatpawBillingCallbacks.deliver(id, JSON.stringify(list)), 0)
  }
}

test('비동기 브리지: 상품 목록을 브리지에 넘긴다 — shop.js 가 단 하나의 출처다', () => {
  const bridge = new FakeAsyncBridge()
  new AndroidBillingProvider(bridge)
  assert.deepEqual(bridge.catalog.map((c) => c.sku), IAP_PRODUCTS.map((p) => p.sku))
  const consumable = bridge.catalog.filter((c) => c.consumable).map((c) => c.sku)
  assert.deepEqual(consumable, IAP_PRODUCTS.filter((p) => p.kind === 'consumable').map((p) => p.sku))
  assert.ok(consumable.length >= 2 && consumable.every((s) => /^catnip_/.test(s)), '소모품은 캣닢 팩뿐이어야 한다')
})

test('비동기 브리지: 결제 성공이 요청 id 로 돌아오고 영수증은 mock 이 아니다', async () => {
  const bridge = new FakeAsyncBridge()
  const receipt = await new AndroidBillingProvider(bridge).purchase(iapProduct('catnip_large'))
  assert.equal(receipt.ok, true)
  assert.equal(receipt.mock, false)
  assert.equal(receipt.token, 'play-catnip_600')
  assert.equal(receipt.orderId, 'GPA.1')
  assert.deepEqual(bridge.calls, ['catnip_600'])
})

test('비동기 브리지: 취소·승인 대기·이미 보유·미설정은 코드와 사람 말로 던진다', async () => {
  const cases = [
    ['user_canceled', /취소/], ['pending', /대기/], ['already_owned', /복원/], ['not_configured', /Play/], ['not_available', /기기/],
  ]
  for (const [code, re] of cases) {
    const p = new AndroidBillingProvider(new FakeAsyncBridge({ answer: { ok: false, code, message: 'ITEM_UNAVAILABLE · debug' } }))
    await assert.rejects(() => p.purchase(iapProduct('premium')),
      (err) => err instanceof BillingError && err.code === code && re.test(err.message), `${code}: 코드나 문구가 다르다`)
  }
})

test('비동기 브리지: 답이 안 오면 시간 초과로 던진다 (버튼이 영영 안 풀리는 일이 없다)', async () => {
  const p = new AndroidBillingProvider(new FakeAsyncBridge({ answer: 'never' }), { timeoutMs: 20 })
  await assert.rejects(() => p.purchase(iapProduct('premium')), (err) => err instanceof BillingError && err.code === 'timeout')
})

test('비동기 브리지: 복원은 목록을 돌려주고, 상태는 부를 때마다 다시 읽는다', async () => {
  const bridge = new FakeAsyncBridge({ state: 'connecting' })
  const p = new AndroidBillingProvider(bridge)
  assert.equal(p.isReal, false, '연결 전에는 미설정이다')
  assert.match(p.label, /미설정/)
  bridge.state = 'ready'                       // Play 가 상품을 돌려준 뒤
  assert.equal(p.isReal, true, '상태를 생성 시점 값으로 굳히면 안 된다')
  assert.doesNotMatch(p.label, /미설정/)
  assert.deepEqual(await p.restore(), [{ sku: 'premium_pack', token: 'play-restore' }])
  assert.equal(p.prices.catnip_100, '₩1,300', 'Play 가 준 실제 가격을 화면에 낼 수 있어야 한다')
})

test('비동기 브리지: 준비 훅과 요청 없이 온 구매 훅이 불린다', () => {
  const p = new AndroidBillingProvider(new FakeAsyncBridge())
  const seen = { ready: 0, purchases: [] }
  p.onReady(() => { seen.ready += 1 })
  p.onPurchase((r) => seen.purchases.push(r.sku))
  globalThis.CatpawBillingCallbacks.onReady()
  globalThis.CatpawBillingCallbacks.onPurchase(JSON.stringify({ ok: true, sku: 'story_act3', token: 'play-late' }))
  globalThis.CatpawBillingCallbacks.onPurchase(JSON.stringify({ ok: false, code: 'pending', sku: 'story_act3' }))   // 실패는 안 넘긴다
  globalThis.CatpawBillingCallbacks.onPurchase('{not json')
  assert.equal(seen.ready, 1)
  assert.deepEqual(seen.purchases, ['story_act3'])
})

test('옛 동기 브리지(purchaseAsync 없음)도 그대로 돈다', async () => {
  const receipt = await new AndroidBillingProvider(new FakeBridge()).purchase(iapProduct('catnip_small'))
  assert.equal(receipt.token, 'play-catnip_100')
})

// ───────────────────────────── 지급 → 저장 → 소모 (W)
//
// 전에는 안드로이드 브리지가 소모를 먼저 했다. 그 사이 렌더러·앱이 죽으면 캣닢은 소모돼 Play 의 구매 목록에서
// 사라지고 지급은 안 된 채였다 — 산 캣닢이 영영 없어지는 길. 이 검사들이 순서를 못 박는다.

/** 기록기 — persist·finish 가 어떤 순서로 불렸는지 남긴다 */
function recorder({ saveOk = true } = {}) {
  const log = []
  return {
    log,
    io: {
      persist: (p) => { log.push(['persist', (p.purchases || []).length]); return saveOk },
      finish: (r) => { log.push(['finish', r.token]) },
    },
  }
}

test('takeReceipts: 지급하고, 한 번 저장하고, 저장한 뒤에만 끝낸다(소모·승인)', () => {
  const { log, io } = recorder()
  const base = defaultProgress()
  const res = takeReceipts(base, [
    { sku: 'catnip_100', token: 'play-a', orderId: 'GPA.1' },
    { sku: 'premium_pack', token: 'play-b' },
  ], io)
  assert.equal(res.granted.length, 2)
  assert.equal(res.saved, true)
  assert.equal(res.finished, 2)
  assert.equal(res.progress.catnip, base.catnip + 100)
  assert.equal(res.progress.premium, true)
  assert.deepEqual(log, [['persist', 2], ['finish', 'play-a'], ['finish', 'play-b']], '저장이 먼저, 한 번만')
  assert.equal(base.catnip, defaultProgress().catnip, '원본은 그대로')
  assert.ok(res.progress.purchases.every((r) => r.mock === false), '브리지 영수증은 실제 영수증이다')
})

test('takeReceipts: 저장이 실패하면 아무것도 끝내지 않는다 — 소모해 버리면 다음 실행에서 지급이 없다', () => {
  const { log, io } = recorder({ saveOk: false })
  const res = takeReceipts(defaultProgress(), [{ sku: 'catnip_600', token: 'play-c' }], io)
  assert.equal(res.saved, false)
  assert.equal(res.finished, 0)
  assert.deepEqual(log, [['persist', 1]])
  assert.equal(res.granted.length, 1, '메모리 안의 지급은 된다 — 저장만 못 했다')
})

test('takeReceipts: 이미 넣은 토큰은 두 번 주지 않고, 끝내기만 한다 (지급은 됐는데 소모를 못 한 구매)', () => {
  const first = takeReceipts(defaultProgress(), [{ sku: 'catnip_100', token: 'play-d' }], { persist: () => true })
  assert.ok(hasReceipt(first.progress, 'play-d'))
  const { log, io } = recorder()
  const again = takeReceipts(first.progress, [{ sku: 'catnip_100', token: 'play-d' }], io)
  assert.equal(again.granted.length, 0)
  assert.equal(again.progress.catnip, first.progress.catnip, '두 번 지급하지 않는다')
  assert.deepEqual(log, [['persist', 1], ['finish', 'play-d']], '저장을 확인하고 끝낸다')
  assert.match(again.skipped[0].reason, /이미 처리/)
})

test('takeReceipts: 모르는 상품·빈 영수증은 넣지도 끝내지도 않는다 (소모는 되돌릴 수 없다)', () => {
  const { log, io } = recorder()
  const res = takeReceipts(defaultProgress(), [null, 'x', { sku: 'mystery_box', token: 'play-e' }], io)
  assert.equal(res.granted.length, 0)
  assert.equal(res.finished, 0)
  assert.deepEqual(log, [], '저장할 것도 끝낼 것도 없다')
  assert.match(res.skipped[0].reason, /모르는 상품/)
})

test('takeReceipts: 결제 직후 앱이 죽어도 캣닢을 잃지 않는다 — 다음 복원에서 한 번만 들어온다', () => {
  // 1) Play 가 결제를 끝냈다. 브리지는 승인만 하고 소모하지 않는다(BillingBridge.kt 의 handOut).
  const play = new Map([['play-f', { sku: 'catnip_600', token: 'play-f', consumed: false }]])
  const finish = (r) => { const x = play.get(r.token); if (x) x.consumed = true }
  // 2) 영수증이 웹에 닿기 전에 렌더러가 죽었다 — 진행도에는 아무것도 없다.
  const saved = defaultProgress()
  // 3) 다시 뜬 앱이 조용한 복원을 한다: Play 에 소모 안 된 구매가 그대로 있다.
  const pending = [...play.values()].filter((x) => !x.consumed).map(({ sku, token }) => ({ sku, token }))
  assert.equal(pending.length, 1, '소모 전이라 구매 목록에 남아 있어야 한다')
  let stored = null
  const res = takeReceipts(saved, pending, { persist: (p) => { stored = p; return true }, finish })
  assert.equal(res.granted.length, 1)
  assert.equal(stored.catnip, saved.catnip + 600, '저장된 진행도에 캣닢이 있다')
  assert.equal(play.get('play-f').consumed, true, '저장한 뒤에 소모됐다')
  // 4) 한 번 더 복원해도(두 길로 불린다) 두 번 들어오지 않는다
  const again = takeReceipts(stored, [{ sku: 'catnip_600', token: 'play-f' }], { persist: () => true, finish })
  assert.equal(again.granted.length, 0)
  assert.equal(again.progress.catnip, stored.catnip)
})

test('finish: 실제 영수증만 브리지에 넘긴다 — 모의 영수증·옛 브리지는 아무것도 안 한다', () => {
  const calls = []
  const bridge = Object.assign(new FakeAsyncBridge(), { finish: (t) => calls.push(t) })
  const p = new AndroidBillingProvider(bridge)
  p.finish({ token: 'play-g', sku: 'catnip_100' })
  p.finish({ token: 'mock-h', sku: 'catnip_100', mock: true })
  p.finish(null)
  p.finish({ sku: 'catnip_100' })
  assert.deepEqual(calls, ['play-g'])
  // 옛 브리지(finish 가 없다)는 스스로 소모한다 — 던지지 않고 넘어간다
  assert.doesNotThrow(() => new AndroidBillingProvider(new FakeAsyncBridge()).finish({ token: 'play-i' }))
  // 데모·데모 빌드 제공자에도 있다 — 호출부가 제공자 종류를 가리지 않게
  assert.doesNotThrow(() => new MockBillingProvider().finish({ token: 'mock-j', mock: true }))
  assert.doesNotThrow(() => new DisabledBillingProvider().finish())
})
