import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCost, upgradeCost, totalInvested, sellValue, canAfford, maxLevel,
  catnipForBoss, catnipForWaveClear, catnipForMapClear,
  CATNIP_MAP_CLEAR, CATNIP_PER_5_WAVES,
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

// ─────────────────────────────────────────────────────────────────────────────
// 캣닢 지급 규칙 — 결제 없이도 모을 수 있어야 한다는 설계의 근거
// ─────────────────────────────────────────────────────────────────────────────

test('catnipForBoss: 보스 등급이 높을수록 더 준다', () => {
  assert.equal(catnipForBoss(1), 2)
  assert.equal(catnipForBoss(2), 4)
  assert.equal(catnipForBoss(3), 6)
})

test('catnipForBoss: 프리미엄 배수를 반영한다', () => {
  assert.equal(catnipForBoss(3, 2), 12)
})

test('catnipForWaveClear: 5의 배수 웨이브에서만 나온다', () => {
  assert.equal(catnipForWaveClear(4), 0)
  assert.equal(catnipForWaveClear(5), CATNIP_PER_5_WAVES)
  assert.equal(catnipForWaveClear(9), 0)
  assert.equal(catnipForWaveClear(30), CATNIP_PER_5_WAVES)
  assert.equal(catnipForWaveClear(0), 0)
  assert.equal(catnipForWaveClear(-3), 0)
  assert.equal(catnipForWaveClear(5, 2), CATNIP_PER_5_WAVES * 2)
})

test('catnipForMapClear: 맵을 끝내면 넉넉히 준다', () => {
  assert.equal(catnipForMapClear(), CATNIP_MAP_CLEAR)
  assert.equal(catnipForMapClear(2), CATNIP_MAP_CLEAR * 2)
})

test('30웨이브를 클리어하면 결제 없이도 이어하기 한 번 값(50)이 모인다', () => {
  // 보스 5회(10·15·20·25·30) + 5웨이브마다 6회 + 맵 클리어
  const bosses = [1, 2, 2, 2, 3].reduce((n, tier) => n + catnipForBoss(tier), 0)
  const waves = [5, 10, 15, 20, 25, 30].reduce((n, w) => n + catnipForWaveClear(w), 0)
  const total = bosses + waves + catnipForMapClear()
  assert.ok(total >= 50, `한 판에서 모이는 캣닢 ${total}개는 50개 이상이어야 한다`)
})
