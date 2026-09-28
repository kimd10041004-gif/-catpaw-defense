/**
 * 카드·룬 보관 — 뽑은 결과를 진행도에 넣고, 중복을 조각으로 녹이고, 조각을 카드로 바꾼다.
 *
 * `gacha.js` 는 **무엇이 나오는지**만 정하고(순수·시드), 여기는 **그것을 어떻게 갖는지**만 정한다.
 * 둘을 나눈 이유: 뽑기 확률은 공개하는 약속이라 그 파일이 표 하나로 얇아야 하고,
 * 보관 규칙(중복·조각·티켓)은 진행도 모양을 알아야 해서 성격이 다르다.
 *
 * 이 파일의 함수는 전부 **새 진행도를 돌려준다** — 받은 것을 안 고친다(save.js 의 다른 함수들과 같은 규칙).
 */

import { SHARDS_PER_CARD, SHARDS_PER_DUPLICATE, DRAW_COST_CATNIP, DRAW10_COST_CATNIP, PITY_AT } from './gacha.js'
import { isElement } from './elements.js'
import { addCatnip } from './save.js'
import { tr } from '../i18n/index.js'

/** 이미 가진 카드인가 */
export function cardCount(progress, catId) {
  const owned = (progress && progress.cards && progress.cards.owned) || {}
  return owned[catId] || 0
}

/** 가진 룬 개수 */
export function runeCount(progress, element) {
  const owned = (progress && progress.runes && progress.runes.owned) || {}
  return owned[element] || 0
}

export function shardCount(progress) {
  return (progress && progress.cards && progress.cards.shards) || 0
}

export function ticketCount(progress) {
  return (progress && progress.tickets) || 0
}

/**
 * 뽑은 것 하나를 진행도에 넣는다.
 *
 * **중복 카드는 버리지 않고 조각으로 녹인다.** 이미 가진 고양이가 또 나왔을 때 "꽝"이면
 * 뽑기가 금세 재미없어지고, 무엇보다 판돈을 받고 아무것도 안 준 셈이 된다.
 *
 * @returns {{ progress: object, gained: {kind: string, id?: string, amount?: number, duplicate?: boolean} }}
 */
export function applyDraw(progress, result) {
  if (!result) return { progress, gained: null }

  if (result.kind === 'shard') {
    return {
      progress: withShards(progress, shardCount(progress) + result.amount),
      gained: { kind: 'shard', amount: result.amount },
    }
  }

  if (result.kind === 'rune') {
    if (!isElement(result.id)) return { progress, gained: null }
    const owned = { ...((progress.runes && progress.runes.owned) || {}) }
    owned[result.id] = (owned[result.id] || 0) + 1
    return {
      progress: { ...progress, runes: { ...progress.runes, owned } },
      gained: { kind: 'rune', id: result.id },
    }
  }

  if (result.kind === 'cat') {
    const have = cardCount(progress, result.id)
    const owned = { ...((progress.cards && progress.cards.owned) || {}) }
    owned[result.id] = have + 1
    let next = { ...progress, cards: { ...progress.cards, owned } }
    if (have > 0) next = withShards(next, shardCount(next) + SHARDS_PER_DUPLICATE)
    return { progress: next, gained: { kind: 'cat', id: result.id, duplicate: have > 0 } }
  }

  return { progress, gained: null }
}

/** 여러 장을 차례로 넣는다 (10연) */
export function applyDraws(progress, results) {
  let cur = progress
  const gained = []
  for (const r of results) {
    const step = applyDraw(cur, r)
    cur = step.progress
    if (step.gained) gained.push(step.gained)
  }
  return { progress: cur, gained }
}

function withShards(progress, shards) {
  return { ...progress, cards: { ...progress.cards, shards: Math.max(0, Math.floor(shards)) } }
}

/**
 * 뽑을 수 있나 — 티켓이 있으면 티켓으로, 없으면 캣닢으로.
 * 티켓을 먼저 쓰는 이유: 티켓은 현금으로 못 사고 쌓이기만 하는 자원이라, 남겨 둘 이유가 없다.
 */
export function canDraw(progress, { ten = false } = {}) {
  const need = ten ? PITY_AT : 1
  const cost = ten ? DRAW10_COST_CATNIP : DRAW_COST_CATNIP
  if (ticketCount(progress) >= need) return { ok: true, pay: 'ticket', amount: need }
  if ((progress.catnip || 0) >= cost) return { ok: true, pay: 'catnip', amount: cost }
  return { ok: false, pay: null, amount: cost, reason: tr('캣닢이 모자란다') }
}

/** 값을 치른다. canDraw 가 ok 일 때만 부른다. */
export function payDraw(progress, { ten = false } = {}) {
  const check = canDraw(progress, { ten })
  if (!check.ok) return progress
  if (check.pay === 'ticket') {
    return { ...progress, tickets: Math.max(0, ticketCount(progress) - check.amount) }
  }
  return addCatnip(progress, -check.amount)
}

/** 티켓을 준다 (출석·원정 보상) */
export function addTickets(progress, n) {
  return { ...progress, tickets: Math.max(0, ticketCount(progress) + Math.floor(n)) }
}

/**
 * 조각으로 원하는 카드를 산다 — **운이 나빠도 결국 도달한다**는 약속이다.
 * 이미 가진 카드도 살 수 있다(그러면 그 카드가 한 장 는다). 막을 이유가 없다.
 */
export function canExchange(progress, catId) {
  if (!catId) return { ok: false, reason: tr('고양이를 고르지 않았다'), cost: SHARDS_PER_CARD }
  const have = shardCount(progress)
  if (have < SHARDS_PER_CARD) {
    return { ok: false, reason: tr('조각이 모자란다'), cost: SHARDS_PER_CARD, have }
  }
  return { ok: true, cost: SHARDS_PER_CARD, have }
}

export function exchangeShards(progress, catId) {
  const check = canExchange(progress, catId)
  if (!check.ok) return { progress, ok: false, reason: check.reason }
  const owned = { ...((progress.cards && progress.cards.owned) || {}) }
  owned[catId] = (owned[catId] || 0) + 1
  const next = { ...progress, cards: { owned, shards: shardCount(progress) - SHARDS_PER_CARD } }
  return { progress: next, ok: true, reason: null }
}

/**
 * 룬을 고양이에게 끼운다 / 뺀다.
 *
 * **끼운 룬은 소모되지 않는다** — 개수는 "몇 마리에게 동시에 끼울 수 있나"를 뜻한다.
 * 소모품으로 두면 원정마다 다시 뽑아야 해서, 상성을 맞추는 재미가 자원 관리 스트레스가 된다.
 * 대신 개수 제한이 J-3 의 밸런스 제동 중 하나다(한 원정에서 커버할 수 있는 속성이 제한된다).
 */
export function canEquipRune(progress, towerId, element) {
  if (!isElement(element)) return { ok: false, reason: tr('모르는 속성이다') }
  const equipped = (progress.runes && progress.runes.equipped) || {}
  const used = Object.entries(equipped).filter(([t, e]) => e === element && t !== towerId).length
  if (runeCount(progress, element) <= used) {
    return { ok: false, reason: tr('그 속성 룬을 이미 다 끼웠다') }
  }
  return { ok: true, reason: null }
}

export function equipRune(progress, towerId, element) {
  const check = canEquipRune(progress, towerId, element)
  if (!check.ok) return { progress, ok: false, reason: check.reason }
  const equipped = { ...((progress.runes && progress.runes.equipped) || {}), [towerId]: element }
  return { progress: { ...progress, runes: { ...progress.runes, equipped } }, ok: true, reason: null }
}

export function unequipRune(progress, towerId) {
  const equipped = { ...((progress.runes && progress.runes.equipped) || {}) }
  delete equipped[towerId]
  return { ...progress, runes: { ...progress.runes, equipped } }
}
