/**
 * 필살기 성장(L-4) — 훈련 검사(growth.test)와 같은 모양으로 순수 함수를 못 박는다.
 *
 * 여기서 가장 중요한 단언은 마지막 둘이다: **단계 0 · 로드아웃 비어 있음에서 배수가 정확히 1 이고
 * 기본 로드아웃이 등록 순 앞 넷**이라는 것. 그래야 시뮬레이터·밸런스 검사(defaultProgress 로 돈다)의
 * 숫자가 한 톨도 안 움직인다 — 새 필살기를 등록해도.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SPECIAL_SLOTS, SPECIAL_RANK_MAX, SPECIAL_RANK_COST, SPECIAL_TREES,
  specialRank, specialRankCost, powerMul, cooldownMul, canUpgradeSpecial, upgradeSpecial,
  defaultLoadout, loadoutOf, toggleLoadout, moveInLoadout, totalSpecialGrowthCost, totalSpecialRanks,
} from '../../web/js/domain/specialGrowth.js'
import { defaultProgress } from '../../web/js/domain/save.js'

const rich = (catnip = 10000, over = {}) => ({ ...defaultProgress(), catnip, ...over })
const SIX = ['churu', 'nap', 'milk', 'goldenpaw', 'hiss', 'hairball']

test('필살기 성장: 트리마다 0→1→2→3 사다리, 최고 단계에서는 비용이 null 이고 더 못 올린다', () => {
  for (const tree of SPECIAL_TREES) {
    let p = rich()
    const costs = []
    for (let i = 0; i < SPECIAL_RANK_MAX; i += 1) {
      const r = upgradeSpecial(p, 'churu', tree)
      assert.equal(r.ok, true, `${tree} ${i}`)
      assert.equal(r.rank, i + 1)
      costs.push(r.cost)
      p = r.progress
    }
    assert.deepEqual(costs, SPECIAL_RANK_COST)
    assert.equal(specialRank(p, 'churu', tree), SPECIAL_RANK_MAX)
    assert.equal(specialRankCost(SPECIAL_RANK_MAX), null)
    const again = upgradeSpecial(p, 'churu', tree)
    assert.equal(again.ok, false)
    assert.match(again.reason, /최고/)
    assert.equal(again.progress, p, '못 올리면 원본 그대로')
    assert.equal(p.catnip, 10000 - SPECIAL_RANK_COST.reduce((a, b) => a + b, 0))
  }
})

test('필살기 성장: 두 트리는 서로 독립이고 다른 필살기의 단계를 건드리지 않는다', () => {
  let p = rich()
  p = upgradeSpecial(p, 'churu', 'power').progress
  p = upgradeSpecial(p, 'churu', 'power').progress
  p = upgradeSpecial(p, 'nap', 'cooldown').progress
  assert.equal(specialRank(p, 'churu', 'power'), 2)
  assert.equal(specialRank(p, 'churu', 'cooldown'), 0)
  assert.equal(specialRank(p, 'nap', 'cooldown'), 1)
  assert.equal(specialRank(p, 'nap', 'power'), 0)
  assert.equal(totalSpecialRanks(p), 3)
})

test('필살기 성장: 캣닢이 모자라면 거부하고 이유에 보유/비용을 적는다 · 모르는 트리는 거부', () => {
  const p = rich(39)
  const c = canUpgradeSpecial(p, 'churu', 'power')
  assert.equal(c.ok, false)
  assert.match(c.reason, /39\/40/)
  assert.equal(upgradeSpecial(p, 'churu', 'power').ok, false)
  assert.equal(canUpgradeSpecial(rich(40), 'churu', 'power').ok, true)
  assert.equal(canUpgradeSpecial(rich(), 'churu', 'range').ok, false)
})

test('필살기 성장: 프리미엄은 20% 할인이고 총 소비처는 6종 × 2트리 × 280 = 3,360 캣닢이다', () => {
  assert.equal(specialRankCost(0, { premium: true }), 32)
  assert.equal(specialRankCost(2, { premium: true }), 128)
  assert.equal(totalSpecialGrowthCost(6), 3360)
  assert.equal(totalSpecialGrowthCost(6, { premium: true }), 6 * 2 * (32 + 64 + 128))
  assert.equal(upgradeSpecial(rich(1000, { premium: true }), 'milk', 'cooldown').cost, 32)
})

test('필살기 성장: 배수 — 세기 +10%/단계, 쿨다운 −10%/단계(최저 0.7), 단계 0 은 정확히 1', () => {
  assert.equal(powerMul(0), 1)
  assert.equal(cooldownMul(0), 1)
  assert.ok(Math.abs(powerMul(2) - 1.2) < 1e-12)
  assert.ok(Math.abs(powerMul(SPECIAL_RANK_MAX) - 1.3) < 1e-12)
  assert.ok(Math.abs(cooldownMul(1) - 0.9) < 1e-12)
  assert.ok(Math.abs(cooldownMul(SPECIAL_RANK_MAX) - 0.7) < 1e-12)
  assert.equal(powerMul(99), powerMul(SPECIAL_RANK_MAX), '단계는 상한으로 자른다')
  assert.equal(cooldownMul(-3), 1, '음수는 0 으로 읽는다')
  assert.equal(powerMul('x'), 1, '망가진 값은 0 단계다')
})

test('필살기 로드아웃: 기본은 등록 순 앞 넷이고, 비어 있거나 모르는 id 뿐이면 기본으로 떨어진다', () => {
  assert.deepEqual(defaultLoadout(SIX), SIX.slice(0, SPECIAL_SLOTS))
  assert.deepEqual(loadoutOf(defaultProgress(), SIX), SIX.slice(0, 4), '빈 로드아웃 = 기본')
  assert.deepEqual(loadoutOf({ specials: { loadout: ['ghost', 'nope'] } }, SIX), SIX.slice(0, 4), '모르는 id 만 있으면 기본')
  assert.deepEqual(loadoutOf({ specials: { loadout: ['hiss', 'ghost', 'churu', 'hiss'] } }, SIX), ['hiss', 'churu'],
    '모르는 것은 빠지고 중복은 하나만 — 슬롯보다 적어도 그대로')
  assert.deepEqual(loadoutOf({ specials: { loadout: SIX } }, SIX), SIX.slice(0, 4), '슬롯보다 많으면 앞에서 자른다')
  assert.deepEqual(loadoutOf(null, SIX), SIX.slice(0, 4))
  // 객체 목록(listSpecials 결과)도 받는다
  assert.deepEqual(defaultLoadout(SIX.map((id) => ({ id }))), SIX.slice(0, 4))
})

test('필살기 로드아웃: 토글 — 꽉 차면 못 넣고, 마지막 하나는 못 빼고, 모르는 id 는 거부', () => {
  let p = defaultProgress()
  let r = toggleLoadout(p, 'hiss', SIX)
  assert.equal(r.ok, false, '넷이 꽉 찼는데 다섯째가 들어갔다')
  assert.match(r.reason, /하나를 빼야/)
  r = toggleLoadout(p, 'nap', SIX)
  assert.equal(r.ok, true)
  assert.deepEqual(r.loadout, ['churu', 'milk', 'goldenpaw'])
  p = r.progress
  r = toggleLoadout(p, 'hiss', SIX)
  assert.equal(r.ok, true)
  assert.deepEqual(r.loadout, ['churu', 'milk', 'goldenpaw', 'hiss'])
  p = r.progress
  for (const id of ['churu', 'milk', 'goldenpaw']) p = toggleLoadout(p, id, SIX).progress
  assert.deepEqual(loadoutOf(p, SIX), ['hiss'])
  r = toggleLoadout(p, 'hiss', SIX)
  assert.equal(r.ok, false, '마지막 하나가 빠졌다')
  assert.equal(toggleLoadout(p, 'ghost', SIX).ok, false)
  assert.deepEqual(defaultProgress().specials, { loadout: [], ranks: {} }, '원본 진행도가 안 바뀐다')
})

test('필살기 로드아웃: 순서 이동 — 끝에서는 그대로, 가운데는 자리를 바꾼다', () => {
  const p = defaultProgress()
  assert.equal(moveInLoadout(p, 'churu', -1, SIX).ok, false, '맨 앞을 더 앞으로')
  assert.equal(moveInLoadout(p, 'goldenpaw', +1, SIX).ok, false, '맨 뒤를 더 뒤로')
  const r = moveInLoadout(p, 'milk', -1, SIX)
  assert.equal(r.ok, true)
  assert.deepEqual(r.loadout, ['churu', 'milk', 'nap', 'goldenpaw'])
  assert.deepEqual(loadoutOf(r.progress, SIX), ['churu', 'milk', 'nap', 'goldenpaw'])
  assert.equal(moveInLoadout(p, 'ghost', +1, SIX).ok, false)
})

test('필살기 성장: 원본 진행도를 바꾸지 않고, 망가진 값은 0 으로 읽는다', () => {
  const p = rich()
  const r = upgradeSpecial(p, 'nap', 'power')
  assert.equal(p.catnip, 10000)
  assert.deepEqual(p.specials, { loadout: [], ranks: {} })
  assert.equal(r.progress.specials.ranks.nap.power, 1)
  assert.equal(specialRank({ specials: { ranks: { nap: { power: 'x' } } } }, 'nap', 'power'), 0)
  assert.equal(specialRank({ specials: { ranks: { nap: { power: 9 } } } }, 'nap', 'power'), SPECIAL_RANK_MAX)
  assert.equal(specialRank(null, 'nap', 'power'), 0)
  assert.equal(totalSpecialRanks({ specials: { ranks: { a: { power: 1, cooldown: 3 }, b: { power: 2 } } } }), 6)
})
