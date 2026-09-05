import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FREE_ACTS, GRANT_KEYS, hasAct, hasPack, ownsSkin, ownsGrants, applyGrants, grantsFromReceipts,
} from '../../web/js/domain/entitlements.js'
import { defaultProgress } from '../../web/js/domain/save.js'
import { IAP_PRODUCTS } from '../../web/js/domain/shop.js'

test('자격: 1·2막과 팩 없는 도전은 늘 열려 있고, 3막·팩은 unlocks 에 있어야 한다', () => {
  const p = defaultProgress()
  assert.deepEqual(FREE_ACTS, [1, 2])
  assert.equal(hasAct(p, 1), true); assert.equal(hasAct(p, 2), true); assert.equal(hasAct(p, 3), false)
  assert.equal(hasAct(null, 1), true); assert.equal(hasAct(null, 3), false)
  assert.equal(hasPack(p, undefined), true); assert.equal(hasPack(p, 'challenges2'), false)
  assert.equal(hasAct({ ...p, unlocks: { acts: [3], packs: [] } }, 3), true)
  assert.equal(hasPack({ ...p, unlocks: { acts: [], packs: ['challenges2'] } }, 'challenges2'), true)
  assert.equal(ownsSkin(p, 'cheese-golden'), false)
})

test('applyGrants: 캣닢은 더하고 나머지는 집합에 넣으며 두 번 넣어도 하나다', () => {
  const p = defaultProgress()
  const once = applyGrants(p, { catnip: 100, premium: true, act: 3, pack: 'challenges2', skins: ['a', 'b'], pet: 'owl' })
  assert.equal(once.catnip, p.catnip + 100)
  assert.equal(once.premium, true)
  assert.deepEqual(once.unlocks, { acts: [3], packs: ['challenges2'] })
  assert.deepEqual(once.skins.owned, ['a', 'b'])
  assert.ok(once.pets.owned.includes('owl'))
  assert.equal(once.pets.equipped, p.pets.equipped)
  const twice = applyGrants(once, { act: 3, pack: 'challenges2', skins: ['a'], pet: 'owl' })
  assert.deepEqual(twice.unlocks, { acts: [3], packs: ['challenges2'] })
  assert.deepEqual(twice.skins.owned, ['a', 'b'])
  assert.equal(twice.pets.owned.filter((x) => x === 'owl').length, 1)
  assert.equal(p.premium, false, '원본 불변')
  assert.equal(applyGrants(p, null), p)
})

test('ownsGrants: 영구 자격을 전부 가졌을 때만 참, 소모품만 있는 grants 는 거짓', () => {
  const p = applyGrants(defaultProgress(), { act: 3, skins: ['a'] })
  assert.equal(ownsGrants(p, { act: 3 }), true)
  assert.equal(ownsGrants(p, { act: 3, skins: ['a', 'b'] }), false)
  assert.equal(ownsGrants(p, { catnip: 100 }), false)
  assert.equal(ownsGrants(p, null), false)
})

test('grantsFromReceipts: 카탈로그의 sku 로 영수증을 자격으로 바꾼다 (소모품은 안 센다)', () => {
  const g = grantsFromReceipts(IAP_PRODUCTS, [
    { sku: 'story_act3' }, { sku: 'catnip_100' }, { productId: 'skins1' }, { sku: 'premium_pack' }, { sku: 'story_act3' }, { sku: '없음' },
  ])
  assert.deepEqual(g, { premium: true, acts: [3], packs: [], skins: ['calico-blossom', 'siamese-snow', 'chonk-mint'], pets: [] })
  assert.deepEqual(grantsFromReceipts(IAP_PRODUCTS, []), { premium: false, acts: [], packs: [], skins: [], pets: [] })
  assert.ok(GRANT_KEYS.includes('pet'))
})
