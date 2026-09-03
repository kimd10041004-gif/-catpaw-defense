import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyArmor, scaleHp, scaleGold, waveClearBonus, earlyCallBonus,
  BalanceError, MIN_DAMAGE,
} from '../../web/js/domain/balance.js'

test('applyArmor: 방어력만큼 피해가 깎인다', () => {
  assert.equal(applyArmor(20, 8), 12)
  assert.equal(applyArmor(70, 6), 64)
})

test('applyArmor: 방어력이 공격력 이상이어도 최소 1은 들어간다 (무한 탱킹 방지)', () => {
  assert.equal(applyArmor(12, 8), 4)
  assert.equal(applyArmor(6, 8), MIN_DAMAGE)
  assert.equal(applyArmor(1, 999), MIN_DAMAGE)
})

test('applyArmor: 숫자가 아니거나 음수면 BalanceError를 던진다', () => {
  assert.throws(() => applyArmor('12', 0), BalanceError)
  assert.throws(() => applyArmor(NaN, 0), BalanceError)
  assert.throws(() => applyArmor(-1, 0), BalanceError)
  assert.throws(() => applyArmor(10, -1), BalanceError)
})

test('scaleHp: 1웨이브는 기본 체력 그대로다', () => {
  assert.equal(scaleHp(100, 1, 1, 1), 100)
})

test('scaleHp: 웨이브마다 10%씩 누적 증가한다', () => {
  assert.equal(scaleHp(100, 11, 1, 1), 200) // 1 + 10 * 0.10
  assert.equal(scaleHp(100, 21, 1, 1), 300)
})

test('scaleHp: 맵 난이도와 난이도 프리셋 배율을 모두 곱한다', () => {
  assert.equal(scaleHp(100, 1, 1.35, 1), 135)
  assert.equal(scaleHp(100, 1, 1, 0.75), 75)
  assert.equal(scaleHp(100, 11, 1.15, 0.75), Math.round(200 * 1.15 * 0.75))
})

test('scaleHp: wave가 1 미만이거나 정수가 아니면 BalanceError를 던진다', () => {
  assert.throws(() => scaleHp(100, 0), BalanceError)
  assert.throws(() => scaleHp(100, 1.5), BalanceError)
})

test('scaleGold: 10웨이브까지는 그대로, 11웨이브부터 25% 오른다', () => {
  assert.equal(scaleGold(8, 1, 1), 8)
  assert.equal(scaleGold(8, 10, 1), 8)
  assert.equal(scaleGold(8, 11, 1), 10)
  assert.equal(scaleGold(8, 21, 1), 12)
})

test('scaleGold: 난이도 골드 배율을 반영하고 최소 1을 보장한다', () => {
  assert.equal(scaleGold(8, 1, 1.25), 10)
  assert.equal(scaleGold(1, 1, 0.01), 1)
})

test('waveClearBonus: 웨이브가 오를수록 보너스가 커진다', () => {
  assert.equal(waveClearBonus(1), 30)
  assert.equal(waveClearBonus(10), 75)
  assert.ok(waveClearBonus(30) > waveClearBonus(29))
})

test('earlyCallBonus: 준비시간을 많이 남길수록 많이 준다', () => {
  assert.equal(earlyCallBonus(10, 10, 5), 20) // 전량 남김 → 10 + 5*2
  assert.equal(earlyCallBonus(0, 10, 5), 0)
  assert.equal(earlyCallBonus(5, 10, 5), 10)
})

test('earlyCallBonus: 비율이 0~1 밖이면 잘라내고, 준비시간이 0이면 0을 준다', () => {
  assert.equal(earlyCallBonus(999, 10, 5), 20)
  assert.equal(earlyCallBonus(-5, 10, 5), 0)
  assert.equal(earlyCallBonus(10, 0, 5), 0)
})
