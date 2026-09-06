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
 * 판을 돌리는 검사는 하나뿐이다 — `balance-sim.test` 가 이미 `npm test` 시간의 대부분이다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getExpedition, getTower, listTowers, listBossIds } from '../../web/js/content/registry.js'
import { buildCost } from '../../web/js/domain/economy.js'
import { stageRules, DECK_SIZE } from '../../web/js/domain/expedition.js'
import { deckOrder, playOnce, MIXED_ORDER } from '../../tools/balance-sim.mjs'

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
