import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROWTH_MAX, GROWTH_COST, growthRank, growthCost, growthMods, canTrain, train, totalGrowthCost, totalRanks,
} from '../../web/js/domain/growth.js'
import { defaultProgress } from '../../web/js/domain/save.js'
import { combineMods, MODS_CAP } from '../../web/js/domain/mods.js'

const rich = (catnip = 10000, over = {}) => ({ ...defaultProgress(), catnip, ...over })

test('훈련: 0→1→2→3 사다리, 최고 단계에서는 비용이 null 이고 더 못 올린다', () => {
  let p = rich()
  const costs = []
  for (let i = 0; i < GROWTH_MAX; i += 1) {
    const r = train(p, 'cheese')
    assert.equal(r.ok, true)
    assert.equal(r.rank, i + 1)
    costs.push(r.cost)
    p = r.progress
  }
  assert.deepEqual(costs, GROWTH_COST)
  assert.equal(growthRank(p, 'cheese'), GROWTH_MAX)
  assert.equal(growthCost(GROWTH_MAX), null)
  const again = train(p, 'cheese')
  assert.equal(again.ok, false)
  assert.match(again.reason, /최고/)
  assert.equal(again.progress, p, '못 올리면 원본 그대로')
  assert.equal(p.catnip, 10000 - GROWTH_COST.reduce((a, b) => a + b, 0))
})

test('훈련: 캣닢이 모자라면 거부하고 이유에 보유/비용을 적는다', () => {
  const p = rich(39)
  const c = canTrain(p, 'cheese')
  assert.equal(c.ok, false)
  assert.match(c.reason, /39\/40/)
  assert.equal(train(p, 'cheese').ok, false)
  assert.equal(canTrain(rich(40), 'cheese').ok, true)
})

test('훈련: 프리미엄은 20% 할인이고 총 소비처는 9마리 × 280 = 2,520 캣닢이다', () => {
  assert.equal(growthCost(0, { premium: true }), 32)
  assert.equal(growthCost(2, { premium: true }), 128)
  assert.equal(totalGrowthCost(9), 2520)
  assert.equal(totalGrowthCost(9, { premium: true }), 9 * (32 + 64 + 128))
  const r = train(rich(1000, { premium: true }), 'black')
  assert.equal(r.cost, 32)
})

test('훈련: 배수는 단계당 +5% 이고 combineMods 의 상한(2.5)을 넘지 못한다', () => {
  assert.deepEqual(growthMods(0), { damageMul: 1 })
  assert.equal(growthMods(2).damageMul, 1.1)
  assert.equal(growthMods(GROWTH_MAX).damageMul, 1.15)
  assert.equal(growthMods(99).damageMul, 1.15, '단계는 상한으로 자른다')
  const capped = combineMods({ damageMul: 2.4 }, growthMods(3))
  assert.equal(capped.damageMul, MODS_CAP.damageMul)
})

test('훈련: 원본 진행도를 바꾸지 않고, 망가진 값은 0 으로 읽는다', () => {
  const p = rich()
  const r = train(p, 'siamese')
  assert.equal(p.catnip, 10000)
  assert.deepEqual(p.growth, {})
  assert.equal(r.progress.growth.siamese, 1)
  assert.equal(growthRank({ growth: { cheese: 'x' } }, 'cheese'), 0)
  assert.equal(growthRank({ growth: { cheese: 7 } }, 'cheese'), GROWTH_MAX)
  assert.equal(growthRank(null, 'cheese'), 0)
  assert.equal(totalRanks({ growth: { a: 1, b: 3 } }), 4)
})
