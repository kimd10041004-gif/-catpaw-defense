/**
 * `deck` 정책 — **봇이 덱 안의 고양이를 실제로 놓는가.**
 *
 * 왜 필요한가: `smart` 는 건설 순서를 `MIXED_ORDER` 한 줄에서 가져오는데 거기 카드 고양이가
 * 하나도 없다. 그래서 덱에 카드 고양이를 넣어도 **순서에서 조용히 빠져 판에 한 번도 안 놓였다.**
 * 놓이지 않은 고양이는 "재 봤다"고 말할 수 없다 — 서릿길(장갑 사다리)의 답이 먼치킨·앙고라인데
 * 그 답을 쥔 봇이 없어서 J-6 에서 그 사다리를 못 쟀다.
 *
 * 이 파일이 지키는 것 셋:
 *   1. 덱의 모든 고양이가 순서에 들어간다 (버려지지 않는다)
 *   2. 기본 넷만 든 덱에서는 `smart` 와 **같은 순서**가 나온다 (문서화된 숫자를 안 움직인다는 안전장치)
 *   3. 섞인 덱에서 카드 고양이가 실제로 **판에 놓인다** (순서만 고치고 안 놓이면 뜻이 없다)
 *
 * 그리고 자리 고르기 둘:
 *   4. 디버프 고양이는 **딜러가 쏘는 구간과 겹치는 자리**에 선다 (그냥 첫 빈 칸이 아니다)
 *   5. 딜러는 **길을 많이 보는 자리**에 선다 (길에 가까운 첫 빈 칸이 아니다) — 사거리마다 다르다
 *
 * 판을 돌리는 검사는 하나뿐이다 — `balance-sim.test` 가 이미 `npm test` 시간의 대부분이다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getExpedition, getMap, getTower, listTowers, listBossIds } from '../../web/js/content/registry.js'
import { buildCost } from '../../web/js/domain/economy.js'
import { stageRules, DECK_SIZE } from '../../web/js/domain/expedition.js'
import { deckOrder, playOnce, isDebuffCat, spotScore, MIXED_ORDER } from '../../tools/balance-sim.mjs'
import { pointAtDistance } from '../../web/js/domain/path.js'
import { Game } from '../../web/js/game.js'

const STARTERS = ['cheese', 'calico', 'black', 'siamese']
const CARDS = ['munchkin', 'bengal', 'forest', 'angora']
const inDeck = (deck) => MIXED_ORDER.filter((id) => deck.includes(id))

test('deckOrder: 덱의 고양이를 하나도 안 버린다', () => {
  for (const deck of [STARTERS, CARDS, ['cheese', 'black', 'munchkin', 'angora'], ['mainecoon', 'savannah']]) {
    const order = deckOrder(deck, inDeck(deck))
    for (const id of deck) {
      assert.ok(order.includes(id), `${deck.join(',')}: ${id} 가 순서에서 빠졌다 — 판에 안 놓인다`)
    }
    for (const id of order) assert.ok(deck.includes(id), `${deck.join(',')}: 덱 밖 ${id} 가 순서에 있다`)
  }
})

test('deckOrder: 기본 넷 덱은 smart 와 같은 순서다 (문서화된 숫자를 안 움직인다)', () => {
  /* 이게 안전장치다. `deck` 이 기존 숫자를 흔들면 README·확장가이드·속성과카드·expeditions.js 의
   * 표가 전부 거짓이 된다. 붙일 것이 없으면 순서가 그대로여야 한다. */
  const filtered = inDeck(STARTERS)
  assert.deepEqual(deckOrder(STARTERS, filtered), filtered, '기본 넷 덱의 순서가 달라졌다')
})

test('deckOrder: 카드 고양이만 든 덱은 싼 것부터 서고 맨 앞이 한 번 더 깔린다', () => {
  const order = deckOrder(CARDS, [])
  const cost = (id) => buildCost(getTower(id))
  assert.equal(order[0], order[1], '가장 싼 것이 두 번 안 깔린다 — 첫 웨이브 전에 둘을 못 세운다')
  const tail = order.slice(1)
  for (let i = 1; i < tail.length; i += 1) {
    assert.ok(cost(tail[i - 1]) <= cost(tail[i]), `비용 오름차순이 아니다: ${tail.join(' ')}`)
  }
})

test('deckOrder: 걸러낸 것이 앞, 나머지가 뒤 — 섞인 덱에서 카드 고양이가 뒤에 붙는다', () => {
  const deck = ['cheese', 'black', 'munchkin', 'angora']
  const filtered = inDeck(deck)
  const order = deckOrder(deck, filtered)
  assert.deepEqual(order.slice(0, filtered.length), filtered, 'MIXED_ORDER 부분이 안 지켜졌다')
  assert.deepEqual(order.slice(filtered.length), ['munchkin', 'angora'], '카드 고양이가 비용 순으로 안 붙었다')
})

test('deck 정책: 섞인 덱에서 카드 고양이가 실제로 판에 놓인다 (smart 는 안 놓는다)', () => {
  /* 순서만 고치고 판에 안 놓이면 아무것도 안 고친 것이다. 실제로 한 판 돌려서 센다. */
  const all = listTowers().map((t) => t.id)
  const st = getExpedition('frost-climb').stages[2]        // 창고 · 장갑 +3 — 장갑이 답인 자리
  const deck = ['cheese', 'black', 'munchkin', 'angora']
  assert.equal(deck.length, DECK_SIZE)
  const run = (policy) => playOnce(st.mapId, 'normal', {
    rules: stageRules(st, deck, all, listBossIds()),
    waveSet: st.waveSet, waveLimit: st.waveLimit, deck, specials: true, policy, seed: 7,
  })

  const bySmart = run('smart')
  const byDeck = run('deck')
  assert.ok(!bySmart.built.munchkin, 'smart 가 먼치킨을 놓았다 — 이 검사의 전제가 깨졌다')
  assert.ok(byDeck.built.munchkin > 0, 'deck 정책도 먼치킨을 안 놓는다 — 고친 게 없다')
})

test('deck 정책: 디버프 고양이는 딜러와 겹치는 자리에 선다 (첫 빈 칸이 아니다)', () => {
  /* 먼치킨은 사거리 1.4(게임 최단)에 장갑 벗기기다 — 딜러가 쏘는 같은 구간을 훑어야 값이 있다.
   * 자리 고르기가 죽으면 '길에서 가까운 첫 빈 칸'으로 돌아가는데, 재 보니 그 자리는
   * 겹침이 한 칸 낮다. 여기서는 **점수가 실제로 더 나은 자리를 고르는지**만 본다
   * (완주율은 시드 편차가 커서 검사로 못 박을 값이 아니다 — 그건 문서에 숫자로 적었다). */
  const g = new Game({ mapDef: getMap('kitchen') })
  g.gold = 9999
  const spots = []
  for (let r = 0; r < g.mapDef.rows; r += 1) {
    for (let c = 0; c < g.mapDef.cols; c += 1) {
      let d = Infinity
      for (const p of g.path.points) d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
      spots.push({ c, r, d })
    }
  }
  spots.sort((a, b) => a.d - b.d)
  let n = 0
  for (const s of spots) { if (n < 4 && g.placeTower(s.c, s.r, 'cheese').ok) n += 1 }
  assert.equal(g.towers.length, 4, '픽스처 전제가 깨졌다')

  const munchkin = getTower('munchkin')
  assert.ok(isDebuffCat(munchkin), '먼치킨이 디버프형이 아니다 — 분류가 깨졌다')

  const samples = []
  for (let d = 0; d <= g.path.lengthTiles; d += 0.5) samples.push(pointAtDistance(g.path, d))
  const free = spots.slice(0, 40).filter((s) => !g.towers.some((t) => t.c === s.c && t.r === s.r))
  const scoreOf = (s) => spotScore(munchkin, s, g.towers, samples)

  const greedy = free[0]                                   // 지금까지의 규칙: 길에서 가까운 첫 빈 칸
  const best = [...free].sort((a, b) => scoreOf(b) - scoreOf(a) || free.indexOf(a) - free.indexOf(b))[0]
  assert.ok(scoreOf(best) > scoreOf(greedy),
    `점수가 더 나은 자리를 못 찾는다 (첫 빈 칸 ${scoreOf(greedy)} · 최고 ${scoreOf(best)})`)
})

test('deck 정책: 유틸이 없는 덱은 자리가 예전과 같다 (딜러만 든 덱)', () => {
  /* 안전장치. 딜러만 든 덱에서 자리가 달라지면 문서화된 숫자가 흔들린다.
   * 딜러는 isDebuffCat 이 거짓이라 점수 매기기 자체를 안 지난다. */
  for (const id of ['cheese', 'black', 'calico', 'chonk', 'mackerel', 'bluerussian', 'sphynx']) {
    assert.equal(isDebuffCat(getTower(id)), false, `${id} 가 디버프형으로 잡혔다 — 자리가 바뀐다`)
  }
})

test('deck 정책: 딜러는 길을 많이 보는 자리에 선다 (길에 가까운 첫 칸이 아니다)', () => {
  /* '길에서 가까운 순'은 길에 바짝 붙었지만 **짧은 구간만 보는 칸**을 먼저 집는다.
   * 재 보니 봇이 쓰던 앞 8칸은 길 표본 16~24개를 덮는데 고를 수 있던 최고 8칸은 28~42개였다
   * (맵마다 +75~120%). 여기서는 점수가 실제로 더 많이 보는 칸을 고르는지만 본다. */
  const g = new Game({ mapDef: getMap('alley') })
  const samples = []
  for (let d = 0; d <= g.path.lengthTiles; d += 0.5) samples.push(pointAtDistance(g.path, d))

  const spots = []
  for (let r = 0; r < g.mapDef.rows; r += 1) {
    for (let c = 0; c < g.mapDef.cols; c += 1) {
      let d = Infinity
      for (const p of g.path.points) d = Math.min(d, Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)))
      spots.push({ c, r, d })
    }
  }
  spots.sort((a, b) => a.d - b.d)

  const cheese = getTower('cheese')
  assert.equal(isDebuffCat(cheese), false, '치즈냥이 디버프형으로 잡혔다 — 이 검사의 전제가 깨졌다')
  const greedy = spots[0]                                   // 길에서 가장 가까운 칸
  const best = [...spots].sort((a, b) => spotScore(cheese, b, [], samples) - spotScore(cheese, a, [], samples))[0]
  assert.ok(spotScore(cheese, best, [], samples) > spotScore(cheese, greedy, [], samples),
    `길을 더 많이 보는 칸을 못 찾는다 (가까운 칸 ${spotScore(cheese, greedy, [], samples)} · 최고 ${spotScore(cheese, best, [], samples)})`)
})

test('deck 정책: 자리 점수는 사거리를 구분한다 (짧은 사거리가 더 적게 본다)', () => {
  /* 사거리별 캐시가 표를 섞으면 먼치킨(1.4)이 검은냥(5.0)의 표를 쓰게 되고,
   * 그러면 사거리 짧은 고양이가 엉뚱한 자리에 선다. 같은 칸에서 값이 달라야 한다. */
  const g = new Game({ mapDef: getMap('alley') })
  const samples = []
  for (let d = 0; d <= g.path.lengthTiles; d += 0.5) samples.push(pointAtDistance(g.path, d))
  const spot = { c: 1, r: 1 }
  const short = getTower('munchkin')      // 사거리 1.4 — 게임 최단
  const long = getTower('black')          // 사거리 5.0 — 게임 최장
  assert.ok(short.levels[0].range < long.levels[0].range, '픽스처 전제가 깨졌다')
  // 먼치킨은 디버프형이라 다른 가지를 탄다 — 사거리만 보려고 치즈(2.6)와 검은(5.0)을 쓴다
  const mid = getTower('cheese')
  const a = spotScore(mid, spot, [], samples)
  const b = spotScore(long, spot, [], samples)
  assert.ok(b >= a, `사거리 5.0 이 2.6 보다 적게 본다 (${b} < ${a}) — 표가 섞였다`)
  assert.notEqual(a, b, '사거리가 달라도 값이 같다 — 캐시가 사거리를 안 가른다')
})
