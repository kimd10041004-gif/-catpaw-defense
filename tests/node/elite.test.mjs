import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eliteChance, rollElite, eliteStats, elitePalette,
  ELITE_FROM_WAVE, ELITE_CHANCE_MAX, ELITE_HP_MUL, ELITE_ARMOR_ADD,
  ELITE_GOLD_MUL, ELITE_CROWN,
} from '../../web/js/domain/elite.js'

const MOUSE = { id: 'mouse', boss: false }
const BOSS = { id: 'ratking', boss: true, tier: 1 }

test('eliteChance: 정해진 웨이브 전까지는 0이다', () => {
  assert.equal(eliteChance(1), 0)
  assert.equal(eliteChance(ELITE_FROM_WAVE - 1), 0)
  assert.ok(eliteChance(ELITE_FROM_WAVE) > 0)
})

test('eliteChance: 웨이브가 오를수록 커지되 상한을 넘지 않는다', () => {
  assert.ok(eliteChance(10) > eliteChance(7))
  assert.ok(eliteChance(30) > eliteChance(20))
  assert.equal(eliteChance(999), ELITE_CHANCE_MAX)
})

test('rollElite: 보스에게는 절대 붙지 않는다 (이미 왕관을 쓰고 있다)', () => {
  assert.equal(rollElite(BOSS, 30, () => 0), false)
})

test('rollElite: 난수를 주입해 확률 경계를 확인한다', () => {
  const p = eliteChance(20)
  assert.equal(rollElite(MOUSE, 20, () => p - 0.0001), true)
  assert.equal(rollElite(MOUSE, 20, () => p), false, '경계값은 포함하지 않는다')
  assert.equal(rollElite(MOUSE, 1, () => 0), false, '초반 웨이브에는 나오지 않는다')
})

test('eliteStats: 체력·방어·골드가 함께 오른다 (더 아프지만 더 값지다)', () => {
  const s = eliteStats({ hp: 100, armor: 2, gold: 10 })
  assert.equal(s.hp, Math.round(100 * ELITE_HP_MUL))
  assert.equal(s.armor, 2 + ELITE_ARMOR_ADD)
  assert.equal(s.gold, 10 * ELITE_GOLD_MUL)
})

test('eliteStats: 보상이 위험보다 덜 오르지 않는다', () => {
  assert.ok(ELITE_GOLD_MUL >= ELITE_HP_MUL,
    '체력만 오르고 골드가 안 오르면 엘리트는 그냥 짜증나는 존재가 된다')
})

test('elitePalette: 원본 팔레트를 건드리지 않고 왕관만 얹는다', () => {
  const base = { body: '#9aa3ad', belly: '#d7dce1' }
  const out = elitePalette(base)
  assert.equal(out.crown, ELITE_CROWN)
  assert.equal(out.body, base.body)
  assert.equal(base.crown, undefined, '정의의 팔레트가 오염되면 그 종류 전체가 왕관을 쓴다')
})

test('elitePalette: 이미 왕관이 있으면 그 색을 유지한다', () => {
  assert.equal(elitePalette({ crown: '#ff0000' }).crown, '#ff0000')
})
