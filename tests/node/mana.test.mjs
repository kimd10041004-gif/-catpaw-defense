import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampMana, gainMana, spendMana, canCast, manaForKill,
  ManaError, MANA_MAX, MANA_START, MANA_PER_KILL, MANA_PER_BOSS,
  MANA_PER_WAVE_CLEAR, MANA_PER_CRYSTAL,
} from '../../web/js/domain/mana.js'

test('clampMana: 0과 최대치 사이로 자르고 소수점을 버린다', () => {
  assert.equal(clampMana(-5), 0)
  assert.equal(clampMana(0), 0)
  assert.equal(clampMana(37.9), 37)
  assert.equal(clampMana(MANA_MAX + 40), MANA_MAX)
})

test('clampMana: 숫자가 아니면 ManaError를 던진다', () => {
  assert.throws(() => clampMana('40'), ManaError)
  assert.throws(() => clampMana(NaN), ManaError)
})

test('gainMana: 더한 만큼 차고 실제로 찬 양을 알려준다', () => {
  const r = gainMana(10, 25)
  assert.equal(r.mana, 35)
  assert.equal(r.gained, 25)
  assert.equal(r.overflow, 0)
})

test('gainMana: 최대치를 넘으면 넘친 양을 따로 알려준다', () => {
  const r = gainMana(MANA_MAX - 5, 30)
  assert.equal(r.mana, MANA_MAX)
  assert.equal(r.gained, 5)
  assert.equal(r.overflow, 25)
})

test('gainMana: 음수를 더하려 하면 ManaError를 던진다 (차감은 spendMana로만)', () => {
  assert.throws(() => gainMana(50, -10), ManaError)
})

test('spendMana: 충분하면 비용만큼 깎는다', () => {
  const r = spendMana(60, 45)
  assert.equal(r.ok, true)
  assert.equal(r.mana, 15)
})

test('spendMana: 모자라면 한 방울도 깎지 않고 부족분을 알려준다', () => {
  const r = spendMana(30, 45)
  assert.equal(r.ok, false)
  assert.equal(r.mana, 30, '실패했는데 마나가 줄면 안 된다')
  assert.equal(r.short, 15)
})

test('spendMana: 비용과 정확히 같으면 쓸 수 있고 0이 된다', () => {
  const r = spendMana(45, 45)
  assert.equal(r.ok, true)
  assert.equal(r.mana, 0)
})

test('canCast: 쓸 수 있는지만 판정한다', () => {
  assert.equal(canCast(60, 45), true)
  assert.equal(canCast(44, 45), false)
  assert.equal(canCast(0, 0), true)
})

test('manaForKill: 일반 적과 보스 등급에 따라 다르게 준다', () => {
  assert.equal(manaForKill({ boss: false }), MANA_PER_KILL)
  assert.equal(manaForKill({ boss: true, tier: 1 }), MANA_PER_BOSS)
  assert.equal(manaForKill({ boss: true, tier: 3 }), MANA_PER_BOSS * 3)
  assert.equal(manaForKill(null), MANA_PER_KILL)
})

test('한 웨이브를 막으면 필살기 한 번 값이 대략 모인다 (마나 경제 감각)', () => {
  // 중반 웨이브 = 적 20마리 + 클리어 보너스. 필살기 비용대는 35~60이다.
  const earned = 20 * MANA_PER_KILL + MANA_PER_WAVE_CLEAR
  assert.ok(earned >= 35, `한 웨이브 수입이 ${earned} — 가장 싼 필살기(35)도 못 채운다`)
  assert.ok(earned <= 70, `한 웨이브 수입이 ${earned} — 너무 넉넉해서 아낄 이유가 없다`)
})

test('시작 마나로 첫 필살기 하나는 쓸 수 있다 (결제 없이도 굴러가야 한다)', () => {
  assert.ok(MANA_START >= 35, `시작 마나 ${MANA_START} 로는 아무 필살기도 못 쓴다`)
  assert.ok(MANA_START < MANA_MAX, '시작부터 가득 차 있으면 모으는 재미가 없다')
})

test('크리스탈 하나가 킬 여러 번 값이라 주우러 갈 이유가 된다', () => {
  assert.ok(MANA_PER_CRYSTAL >= MANA_PER_KILL * 10,
    `크리스탈 ${MANA_PER_CRYSTAL} 은 킬 ${MANA_PER_KILL} 대비 너무 짜다`)
})
