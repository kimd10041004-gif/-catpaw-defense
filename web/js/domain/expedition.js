/**
 * 속성 원정 — 칸을 이어서 도는 모드. **상성이 실제로 걸리는 유일한 곳이다.**
 *
 * 규칙 셋이 전부다:
 *   1. **덱 4마리만** 데려간다 (9마리를 다 못 쓰는 것이 이 모드다)
 *   2. **목숨이 칸 사이로 이어진다** — 죽으면 그 원정은 끝, 처음부터
 *   3. 칸마다 **적의 지배 속성**이 다르다 — 들어가기 전에 보여 준다
 *
 * 왜 덱을 4마리로 묶나: 아홉을 다 데려가면 여섯 속성을 거의 다 덮어서 상성이 "고르면 되는 것"이 된다.
 * 넷이면 무엇을 포기할지 정해야 하고, 그 선택이 이 모드의 놀이다.
 *
 * 왜 룬을 원정 중에 못 바꾸나: 칸마다 갈아 끼우면 위 3번이 의미를 잃는다(늘 유리한 채로 돈다).
 * 덱과 룬은 **원정을 시작할 때 굳는다** — 판 중에 펫·스킨이 안 바뀌는 것과 같은 규칙이다.
 *
 * 이 파일은 순수하다. 기록은 `save.js` 의 `recordExpedition`, 사다리는 `content/expeditions.js`.
 */

import { isElement, elementMul, STRONG, WEAK } from './elements.js'

/** 원정에 데려가는 고양이 수. 이 숫자가 이 모드의 규칙 그 자체다. */
export const DECK_SIZE = 4

/**
 * 지금 쓸 수 있는 고양이 id — 해금된 것 + 카드로 가진 것.
 * `game.isTowerUnlocked` 와 같은 규칙이어야 한다(둘이 어긋나면 덱에 넣었는데 못 놓는 고양이가 생긴다).
 */
export function ownedCats(progress, allTowerIds) {
  const all = Array.isArray(allTowerIds) ? allTowerIds : []
  const unlocked = progress && progress.unlockedTowers
  const cards = (progress && progress.cards && progress.cards.owned) || {}
  if (!Array.isArray(unlocked)) return [...all]
  return all.filter((id) => unlocked.includes(id) || cards[id] > 0)
}

/** 덱을 채울 만큼 고양이가 있나 */
export function canEnter(progress, allTowerIds) {
  const have = ownedCats(progress, allTowerIds).length
  if (have < DECK_SIZE) {
    return { ok: false, have, need: DECK_SIZE }
  }
  return { ok: true, have, need: DECK_SIZE }
}

/** 고양이의 지금 속성 — 룬을 끼웠으면 룬, 아니면 타고난 것. `game.placeTower` 와 같은 규칙. */
export function towerElement(progress, def) {
  if (!def) return null
  const eq = progress && progress.runes && progress.runes.equipped
  return (eq && eq[def.id]) || def.element || null
}

/**
 * 칸 하나를 `new Game({ rules })` 에 그대로 넘길 규칙으로 바꾼다.
 *
 * 덱 제한은 **새 규칙 키를 안 만든다** — `bannedTowers`(전체 − 덱)로 표현한다.
 * `game.placeTower` 가 이미 그걸 막고 있어서 엔진에 새 분기가 안 생긴다.
 */
export function stageRules(stage, deck, allTowerIds) {
  const inDeck = new Set(Array.isArray(deck) ? deck : [])
  const banned = (Array.isArray(allTowerIds) ? allTowerIds : []).filter((id) => !inDeck.has(id))
  const rules = { elemental: true, bannedTowers: banned }
  if (stage && isElement(stage.element)) rules.enemyElement = stage.element
  // 칸의 조율 손잡이. 맵의 tier·hpMul 위에 얹힌다 — 짧게 자른 웨이브셋의 무게를 여기서 되돌린다.
  if (stage && stage.hpMul > 0) rules.hpMul = stage.hpMul
  return rules
}

/**
 * 덱이 이 칸에 얼마나 맞나 — 들어가기 전에 보여 준다.
 * 가리면 뽑기 운 게임이 되고, 보이면 "무엇을 포기할까"가 된다.
 *
 * @param {string[]} deck 고양이 id
 * @param {(id: string) => string|null} elementOf 그 고양이의 지금 속성
 */
export function deckMatch(deck, stage, elementOf) {
  const out = { strong: 0, weak: 0, neutral: 0 }
  const target = stage && stage.element
  for (const id of deck || []) {
    const mul = elementMul(elementOf(id), target)
    if (mul === STRONG) out.strong += 1
    else if (mul === WEAK) out.weak += 1
    else out.neutral += 1
  }
  return out
}

/** 이 원정에서 지금까지 도달한 칸 수 (0 = 아직 한 칸도 못 깼다) */
export function reachedStage(progress, expId) {
  const best = (progress && progress.expedition && progress.expedition.best) || {}
  return Math.max(0, Math.floor(best[expId] || 0))
}

/** 끝까지 깼나 */
export function isCleared(progress, expId) {
  const list = (progress && progress.expedition && progress.expedition.cleared) || []
  return list.includes(expId)
}

/** 저장해 둔 마지막 덱 — 다음에 열 때 그대로 채워 준다 */
export function savedDeck(progress, allTowerIds) {
  const deck = (progress && progress.expedition && progress.expedition.deck) || []
  const owned = new Set(ownedCats(progress, allTowerIds))
  return deck.filter((id) => owned.has(id)).slice(0, DECK_SIZE)
}
