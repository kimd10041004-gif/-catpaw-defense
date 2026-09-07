/**
 * J-6 — **칸이 고른 보스는 지배 속성에 안 덮인다.**
 *
 * 왜 이 계약이 필요한가: 원정 칸은 `rules.enemyElement` 로 그 판의 적 속성을 통째로 덮는다.
 * J-5 가 번개·얼음·빛 보스를 채워 보스 여덟이 여섯 속성을 다 덮게 됐는데, 덮어쓰기를 보스까지
 * 밀면 그 여덟이 원정에서만 전부 같은 색이 된다 — J-5 가 한 일이 지워지는 것이다.
 *
 * 그리고 이게 이 모드의 구멍을 막는다. 한 속성으로 도배한 덱은 고리 구조상 약점이 딱 하나 생기는데,
 * 그 약점이 쉬운 칸에 떨어지면 그냥 통과한다 — 재 보니 잿불 길에서 도배 얼음이 83% 완주했다.
 * 보스가 제 속성을 지키면 칸마다 답해야 할 속성이 둘이 되어 그 구멍이 25% 까지 닫혔다.
 * (완주율 자체는 `balance-sim-expedition.test` 가 판을 돌려서 본다. 여기서는 계약만 본다.)
 *
 * 예외는 **칸이 보스를 골랐을 때만** 걸린다. 안 고른 칸(서릿길)은 J-6 이전 그대로다 —
 * 무조건 걸었더니 웨이브셋이 우연히 들고 있던 흙·어둠 보스가 도배 덱에 공짜 축을 하나 더 줬다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import {
  getExpedition, listExpeditions, getMap, getEnemy, getWaveSet, listTowers, listBossIds,
  EXPEDITION_OWNED_RULES, RULE_KEYS,
} from '../../web/js/content/registry.js'
import { ELEMENTS, elementMul, STRONG, WEAK } from '../../web/js/domain/elements.js'
import {
  DECK_SIZE, stageRules, bossReplace, stageBossIds, matchElement, deckMatch, ExpeditionError,
} from '../../web/js/domain/expedition.js'
import { Game } from '../../web/js/game.js'

const allIds = () => listTowers().map((t) => t.id)
const declared = () => listExpeditions().flatMap((e) => e.stages.filter((s) => s.boss).map((s) => ({ e, s })))

test('보스 예외: 고른 보스는 제 속성으로 맞고, 같은 판의 잡몹은 덮인다', () => {
  const all = allIds()
  // 잡몹은 얼음으로 덮고 보스는 흙(쥐왕) 그대로인 칸을 손으로 만든다
  const stage = { mapId: 'alley', waveSet: 'standard30', waveLimit: 10, element: 'ice', boss: 'ratking' }
  const rules = stageRules(stage, all.slice(0, DECK_SIZE), all, listBossIds())
  assert.equal(rules.bossOwnElement, true, 'boss 를 골랐는데 예외 플래그가 안 켜졌다')

  const g = new Game({ mapDef: getMap('alley'), rules })
  const mouse = g._createEnemy('mouse', { hp: 1e6 })     // 잡몹 · 타고난 흙
  const king = g._createEnemy('ratking', { hp: 1e6 })    // 보스 · 타고난 흙
  assert.equal(mouse.def.element, 'earth')
  assert.equal(king.def.element, 'earth')

  const hit = (e, el) => {
    const before = e.hp
    g.applyDamage(e, 100, { canCrit: false, element: el })
    return before - e.hp
  }
  // 배수를 곱한 뒤 장갑을 뺀다(game.applyDamage, L-2) — 배수 = (맞은 값 + 장갑) / 100. 부동소수점이라 오차를 허용한다.
  const mulOf = (e, el) => (hit(e, el) + g.armorOf(e)) / 100
  const near = (got, want, msg) => assert.ok(Math.abs(got - want) < 1e-6, `${msg} (배수 ${got}, 기대 ${want})`)
  // 번개는 얼음에 강하다 — 덮인 잡몹에게는 STRONG, 안 덮인 흙 보스에게는 WEAK
  near(mulOf(mouse, 'bolt'), STRONG, '잡몹이 안 덮였다')
  near(mulOf(king, 'bolt'), WEAK, '보스가 덮였다 — 예외가 안 걸린다')
  // 빛은 흙에 강하다 — 보스에게만 STRONG 이어야 한다
  near(mulOf(king, 'light'), STRONG, '보스가 제 속성으로 안 맞는다')
  assert.equal(g._enemyElement(king), 'earth', '보스가 제 속성이 아니다')
  assert.equal(g._enemyElement(mouse), 'ice', '잡몹이 안 덮였다')
})

test('보스 예외: 칸이 보스를 안 고르면 J-6 이전 그대로 보스도 덮인다', () => {
  const all = allIds()
  const stage = { mapId: 'alley', waveSet: 'standard30', waveLimit: 10, element: 'ice' }
  const rules = stageRules(stage, all.slice(0, DECK_SIZE), all, listBossIds())
  assert.equal(rules.bossOwnElement, undefined, '안 고른 칸에 예외가 켜졌다')
  assert.equal(rules.replace, undefined, '안 고른 칸에 치환표가 생겼다')

  const g = new Game({ mapDef: getMap('alley'), rules })
  const king = g._createEnemy('ratking', { hp: 1e6 })
  const before = king.hp
  g.applyDamage(king, 100, { canCrit: false, element: 'bolt' })
  const mul = ((before - king.hp) + g.armorOf(king)) / 100
  assert.ok(Math.abs(mul - STRONG) < 1e-6, `안 고른 칸의 보스가 안 덮였다 (배수 ${mul})`)
})

test('보스 지정: 그 칸의 보스가 전부 고른 하나로 바뀐다 (기존 replace 규칙을 쓴다)', () => {
  const all = allIds()
  const bosses = listBossIds()
  const stage = { mapId: 'attic', waveSet: 'nightmare20', waveLimit: 12, element: 'light', boss: 'frostworm' }
  const rules = stageRules(stage, all.slice(0, DECK_SIZE), all, bosses)

  // 치환표는 '고른 보스를 뺀 나머지 전부' 다 — 표에 안 나오는 보스를 넣어도 아무 일이 없다
  assert.deepEqual(Object.keys(rules.replace).sort(), bosses.filter((id) => id !== 'frostworm').sort())
  for (const v of Object.values(rules.replace)) assert.equal(v, 'frostworm')
  assert.ok(RULE_KEYS.includes('replace'), 'replace 가 화이트리스트에 없다 — 새 엔진 코드를 안 쓰는 근거다')

  // 엔진에서 실제로 걸린다 — 악몽20 12웨이브 안엔 쥐왕·두더지 대장·바퀴 여왕·박쥐왕이 있다
  const table = getWaveSet('nightmare20').slice(0, 12)
  const raw = new Set()
  for (const w of table) for (const grp of w) if ((getEnemy(grp[0]) || {}).boss) raw.add(grp[0])
  assert.ok(raw.size >= 2, `픽스처 전제가 깨졌다 — 보스가 ${raw.size}종뿐이다`)
  assert.ok(!raw.has('frostworm'), '픽스처 전제가 깨졌다 — 이미 서리 지렁이 여왕이 있다')
  for (const id of raw) assert.equal(rules.replace[id], 'frostworm', `${id} 가 안 바뀐다`)
})

test('보스 지정: 목록에 없는 보스를 부르면 조용히 넘어가지 않고 던진다', () => {
  /* 빈 표를 돌려주면 칸이 보스를 골랐는데 게임엔 안 걸리는 상태가 된다 —
   * 화면을 봐야만 잡히는 종류의 버그다(J-5 에서 frames: 를 빠뜨린 것과 같다). */
  assert.throws(() => bossReplace('ratking', []), ExpeditionError)
  assert.throws(() => bossReplace('mouse', listBossIds()), ExpeditionError)
  assert.throws(() => stageRules({ element: 'ice', boss: 'ratking' }, [], allIds()), ExpeditionError)
})

test('칸의 보스: 등록이 보스가 아닌 적·없는 적을 막는다', () => {
  for (const { e, s } of declared()) {
    const def = getEnemy(s.boss)
    assert.ok(def, `${e.id}: 없는 적 ${s.boss}`)
    assert.ok(def.boss, `${e.id}: ${s.boss} 는 보스가 아니다`)
  }
})

test('칸의 보스: 고른 보스는 그 칸 표에 보스가 있을 때만 실제로 나온다', () => {
  /* 치환은 **있는 것을 바꿀 뿐 새로 넣지 않는다.** 표에 보스가 한 마리도 없는 칸에
   * boss 를 적으면 화면에는 보스를 약속해 놓고 판에는 안 나온다. */
  for (const { e, s } of declared()) {
    const ids = stageBossIds(s, getWaveSet(s.waveSet), (id) => !!(getEnemy(id) || {}).boss)
    assert.deepEqual(ids, [s.boss], `${e.id} ${s.mapId}: 고른 보스가 실제로 안 나온다`)
  }
})

test('세 번째 사다리: 여섯 칸이 보스를 고르고, 보스 속성이 그 칸 잡몹과 안 겹친다', () => {
  const exp = getExpedition('thunder-pass')
  assert.ok(exp, '천둥 고개가 없다')
  assert.equal(exp.stages.length, 6)
  const fodder = exp.stages.map((s) => s.element)
  const boss = exp.stages.map((s) => getEnemy(s.boss).element)

  assert.deepEqual([...new Set(fodder)].sort(), [...ELEMENTS].sort(), '잡몹이 여섯 속성을 다 안 돈다')
  exp.stages.forEach((s, i) => {
    assert.notEqual(boss[i], fodder[i],
      `${i + 1}칸: 보스와 잡몹이 같은 ${fodder[i]} 속성이다 — 물어야 할 속성이 하나로 준다`)
  })

  /* 도배 덱이 공짜로 지나가지 않는지 — 한 속성으로 넷을 채우면 열두 자리(잡몹 6 · 보스 6)에
   * **강한 자리도 약한 자리도 반드시 생겨야** 한다. 잿불 길에서 도배 얼음이 83% 로 새던 구멍이
   * "약점이 쉬운 칸에만 떨어져서"였다.
   *
   * 완전한 2:2 대칭은 **로스터가 허락하지 않는다.** 불 속성 보스가 마왕 쥐 하나뿐인데
   * 체력 9000 · 장갑 14 라 12웨이브짜리 칸에서는 어떤 체력 배수로도 안 죽는다(재 봤다 —
   * hpMul 을 0.55 까지 내려도 도달 점수가 5.23 에서 한 치도 안 움직였다). 그래서 열두 자리 중
   * 불은 잡몹 한 자리뿐이고, 그 결과 도배 얼음의 강한 자리가 하나로 준다.
   * 이건 J-6 이 못 고친 로스터 구멍이고, 값이 아니라 **범위**로 못 박는다. */
  const targets = [...fodder, ...boss]
  for (const e of ELEMENTS) {
    const strong = targets.filter((t) => elementMul(e, t) === STRONG).length
    const weak = targets.filter((t) => elementMul(e, t) === WEAK).length
    assert.ok(strong >= 1 && strong <= 3, `도배 ${e}: 강한 자리 ${strong} 개 — 1~3 이어야 한다`)
    assert.ok(weak >= 1, `도배 ${e}: 약한 자리가 없다 — 공짜로 지나간다`)
  }
  // 그 구멍의 원인을 못 박는다: 불 자리가 하나뿐인 것은 쓸 만한 불 보스가 없어서다
  assert.equal(targets.filter((t) => t === 'fire').length, 1,
    '불 자리가 하나가 아니다 — 로스터에 쓸 만한 불 보스가 생겼다면 배치를 다시 재라')
})

test('세 번째 사다리: 새 보스 셋이 원정에 실제로 나온다 (J-5 가 원정에서 지워지지 않는다)', () => {
  const shown = new Set()
  for (const { s } of declared()) shown.add(s.boss)
  for (const id of ['boltearwig', 'frostworm', 'glowpigeon']) {
    assert.ok(shown.has(id), `${id} 가 어느 원정 칸에도 안 나온다`)
  }
  // 그리고 제 속성으로 나온다 — 지정 칸은 전부 예외가 켜진다
  const all = allIds()
  for (const { e, s } of declared()) {
    const rules = stageRules(s, all.slice(0, DECK_SIZE), all, listBossIds())
    assert.equal(rules.bossOwnElement, true, `${e.id} ${s.mapId}: 예외가 안 켜졌다`)
  }
})

test('보스 예외 플래그는 모드가 정한다 — 칸에서 못 덮는다', () => {
  assert.ok(EXPEDITION_OWNED_RULES.includes('bossOwnElement'), '보호 목록에 없다')
  assert.ok(RULE_KEYS.includes('bossOwnElement'), '규칙 화이트리스트에 없다')
})

test('화면 셈: 잡몹과 보스 상성을 따로 센다', () => {
  const deck = ['cheese', 'calico', 'black', 'siamese']          // 빛 · 흙 · 어둠 · 얼음
  const elementOf = (id) => (listTowers().find((t) => t.id === id) || {}).element
  const stage = { element: 'earth', boss: 'frostworm' }          // 잡몹 흙 · 보스 얼음
  const m = deckMatch(deck, stage, elementOf)
  const b = matchElement(deck, getEnemy('frostworm').element, elementOf)
  assert.equal(m.strong, 1, '흙에 강한 건 빛(치즈냥) 하나다')
  assert.equal(b.strong + b.weak + b.neutral, DECK_SIZE)
  assert.notDeepEqual(m, b, '잡몹과 보스가 같은 값이면 둘을 따로 보여 줄 이유가 없다')
})
