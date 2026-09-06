/**
 * 카드·룬 보관 — 뽑은 것이 진행도에 제대로 들어가는지, 그리고 **약속 두 개**를 지키는지.
 *
 *   1. 판돈을 받고 빈손으로 돌려보내지 않는다 (중복도 조각이 된다)
 *   2. 운이 나빠도 결국 원하는 카드에 닿는다 (조각 교환)
 *
 * `gacha.test` 는 "무엇이 나오는가"(확률)를, 여기서는 "그것을 어떻게 갖는가"를 본다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  cardCount, runeCount, shardCount, ticketCount,
  applyDraw, applyDraws, canDraw, payDraw, addTickets,
  canExchange, exchangeShards, canEquipRune, equipRune, unequipRune,
} from '../../web/js/domain/cards.js'
import { SHARDS_PER_CARD, SHARDS_PER_DUPLICATE, DRAW_COST_CATNIP, DRAW10_COST_CATNIP, PITY_AT } from '../../web/js/domain/gacha.js'
import { defaultProgress } from '../../web/js/domain/save.js'

const fresh = (over = {}) => ({ ...defaultProgress(), ...over })

test('받은 진행도를 안 고친다 (전부 새 객체를 돌려준다)', () => {
  /* save.js 의 다른 함수들과 같은 규칙. 제자리에서 고치면 되돌리기·비교가 다 깨진다. */
  const p = fresh({ catnip: 500 })
  const snapshot = JSON.parse(JSON.stringify(p))
  applyDraw(p, { kind: 'shard', amount: 15 })
  applyDraw(p, { kind: 'rune', id: 'fire' })
  applyDraw(p, { kind: 'cat', id: 'aurora' })
  payDraw(p)
  addTickets(p, 3)
  equipRune(p, 'cheese', 'fire')
  assert.deepEqual(p, snapshot, '원본이 바뀌었다')
})

test('첫 장은 카드, 중복은 조각이 된다 (빈손이 없다)', () => {
  let p = fresh()
  let r = applyDraw(p, { kind: 'cat', id: 'aurora' })
  p = r.progress
  assert.equal(cardCount(p, 'aurora'), 1)
  assert.equal(r.gained.duplicate, false)
  assert.equal(shardCount(p), 0, '첫 장인데 조각이 생겼다')

  r = applyDraw(p, { kind: 'cat', id: 'aurora' })
  p = r.progress
  assert.equal(cardCount(p, 'aurora'), 2, '중복도 장수는 는다')
  assert.equal(r.gained.duplicate, true)
  assert.equal(shardCount(p), SHARDS_PER_DUPLICATE, '중복이 조각이 안 됐다')
})

test('룬은 개수로 쌓이고, 모르는 속성은 안 받는다', () => {
  let p = fresh()
  for (let i = 0; i < 3; i += 1) p = applyDraw(p, { kind: 'rune', id: 'ice' }).progress
  assert.equal(runeCount(p, 'ice'), 3)

  const bad = applyDraw(p, { kind: 'rune', id: 'fier' })
  assert.equal(bad.gained, null, '오타 속성이 들어갔다')
  assert.deepEqual(bad.progress.runes.owned, p.runes.owned)
})

test('10연을 한 번에 넣는다', () => {
  const results = [
    { kind: 'cat', id: 'aurora' }, { kind: 'cat', id: 'aurora' },
    { kind: 'rune', id: 'fire' }, { kind: 'shard', amount: 15 },
  ]
  const { progress, gained } = applyDraws(fresh(), results)
  assert.equal(gained.length, 4)
  assert.equal(cardCount(progress, 'aurora'), 2)
  assert.equal(runeCount(progress, 'fire'), 1)
  assert.equal(shardCount(progress), 15 + SHARDS_PER_DUPLICATE)
})

test('값은 티켓부터 낸다 — 티켓은 현금으로 못 사니 남겨 둘 이유가 없다', () => {
  const withTicket = addTickets(fresh({ catnip: 999 }), 1)
  const one = canDraw(withTicket)
  assert.equal(one.pay, 'ticket')
  const paid = payDraw(withTicket)
  assert.equal(ticketCount(paid), 0)
  assert.equal(paid.catnip, 999, '티켓으로 냈는데 캣닢이 줄었다')

  const noTicket = fresh({ catnip: 999 })
  assert.equal(canDraw(noTicket).pay, 'catnip')
  assert.equal(payDraw(noTicket).catnip, 999 - DRAW_COST_CATNIP)
})

test('10연은 티켓 10장 또는 캣닢, 모자라면 정직하게 거절한다', () => {
  const rich = addTickets(fresh(), PITY_AT)
  const ten = canDraw(rich, { ten: true })
  assert.equal(ten.pay, 'ticket')
  assert.equal(ticketCount(payDraw(rich, { ten: true })), 0)

  const poor = fresh({ catnip: 0 })
  const no = canDraw(poor, { ten: true })
  assert.equal(no.ok, false)
  assert.equal(no.amount, DRAW10_COST_CATNIP)
  assert.ok(no.reason, '거절 사유가 없다')
  assert.deepEqual(payDraw(poor, { ten: true }), poor, '못 내는데 뭔가 빠져나갔다')

  // 티켓이 9장뿐이면 10연은 티켓으로 못 낸다 (반만 쓰고 나머지를 캣닢으로 메우지 않는다)
  const nine = addTickets(fresh({ catnip: DRAW10_COST_CATNIP }), 9)
  assert.equal(canDraw(nine, { ten: true }).pay, 'catnip')
})

test('조각 교환: 운이 나빠도 결국 원하는 카드에 닿는다', () => {
  const short = fresh()
  const no = canExchange(short, 'aurora')
  assert.equal(no.ok, false)
  assert.equal(no.cost, SHARDS_PER_CARD)
  assert.equal(exchangeShards(short, 'aurora').ok, false)
  assert.equal(cardCount(exchangeShards(short, 'aurora').progress, 'aurora'), 0)

  const rich = { ...fresh(), cards: { owned: {}, shards: SHARDS_PER_CARD } }
  const done = exchangeShards(rich, 'aurora')
  assert.equal(done.ok, true)
  assert.equal(cardCount(done.progress, 'aurora'), 1)
  assert.equal(shardCount(done.progress), 0)

  assert.equal(canExchange(rich, null).ok, false, '고양이를 안 골랐는데 통과됐다')
})

test('룬 장착: 가진 개수만큼만 동시에 낀다 (소모되지는 않는다)', () => {
  /* 룬이 소모품이면 원정마다 다시 뽑아야 해서 상성 맞추기가 자원 스트레스가 된다.
   * 대신 "몇 마리에게 동시에 끼울 수 있나" 로 제한한다 — 이게 J-3 의 밸런스 제동 하나다. */
  let p = applyDraw(fresh(), { kind: 'rune', id: 'fire' }).progress
  assert.equal(runeCount(p, 'fire'), 1)

  const first = equipRune(p, 'cheese', 'fire')
  assert.equal(first.ok, true)
  p = first.progress
  assert.equal(runeCount(p, 'fire'), 1, '장착했는데 룬이 소모됐다')

  const second = equipRune(p, 'black', 'fire')
  assert.equal(second.ok, false, '룬 하나로 두 마리에 꼈다')
  assert.ok(second.reason)
  assert.deepEqual(second.progress.runes.equipped, { cheese: 'fire' })

  // 같은 고양이에 다시 끼우는 건 된다 (자기 자리는 자기가 쓰던 것)
  assert.equal(equipRune(p, 'cheese', 'fire').ok, true)

  // 벗기면 다른 고양이가 쓸 수 있다
  p = unequipRune(p, 'cheese')
  assert.deepEqual(p.runes.equipped, {})
  assert.equal(equipRune(p, 'black', 'fire').ok, true)
})

test('룬 장착: 모르는 속성은 거절한다', () => {
  const p = fresh()
  const r = equipRune(p, 'cheese', 'fier')
  assert.equal(r.ok, false)
  assert.deepEqual(r.progress.runes.equipped, {})
  assert.equal(canEquipRune(p, 'cheese', 'fire').ok, false, '없는 룬을 끼울 수 있다')
})
