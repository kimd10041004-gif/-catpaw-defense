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

/**
 * `stageRules` 가 `stage.boss` 를 못 살릴 때 조용히 지나가지 않게 한다.
 * 메시지가 영어인 건 이것이 **사람에게 안 보이는 개발자용 오류**이기 때문이다 —
 * 이 파일은 i18n 스캔의 wrap 대상이라 한글 리터럴은 전부 tr() 을 지나야 한다.
 */
export class ExpeditionError extends Error {}

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

/**
 * 들어갈 수 있나 — 덱을 채울 고양이가 있고, 선행 원정을 깼는가.
 * @param {object} [exp] 원정 정의. 주면 `requires`(앞 사다리 완주)까지 본다.
 */
export function canEnter(progress, allTowerIds, exp = null) {
  const have = ownedCats(progress, allTowerIds).length
  if (have < DECK_SIZE) {
    return { ok: false, have, need: DECK_SIZE, reason: 'cats' }
  }
  if (exp && exp.requires && !isCleared(progress, exp.requires)) {
    return { ok: false, have, need: DECK_SIZE, reason: 'requires', requires: exp.requires }
  }
  return { ok: true, have, need: DECK_SIZE, reason: null }
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
export function stageRules(stage, deck, allTowerIds, allBossIds = []) {
  const inDeck = new Set(Array.isArray(deck) ? deck : [])
  const banned = (Array.isArray(allTowerIds) ? allTowerIds : []).filter((id) => !inDeck.has(id))
  /* 칸이 들고 있는 도전 규칙을 **먼저** 깔고, 모드가 정하는 것으로 덮는다.
   * 순서가 중요하다 — 반대로 하면 칸의 rules 가 덱 제한이나 지배 속성을 지워 버린다
   * (registerExpedition 이 그 셋을 애초에 거부하지만, 여기서도 순서로 한 번 더 막는다). */
  const rules = { ...((stage && stage.rules) || {}), elemental: true, bannedTowers: banned }
  if (stage && isElement(stage.element)) rules.enemyElement = stage.element
  // 칸의 조율 손잡이. 맵의 tier·hpMul 위에 얹힌다 — 짧게 자른 웨이브셋의 무게를 여기서 되돌린다.
  if (stage && stage.hpMul > 0) rules.hpMul = stage.hpMul
  if (stage && stage.boss) {
    rules.replace = bossReplace(stage.boss, allBossIds)
    // 고른 보스만 제 속성을 지킨다 — 안 고른 칸은 J-6 이전 그대로 전부 지배 속성이다
    rules.bossOwnElement = true
  }
  return rules
}

/**
 * 칸의 보스 지정을 **기존 `replace` 규칙으로 번역한다** — 새 엔진 코드가 0줄이다.
 * (덱 제한을 새 규칙 키 없이 `bannedTowers` 로 표현한 것과 같은 결이다.)
 *
 * 웨이브셋 표를 안 읽고 **보스 전체 목록**을 받아 통째로 치환한다. 표를 읽으면 `waveLimit` 자르기와
 * 얽혀 순수 함수가 레지스트리를 알아야 하고, 안 나오는 보스를 치환 표에 넣어 봐야 아무 일도 안 난다.
 *
 * 목록에 그 보스가 없으면 **던진다.** 빈 표를 조용히 돌려주면 칸이 보스를 지정했는데
 * 게임에는 안 걸리는 상태가 되고, 그건 화면을 봐야만 잡히는 종류의 버그다(J-5 의 `frames:` 처럼).
 */
export function bossReplace(bossId, allBossIds) {
  const all = Array.isArray(allBossIds) ? allBossIds : []
  if (!all.includes(bossId)) {
    throw new ExpeditionError(`stageRules: stage.boss '${bossId}' is not in allBossIds [${all.join(', ')}]`)
  }
  return Object.fromEntries(all.filter((id) => id !== bossId).map((id) => [id, bossId]))
}

/**
 * 덱이 이 칸에 얼마나 맞나 — 들어가기 전에 보여 준다.
 * 가리면 뽑기 운 게임이 되고, 보이면 "무엇을 포기할까"가 된다.
 *
 * @param {string[]} deck 고양이 id
 * @param {(id: string) => string|null} elementOf 그 고양이의 지금 속성
 */
export function deckMatch(deck, stage, elementOf) {
  return matchElement(deck, stage && stage.element, elementOf)
}

/**
 * 덱이 **한 속성**에 얼마나 맞나. `deckMatch`(칸의 잡몹)와 보스 쪽이 같은 셈을 쓴다 —
 * J-6 부터 칸이 묻는 속성이 둘이라(잡몹·보스) 화면에도 둘을 나란히 보여 준다.
 */
export function matchElement(deck, target, elementOf) {
  const out = { strong: 0, weak: 0, neutral: 0 }
  for (const id of deck || []) {
    const mul = elementMul(elementOf(id), target)
    if (mul === STRONG) out.strong += 1
    else if (mul === WEAK) out.weak += 1
    else out.neutral += 1
  }
  return out
}

/**
 * 이 칸에 **실제로 나올 보스** id 들. 화면이 들어가기 전에 보여 주는 데 쓴다 —
 * 가리면 뽑기 운 게임이 되고, 보이면 "무엇을 포기할까"가 된다(`deckMatch` 와 같은 이유다).
 *
 * 칸이 `boss` 를 골랐으면 그것 하나다(`stageRules` 가 나머지를 전부 그것으로 치환한다).
 * 안 골랐으면 웨이브셋 표에서 `waveLimit` 까지 훑어 세어 준다 — 적어 두지 않고 세는 이유는
 * 표를 고치면 저절로 따라가야 하기 때문이다(그림 개수를 안 박아 두는 것과 같다).
 *
 * @param {object} stage
 * @param {Array} waveTable 그 칸 웨이브셋의 표
 * @param {(id: string) => boolean} isBoss
 */
export function stageBossIds(stage, waveTable, isBoss) {
  const rows = (Array.isArray(waveTable) ? waveTable : []).slice(0, (stage && stage.waveLimit) || undefined)
  const found = []
  for (const w of rows) {
    for (const g of (Array.isArray(w) ? w : [])) {
      const id = Array.isArray(g) ? g[0] : null
      if (id && isBoss(id) && !found.includes(id)) found.push(id)
    }
  }
  // 고른 보스는 표에 보스가 하나라도 있어야 실제로 나온다 — 치환은 있는 것을 바꿀 뿐 새로 넣지 않는다
  if (stage && stage.boss) return found.length ? [stage.boss] : []
  return found
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

/**
 * 맵 목록 카드에 보일 사다리 하나 — **깨지 않은 것 중 가장 앞**, 다 깼으면 마지막 것.
 * 카드를 사다리 수만큼 늘리지 않는 이유: 맵 목록은 이미 길고, 사람이 다음에 할 것은 하나뿐이다.
 * (여러 개를 보고 싶으면 시트 안의 사다리 칩에서 고른다.)
 */
export function currentExpedition(progress, list) {
  const all = Array.isArray(list) ? list : []
  if (all.length === 0) return null
  return all.find((e) => !isCleared(progress, e.id)) || all[all.length - 1]
}

/** 저장해 둔 마지막 덱 — 다음에 열 때 그대로 채워 준다 */
export function savedDeck(progress, allTowerIds) {
  const deck = (progress && progress.expedition && progress.expedition.deck) || []
  const owned = new Set(ownedCats(progress, allTowerIds))
  return deck.filter((id) => owned.has(id)).slice(0, DECK_SIZE)
}
