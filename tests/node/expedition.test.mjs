/**
 * 속성 원정 — **규칙 셋이 실제로 규칙인지** 본다.
 *
 *   1. 덱 네 마리만 데려간다 (나머지는 판에서 못 놓는다)
 *   2. 칸의 지배 속성이 적을 덮는다
 *   3. 첫 클리어 보상은 한 번만, 그리고 자유 모드 기록을 안 건드린다
 *
 * 사다리가 재미있는지는 여기서 안 본다 — 그건 `balance-sim-expedition.test` 가 판을 돌려서 잰다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import {
  listExpeditions, getExpedition, getMap, getWaveSet, listTowers, listMaps, EXPEDITION_OWNED_RULES,
} from '../../web/js/content/registry.js'
import { ELEMENTS, elementMul, STRONG } from '../../web/js/domain/elements.js'
import {
  DECK_SIZE, ownedCats, canEnter, stageRules, deckMatch, reachedStage, isCleared, savedDeck, towerElement,
  currentExpedition,
} from '../../web/js/domain/expedition.js'
import { defaultProgress, recordExpedition, setExpeditionDeck } from '../../web/js/domain/save.js'
import { Game } from '../../web/js/game.js'

const EXP = () => getExpedition('ember-road')
const allIds = () => listTowers().map((t) => t.id)

test('사다리: 칸마다 맵·웨이브셋이 실재하고 길이가 표 안에 든다', () => {
  const list = listExpeditions()
  assert.ok(list.length >= 1, '원정이 하나도 없다')
  for (const exp of list) {
    assert.ok(exp.stages.length >= 5, `${exp.name}: ${exp.stages.length}칸`)
    for (const st of exp.stages) {
      assert.ok(getMap(st.mapId), `모르는 맵 ${st.mapId}`)
      const table = getWaveSet(st.waveSet)
      assert.ok(table, `모르는 웨이브셋 ${st.waveSet}`)
      assert.ok(st.waveLimit > 0 && st.waveLimit <= table.length, `${st.mapId}: ${st.waveLimit}/${table.length}웨이브`)
      assert.ok(ELEMENTS.includes(st.element), `모르는 속성 ${st.element}`)
    }
  }
})

test('사다리: 여섯 속성이 전부 나온다 — 빠진 속성 하나가 "도배" 정답을 만든다', () => {
  /* 이게 이 모드의 핵심 불변이다. 속성 E 는 고리에서 자기 앞 속성에게만 약한데,
   * 그 칸이 사다리에 없으면 E 로 도배한 덱은 약점이 하나도 없어진다. 다섯 칸으로 짰다가
   * 실제로 그렇게 됐고(전부 흙이 최선), 그래서 여섯 칸으로 늘렸다. */
  const exp = EXP()
  const used = new Set(exp.stages.map((st) => st.element))
  assert.equal(used.size, ELEMENTS.length,
    `쓰인 속성 ${[...used].join(',')} — 여섯이 다 있어야 도배 덱에 약점이 생긴다`)

  // 어떤 도배 덱이든 최약칸이 4마리 전부 불리(0.7×4)여야 한다
  for (const e of ELEMENTS) {
    const worst = Math.min(...exp.stages.map((st) => elementMul(e, st.element) * DECK_SIZE))
    assert.ok(worst < DECK_SIZE, `전부 ${e} 인 덱에 약점이 없다 (최약 ${worst})`)
  }
})

test('사다리: 원정은 무료다 — 유료 게이트가 붙어 있지 않다', () => {
  for (const exp of listExpeditions()) {
    assert.equal(exp.pack, undefined, `${exp.name}: pack 게이트가 붙었다`)
    assert.equal(exp.act, undefined, `${exp.name}: act 게이트가 붙었다`)
  }
})

test('원정 맵은 자유 모드 목록에 안 뜬다 (해금 사슬·주간 로테이션을 안 건드린다)', () => {
  const free = listMaps().map((m) => m.id)
  const all = listMaps({ mode: 'all' }).map((m) => m.id)
  assert.ok(all.length > free.length, '원정 전용 맵이 하나도 없다')
  for (const id of all) {
    if (free.includes(id)) continue
    assert.equal(listMaps({ mode: 'all' }).find((m) => m.id === id).mode, 'expedition')
  }
  // 사다리가 쓰는 맵은 free 든 expedition 이든 전부 getMap 으로 잡힌다
  for (const st of EXP().stages) assert.ok(getMap(st.mapId), `${st.mapId} 를 못 찾는다`)
})

test('덱: 네 마리만 데려가고 나머지는 판에서 못 놓는다', () => {
  const all = allIds()
  const deck = all.slice(0, DECK_SIZE)
  const rules = stageRules(EXP().stages[0], deck, all)
  assert.equal(rules.elemental, true)
  assert.equal(rules.enemyElement, EXP().stages[0].element)
  assert.deepEqual([...rules.bannedTowers].sort(), all.filter((id) => !deck.includes(id)).sort())

  // 엔진이 실제로 막는지 — 규칙만 만들고 안 걸리면 아무 뜻이 없다
  const game = new Game({ mapDef: getMap('alley'), rules, progress: { ...defaultProgress(), unlockedTowers: all } })
  const outsider = all.find((id) => !deck.includes(id))
  let placedOut = false
  let placedIn = false
  for (let r = 0; r < game.mapDef.rows; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) {
      if (!placedOut && game.placeTower(c, r, outsider).ok) placedOut = true
      if (!placedIn && game.placeTower(c, r, deck[0]).ok) placedIn = true
    }
  }
  assert.equal(placedOut, false, `덱 밖 고양이 ${outsider} 를 놓을 수 있다`)
  assert.equal(placedIn, true, '덱 안 고양이를 못 놓는다')
})

test('지배 속성: 칸의 속성이 적의 타고난 속성을 덮는다', () => {
  /* 적 14종이 흙 5 · 어둠 4 로 쏠려 있어서 "얼음 적만 나오는 웨이브"는 못 만든다.
   * 덮어쓰기가 되는 유일한 길이고, 이 검사가 그게 실제로 걸리는지 본다. */
  const all = allIds()
  const stage = { ...EXP().stages[0], element: 'ice' }   // 얼음 지대
  const rules = stageRules(stage, all.slice(0, DECK_SIZE), all)
  const game = new Game({ mapDef: getMap('alley'), rules })
  const mouse = game._createEnemy('mouse', { hp: 100000 })   // 타고난 속성은 흙
  assert.equal(mouse.def.element, 'earth', '픽스처 전제가 깨졌다')

  const armor = game.armorOf(mouse)
  const base = 100 - armor
  const before = mouse.hp
  game.applyDamage(mouse, 100, { canCrit: false, element: 'bolt' })   // 번개는 얼음에 강하다
  const dealt = before - mouse.hp
  assert.equal(dealt, base * STRONG, `번개 → (덮인)얼음 이 ${dealt} (기대 ${base * STRONG})`)

  // 덮어쓰기가 없으면 흙에게 번개는 불리하다 — 같은 판에서 규칙만 빼고 확인
  const plain = new Game({ mapDef: getMap('alley'), rules: { elemental: true } })
  const m2 = plain._createEnemy('mouse', { hp: 100000 })
  const b2 = m2.hp
  plain.applyDamage(m2, 100, { canCrit: false, element: 'bolt' })
  assert.ok(b2 - m2.hp < base, '덮어쓰기 없이도 같은 값이 나왔다 — enemyElement 가 안 걸렸다')
})

test('목숨: 생성자로 이어받는다 (칸 사이로 넘긴다)', () => {
  const fresh = new Game({ mapDef: getMap('alley') })
  assert.ok(fresh.lives > 1)
  const carried = new Game({ mapDef: getMap('alley'), lives: 7 })
  assert.equal(carried.lives, 7)
  assert.equal(carried.maxLives, 7, 'HUD 게이지가 어긋난다')
  // 0 이면 맵 기본값 그대로 (첫 칸)
  assert.equal(new Game({ mapDef: getMap('alley'), lives: 0 }).lives, fresh.lives)
})

test('입장: 고양이가 덱을 못 채우면 막힌다', () => {
  const all = allIds()
  const three = { ...defaultProgress(), unlockedTowers: all.slice(0, 3) }
  assert.equal(canEnter(three, all).ok, false)
  assert.equal(canEnter(three, all).have, 3)

  const four = { ...defaultProgress(), unlockedTowers: all.slice(0, 4) }
  assert.equal(canEnter(four, all).ok, true)

  // 카드로 가진 고양이도 센다 (game.isTowerUnlocked 와 같은 규칙이어야 한다)
  const withCard = { ...three, cards: { owned: { [all[5]]: 1 }, shards: 0 } }
  assert.equal(canEnter(withCard, all).have, 4)
  assert.ok(ownedCats(withCard, all).includes(all[5]))
})

test('기록: 첫 클리어에만 보상, 도달 칸은 최고만, 완주는 마지막 칸에서', () => {
  const exp = EXP()
  const reward = { tickets: 2, catnip: 30, shards: 40, rune: 'ice' }
  const start = defaultProgress()
  let p = start

  p = recordExpedition(p, exp.id, 0, true, reward, false)
  assert.equal(reachedStage(p, exp.id), 1)
  assert.equal(p.tickets, start.tickets + 2)
  assert.equal(p.catnip, start.catnip + 30)
  assert.equal(p.cards.shards, 40)
  assert.equal(p.runes.owned.ice, 1)
  assert.equal(isCleared(p, exp.id), false)

  // 같은 칸을 다시 깨도 두 번 안 준다 (_saveRun 이 한 판에서 여러 번 불린다)
  const again = recordExpedition(p, exp.id, 0, true, reward, false)
  assert.equal(again.tickets, start.tickets + 2, '보상이 두 번 나갔다')
  assert.equal(again.catnip, start.catnip + 30)
  assert.equal(reachedStage(again, exp.id), 1)

  // 졌을 때는 도달 칸이 안 오르고 보상도 없다
  const lost = recordExpedition(p, exp.id, 1, false, reward, false)
  assert.equal(reachedStage(lost, exp.id), 1)
  assert.equal(lost.catnip, start.catnip + 30)

  // 마지막 칸을 깨면 완주
  let q = p
  for (let i = 1; i < exp.stages.length; i += 1) {
    q = recordExpedition(q, exp.id, i, true, { catnip: 1 }, i === exp.stages.length - 1)
  }
  assert.equal(reachedStage(q, exp.id), exp.stages.length)
  assert.equal(isCleared(q, exp.id), true)
})

test('기록: 원정은 자유 모드 기록을 안 건드린다', () => {
  const before = defaultProgress()
  const after = recordExpedition(before, 'ember-road', 0, true, { catnip: 20 }, false)
  assert.deepEqual(after.bestWave, before.bestWave)
  assert.deepEqual(after.clears, before.clears)
  assert.deepEqual(after.unlockedMaps, before.unlockedMaps)
  assert.deepEqual(after.challenge, before.challenge)
})

test('덱 저장: 없는 고양이는 걸러서 돌려준다', () => {
  const all = allIds()
  let p = setExpeditionDeck(defaultProgress(), [all[0], all[1], 'ghost-cat'])
  assert.deepEqual(p.expedition.deck, [all[0], all[1], 'ghost-cat'])
  // 읽을 때 거른다 — 콘텐츠에서 고양이를 빼도 덱 화면이 안 깨진다
  const owned = { ...p, unlockedTowers: [all[0], all[1]] }
  assert.deepEqual(savedDeck(owned, all), [all[0], all[1]])
})

test('덱 미리보기: 유리·불리를 센다', () => {
  const stage = { element: 'earth' }
  const elementOf = (id) => ({ a: 'light', b: 'bolt', c: 'earth', d: 'ice' })[id]
  const m = deckMatch(['a', 'b', 'c', 'd'], stage, elementOf)
  assert.equal(m.strong, 1, '빛이 흙에 강하다')
  assert.equal(m.weak, 1, '번개가 흙에 약하다')
  assert.equal(m.neutral, 2)
})

test('룬을 끼우면 그 속성으로 때린다 (towerElement 가 game 과 같은 규칙)', () => {
  const def = { id: 'cheese', element: 'light' }
  assert.equal(towerElement(defaultProgress(), def), 'light')
  const runed = { ...defaultProgress(), runes: { owned: { fire: 1 }, equipped: { cheese: 'fire' } } }
  assert.equal(towerElement(runed, def), 'fire')

  // 판에서도 같아야 한다 — 굳는 자리가 placeTower 다
  const game = new Game({ mapDef: getMap('alley'), progress: runed, rules: { elemental: true } })
  let placed = null
  for (let r = 0; r < game.mapDef.rows && !placed; r += 1) {
    for (let c = 0; c < game.mapDef.cols; c += 1) {
      const res = game.placeTower(c, r, 'cheese')
      if (res.ok) { placed = res.tower; break }
    }
  }
  assert.equal(placed.element, 'fire', '룬이 타워에 안 굳었다')
})

test('두 번째 사다리: 선행 원정이 있고, 칸 규칙은 모드가 정하는 셋을 못 덮는다', () => {
  const list = listExpeditions()
  assert.ok(list.length >= 2, `사다리 ${list.length}개`)
  const second = list[1]
  assert.equal(second.requires, list[0].id, '선행 원정이 안 걸렸다')

  // 선행을 안 깼으면 못 들어간다
  const all = allIds()
  const fresh = { ...defaultProgress(), unlockedTowers: all }
  assert.equal(canEnter(fresh, all, list[0]).ok, true, '첫 사다리가 잠겼다')
  const gate = canEnter(fresh, all, second)
  assert.equal(gate.ok, false)
  assert.equal(gate.reason, 'requires')

  // 첫 사다리를 깨면 열린다
  let p = fresh
  for (let i = 0; i < list[0].stages.length; i += 1) {
    p = recordExpedition(p, list[0].id, i, true, {}, i === list[0].stages.length - 1)
  }
  assert.equal(canEnter(p, all, second).ok, true, '완주했는데 안 열렸다')
  assert.equal(currentExpedition(p, list).id, second.id, '카드가 다음 사다리를 안 가리킨다')
})

test('두 번째 사다리: 칸의 규칙이 Game 규칙에 섞이되 덱 제한을 안 지운다', () => {
  const second = listExpeditions()[1]
  const armored = second.stages.find((st) => st.rules && st.rules.armorAdd)
  assert.ok(armored, '장갑 칸이 없다 — 이 사다리의 정체성이다')

  const all = allIds()
  const deck = all.slice(0, DECK_SIZE)
  const rules = stageRules(armored, deck, all)
  assert.equal(rules.armorAdd, armored.rules.armorAdd, '칸 규칙이 안 실렸다')
  assert.equal(rules.elemental, true, '상성이 지워졌다')
  assert.equal(rules.enemyElement, armored.element, '지배 속성이 지워졌다')
  assert.equal(rules.bannedTowers.length, all.length - DECK_SIZE, '덱 제한이 지워졌다')

  // 엔진에서 실제로 장갑이 오른다
  const game = new Game({ mapDef: getMap(armored.mapId), rules })
  const e = game._createEnemy('mouse', { hp: 10000 })
  const plain = new Game({ mapDef: getMap(armored.mapId), rules: { elemental: true } })
  const e2 = plain._createEnemy('mouse', { hp: 10000 })
  assert.equal(game.armorOf(e) - plain.armorOf(e2), armored.rules.armorAdd)
})

test('두 번째 사다리: 모드가 정하는 규칙은 칸에서 못 바꾼다 (등록이 거부한다)', () => {
  /* 덮게 두면 덱 제한이나 지배 속성이 조용히 사라져, 원정이 원정이 아니게 된다. */
  for (const k of ['elemental', 'bannedTowers', 'enemyElement']) {
    assert.ok(EXPEDITION_OWNED_RULES.includes(k), `${k} 가 보호 목록에 없다`)
  }
})
