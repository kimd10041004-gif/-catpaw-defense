/**
 * 카드 고양이의 새 메커니즘 넷 — **숫자가 실제로 움직이는지** 본다.
 *
 * 봇 시뮬레이터로는 이걸 못 잰다: 봇은 고정 순서로 짓고 자리를 안 고르므로
 * "옆 고양이를 세게 한다"(sightaura)나 "모두의 피해를 올린다"(mark)를 못 쓴다.
 * 그래서 여기서 엔진을 직접 두드린다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getMap, getTower, listTowers } from '../../web/js/content/registry.js'
import { Game } from '../../web/js/game.js'
import { towerModsFor } from '../../web/js/domain/mods.js'

const newGame = (o = {}) => new Game({ mapDef: getMap('alley'), ...o })
/** 장갑이 두꺼운 적 — 두더지(8) */
const thick = (g) => g._createEnemy('mole', { hp: 100000 })

test('sunder: 맞을수록 장갑이 벗겨지고, 시간이 지나면 도로 붙는다', () => {
  const g = newGame()
  const e = thick(g)
  const base = e.def.armor
  assert.ok(base >= 6, `픽스처 전제: 두더지 장갑 ${base}`)
  assert.equal(g.armorOf(e), base)

  g.sunder(e, 1, 3, 3)
  assert.equal(g.armorOf(e), base - 1)
  g.sunder(e, 1, 3, 3)
  g.sunder(e, 1, 3, 3)
  g.sunder(e, 1, 3, 3)          // max 3 이라 더 안 깎인다
  assert.equal(g.armorOf(e), base - 3, '상한을 넘어 깎였다')

  // 시간이 지나면 원래대로
  g.time += 3.1
  assert.equal(g.armorOf(e), base, '벗겨진 장갑이 안 돌아왔다')

  // 장갑보다 많이 깎아도 음수가 안 된다 — 음수 장갑은 applyArmor 에서 피해를 늘려 버린다
  const g2 = newGame()
  const e2 = g2._createEnemy('mouse', { hp: 1000 })
  g2.sunder(e2, 99, 99, 5)
  assert.ok(g2.armorOf(e2) >= 0, `장갑이 ${g2.armorOf(e2)} 로 음수가 됐다`)
})

test('sunder: 벗긴 만큼 **다른 고양이의** 피해가 실제로 늘어난다', () => {
  /* 이게 이 효과의 존재 이유다 — 자기 화력이 아니라 판 전체의 화력을 올린다. */
  const g = newGame()
  const a = thick(g)
  const before = a.hp
  g.applyDamage(a, 20, { canCrit: false })
  const plain = before - a.hp                       // 20 - 장갑

  const g2 = newGame()
  const b = thick(g2)
  g2.sunder(b, 3, 3, 3)
  const before2 = b.hp
  g2.applyDamage(b, 20, { canCrit: false })
  const sundered = before2 - b.hp

  assert.equal(sundered, plain + 3, `벗기고 ${sundered} vs 그냥 ${plain}`)
})

test('truestrike: 장갑을 통째로 무시한다 (두꺼운 놈일수록 값이 커진다)', () => {
  const g = newGame()
  const e = thick(g)
  const armor = g.armorOf(e)
  const before = e.hp
  g.applyDamage(e, 22, { canCrit: false, ignoreArmor: true })
  assert.equal(before - e.hp, 22, '장갑을 무시하지 않았다')

  // 같은 값을 그냥 때리면 장갑만큼 깎인다 — 차이가 이 효과의 값이다
  const g2 = newGame()
  const e2 = thick(g2)
  const b2 = e2.hp
  g2.applyDamage(e2, 22, { canCrit: false })
  assert.equal(b2 - e2.hp, 22 - armor)
  assert.ok(armor >= 6, `장갑이 ${armor} 뿐이면 이 효과를 쓸 이유가 없다`)
})

test('mark: 찍힌 적이 **모두에게** 더 아프고, 겹쳐도 곱해지지 않는다', () => {
  const g = newGame()
  const e = g._createEnemy('mouse', { hp: 100000 })
  const armor = g.armorOf(e)
  const plainBefore = e.hp
  g.applyDamage(e, 100, { canCrit: false })
  const plain = plainBefore - e.hp

  g.mark(e, 1.5, 4)
  const markedBefore = e.hp
  g.applyDamage(e, 100, { canCrit: false })
  const marked = markedBefore - e.hp
  assert.equal(marked, Math.round((100 - armor) * 1.5), `표식 ${marked} vs 그냥 ${plain}`)

  // 다시 찍어도 배수가 곱해지지 않는다 (겹치면 터진다)
  g.mark(e, 1.5, 4)
  const twiceBefore = e.hp
  g.applyDamage(e, 100, { canCrit: false })
  assert.equal(twiceBefore - e.hp, marked, '표식이 겹쳐서 곱해졌다')

  // 시간이 지나면 풀린다
  g.time += 4.1
  const afterBefore = e.hp
  g.applyDamage(e, 100, { canCrit: false })
  assert.equal(afterBefore - e.hp, plain, '표식이 안 풀렸다')
})

test('knockback: 길 뒤로 밀리고, 보스는 덜 밀리고, 0 밑으로는 안 간다', () => {
  const g = newGame()
  const e = g._createEnemy('mouse', { hp: 1000 })
  e.progress = 5
  g.knockback(e, 0.6, 0.35)
  assert.ok(Math.abs(e.progress - 4.4) < 1e-9, `진행 ${e.progress}`)

  const boss = g._createEnemy('ratking', { hp: 1000 })
  assert.equal(boss.def.boss, true, '픽스처 전제가 깨졌다')
  boss.progress = 5
  g.knockback(boss, 0.6, 0.35)
  assert.ok(Math.abs(boss.progress - (5 - 0.6 * 0.35)) < 1e-9, `보스 진행 ${boss.progress}`)

  // 출발선 밖으로는 안 밀린다
  e.progress = 0.1
  g.knockback(e, 5, 0.35)
  assert.equal(e.progress, 0)
})

test('sightaura: 옆 고양이의 사거리를 늘린다 (buff 와 같은 자리에서 읽힌다)', () => {
  const forest = getTower('forest')
  const fx = forest.levels[0].effects.find((e) => e.kind === 'sightaura')
  assert.ok(fx && fx.rangeAdd > 0, '노르웨이숲냥에 sightaura 가 없다')

  const near = { def: getTower('munchkin'), level: 1, c: 3, r: 3 }
  const aura = { def: forest, level: 1, c: 3, r: 4 }
  const far = { def: getTower('munchkin'), level: 1, c: 3, r: 9 }
  const mods = towerModsFor(near, [near, aura, far])
  assert.equal(mods.rangeAdd, fx.rangeAdd, '옆에 있는데 사거리가 안 늘었다')
  assert.equal(towerModsFor(far, [near, aura, far]).rangeAdd, 0, '멀리 있는데 사거리가 늘었다')
  // 자기 자신은 자기를 강화하지 않는다
  assert.equal(towerModsFor(aura, [aura]).rangeAdd, 0)
})

test('카드 고양이: 기존 고양이의 1등 자리를 하나도 안 뺏는다', () => {
  /* 이 검사가 J-4 의 설계 제약 그 자체다. 처음엔 "값이 비싼 대신 한 방이 큰" 식으로 짰다가
   * 메인쿤이 검은냥의 '한 방 최대'를, 사바나가 '사거리 최장'을, 먼치킨이 치즈냥의 '가장 싸다'를
   * 뺏었다 — 무료로 주는 고양이를 뽑기 고양이가 밀어내면 그게 "뽑기가 진행을 대신 깨는" 것이다. */
  const towers = listTowers()
  const cards = towers.filter((t) => t.rarity)
  const free = towers.filter((t) => !t.rarity)
  assert.equal(cards.length, 6, `카드 고양이 ${cards.length}마리`)

  const last = (t) => t.levels[t.levels.length - 1]
  const beats = (pick, label) => {
    const freeBest = Math.max(...free.map(pick))
    for (const c of cards) {
      assert.ok(pick(c) <= freeBest, `${c.name}이 ${label} 1등을 뺏었다 (${pick(c)} > ${freeBest})`)
    }
  }
  beats((t) => last(t).damage, '한 방')
  beats((t) => last(t).range, '사거리')
  beats((t) => last(t).damage * last(t).fireRate, '초당 피해')

  const cheapestFree = Math.min(...free.map((t) => t.levels[0].cost))
  for (const c of cards) {
    assert.ok(c.levels[0].cost > cheapestFree, `${c.name}이 '가장 싸다' 를 뺏었다`)
  }
})
