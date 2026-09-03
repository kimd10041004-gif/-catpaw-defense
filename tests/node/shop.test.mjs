import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATNIP_ITEMS, IAP_PRODUCTS, catnipItem, iapProduct, availableItems,
  catnipMultiplier, startGoldBonus, canBuy,
  PREMIUM_BONUS_GOLD, PREMIUM_CATNIP_MULTIPLIER,
} from '../../web/js/domain/shop.js'

test('상품 정의: id가 중복되지 않고 필수 필드를 갖는다', () => {
  const ids = [...CATNIP_ITEMS, ...IAP_PRODUCTS].map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const i of CATNIP_ITEMS) {
    assert.equal(typeof i.name, 'string')
    assert.ok(i.cost > 0, `${i.id}의 가격`)
    assert.ok(['ingame', 'defeat'].includes(i.onlyWhen), `${i.id}의 onlyWhen`)
  }
  for (const p of IAP_PRODUCTS) {
    assert.equal(typeof p.sku, 'string')
    assert.equal(typeof p.priceLabel, 'string')
    assert.ok(p.catnip > 0 || p.permanent === true, `${p.id}는 캣닢이나 영구 혜택을 줘야 한다`)
  }
})

test('availableItems: 화면에 맞는 소모품만 준다', () => {
  const inGame = availableItems('ingame').map((i) => i.id)
  const onDefeat = availableItems('defeat').map((i) => i.id)
  assert.ok(inGame.includes('goldrush'))
  assert.equal(inGame.includes('revive'), false)
  assert.deepEqual(onDefeat, ['revive'])
})

test('catnipItem / iapProduct: 없는 id는 null을 준다', () => {
  assert.equal(catnipItem('goldrush').cost, 30)
  assert.equal(catnipItem('없음'), null)
  assert.equal(iapProduct('premium').permanent, true)
  assert.equal(iapProduct('없음'), null)
})

test('프리미엄: 구매하면 캣닢 배수와 시작 골드 보너스가 붙는다', () => {
  assert.equal(catnipMultiplier({ premium: false }), 1)
  assert.equal(catnipMultiplier({ premium: true }), PREMIUM_CATNIP_MULTIPLIER)
  assert.equal(startGoldBonus({ premium: false }), 0)
  assert.equal(startGoldBonus({ premium: true }), PREMIUM_BONUS_GOLD)
  assert.equal(catnipMultiplier(null), 1)
  assert.equal(startGoldBonus(null), 0)
})

test('canBuy: 캣닢이 모자라면 얼마가 부족한지 알려준다', () => {
  assert.equal(canBuy({ catnip: 100 }, 'goldrush').ok, true)
  assert.equal(canBuy({ catnip: 100 }, 'goldrush').remaining, 70)

  const poor = canBuy({ catnip: 5 }, 'goldrush')
  assert.equal(poor.ok, false)
  assert.match(poor.reason, /5\/30/)
})

test('canBuy: 없는 상품과 캣닢 필드가 없는 진행도를 안전하게 처리한다', () => {
  assert.equal(canBuy({ catnip: 999 }, '없음').ok, false)
  assert.equal(canBuy({}, 'goldrush').ok, false)
  assert.equal(canBuy(null, 'goldrush').ok, false)
})

test('과금 설계: 유료 상품이 게임 진행 자체를 막지 않는다 (편의만 판매)', () => {
  // 캣닢 소모품은 전부 '있으면 편한 것'이고, 타워나 맵을 파는 상품은 없어야 한다
  for (const p of IAP_PRODUCTS) {
    assert.equal(p.unlocksTower, undefined, `${p.id}가 타워를 팔면 안 된다`)
    assert.equal(p.unlocksMap, undefined, `${p.id}가 맵을 팔면 안 된다`)
  }
})
