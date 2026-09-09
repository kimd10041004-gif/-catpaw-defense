import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GROWTH_MAX, GROWTH_COST, growthRank, growthCost, growthMods, canTrain, train, totalGrowthCost, totalRanks,
} from '../../web/js/domain/growth.js'
import { defaultProgress } from '../../web/js/domain/save.js'
import { combineMods, MODS_CAP } from '../../web/js/domain/mods.js'

const rich = (catnip = 10000, over = {}) => ({ ...defaultProgress(), catnip, ...over })
/** 그 고양이를 해금한 진행도 — 훈련은 **가진 고양이만** 된다(canTrain → ownsCat). */
const owning = (id, catnip = 10000, over = {}) => rich(catnip, { unlockedTowers: [...defaultProgress().unlockedTowers, id], ...over })

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
  const r = train(owning('black', 1000, { premium: true }), 'black')
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
  const p = owning('siamese')
  const r = train(p, 'siamese')
  assert.equal(p.catnip, 10000)
  assert.deepEqual(p.growth, {})
  assert.equal(r.progress.growth.siamese, 1)
  assert.equal(growthRank({ growth: { cheese: 'x' } }, 'cheese'), 0)
  assert.equal(growthRank({ growth: { cheese: 7 } }, 'cheese'), GROWTH_MAX)
  assert.equal(growthRank(null, 'cheese'), 0)
  assert.equal(totalRanks({ growth: { a: 1, b: 3 } }), 4)
})

test('훈련: 아직 없는 고양이(카드 미보유)는 거부하고, 카드를 얻으면 열린다', () => {
  /* 도감은 카드 고양이 여섯을 늘 보여 준다(무엇을 노릴지 알아야 한다). 그 행의 훈련 버튼이 살아 있어서
   * **못 쓰는 고양이에 캣닢이 들어갔다.** 소유 판정은 expedition.ownsCat 하나이고 여기서 그걸 못 박는다. */
  const p = rich()
  assert.equal(canTrain(p, 'munchkin').ok, false)
  assert.match(canTrain(p, 'munchkin').reason, /카드/)
  const r = train(p, 'munchkin')
  assert.equal(r.ok, false)
  assert.equal(r.progress, p, '거부됐으면 캣닢도 안 빠진다')
  assert.equal(p.catnip, 10000)

  // 카드를 얻으면 열린다 — 해금된 고양이(치즈)는 처음부터 열려 있다
  const withCard = rich(10000, { cards: { owned: { munchkin: 1 }, shards: 0 } })
  assert.equal(canTrain(withCard, 'munchkin').ok, true)
  assert.equal(train(withCard, 'munchkin').progress.growth.munchkin, 1)
  assert.equal(canTrain(p, 'cheese').ok, true)

  // 시나리오 보상으로 해금된 고양이도 열린다
  assert.equal(canTrain(rich(10000, { unlockedTowers: ['cheese', 'siamese'] }), 'siamese').ok, true)
  // 진행도에 해금 목록이 없으면(시뮬레이터·검사) 전부 열려 있다 — 봇 숫자가 안 움직인다
  assert.equal(canTrain({ catnip: 999 }, 'munchkin').ok, true)
})
