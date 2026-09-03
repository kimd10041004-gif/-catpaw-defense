import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCost, upgradeCost, totalInvested, sellValue, canAfford, maxLevel,
  EconomyError, DEFAULT_REFUND_RATE,
} from '../../web/js/domain/economy.js'

/** 치즈냥과 같은 형태의 3레벨 타워 (건설 80 → 업글 60 → 업글 130) */
const def = {
  id: 'test',
  levels: [{ cost: 80 }, { cost: 60 }, { cost: 130 }],
}

test('maxLevel: levels 길이가 곧 최대 레벨이다', () => {
  assert.equal(maxLevel(def), 3)
})

test('buildCost: levels[0].cost가 건설비다', () => {
  assert.equal(buildCost(def), 80)
})

test('upgradeCost: 다음 레벨의 cost를 돌려준다', () => {
  assert.equal(upgradeCost(def, 1), 60)
  assert.equal(upgradeCost(def, 2), 130)
})

test('upgradeCost: 만렙이면 예외가 아니라 null을 돌려준다 (UI가 버튼을 숨기는 근거)', () => {
  assert.equal(upgradeCost(def, 3), null)
})

test('upgradeCost: 레벨이 범위를 벗어나면 EconomyError를 던진다', () => {
  assert.throws(() => upgradeCost(def, 0), EconomyError)
  assert.throws(() => upgradeCost(def, 4), EconomyError)
  assert.throws(() => upgradeCost(def, 1.5), EconomyError)
})

test('totalInvested: 건설비부터 현재 레벨까지 누적한다', () => {
  assert.equal(totalInvested(def, 1), 80)
  assert.equal(totalInvested(def, 2), 140)
  assert.equal(totalInvested(def, 3), 270)
})

test('sellValue: 투자한 총액의 60%를 내림해서 돌려준다', () => {
  assert.equal(DEFAULT_REFUND_RATE, 0.6)
  assert.equal(sellValue(def, 1), 48)  // floor(80 * 0.6)
  assert.equal(sellValue(def, 3), 162) // floor(270 * 0.6)
})

test('sellValue: 환급 비율이 항상 투자금보다 작아 판매 반복으로 골드가 늘지 않는다', () => {
  for (let lv = 1; lv <= 3; lv += 1) {
    assert.ok(sellValue(def, lv) < totalInvested(def, lv))
  }
})

test('sellValue: 환급 비율이 0~1 밖이면 EconomyError를 던진다', () => {
  assert.throws(() => sellValue(def, 1, 1.5), EconomyError)
  assert.throws(() => sellValue(def, 1, -0.1), EconomyError)
})

test('canAfford: 골드가 비용 이상이면 true, 비용이 null이면 false다', () => {
  assert.equal(canAfford(80, 80), true)
  assert.equal(canAfford(79, 80), false)
  assert.equal(canAfford(9999, null), false)
})

test('levels가 없는 정의는 EconomyError를 던진다', () => {
  assert.throws(() => buildCost({ id: 'x' }), EconomyError)
  assert.throws(() => buildCost(null), EconomyError)
})
