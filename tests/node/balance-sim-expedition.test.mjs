/**
 * 속성 원정 사다리 — **판을 실제로 돌려서** 세 가지를 확인한다.
 *
 *   1. 아무 덱으로나 1칸은 깬다        (들어가자마자 막히지 않는다)
 *   2. 상성을 맞춘 덱이 더 낫다        (속성이 실제로 결과를 바꾼다)
 *   3. 마지막 칸은 아무 덱으로나 안 깨진다 (끝이 남아 있다)
 *
 * `balance-sim.test` 에 얹지 않고 파일을 나눈 이유: 그쪽은 이미 `npm test` 시간의 대부분이고
 * (3난이도 × 6맵 × 3판), 서술 범위도 "맵 사다리 × 난이도 사다리"로 못 박혀 있다. 원정은 축이 다르다.
 *
 * 덱 셋은 `buildTestDecks` 가 **사다리에서 계산해서** 만든다 — 손으로 적어 두면 콘텐츠를 고칠 때
 * 같이 안 고쳐진다. 셋 다 **같은 네 마리**이고 룬만 다르다: 고양이 화력이 아니라 속성을 재려면 그래야 한다
 * (처음엔 다른 고양이로 짰다가 '안 맞춘 덱'이 늘 이겨서, 상성이 아니라 검은냥의 화력을 재고 있었다).
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { getExpedition, listExpeditions } from '../../web/js/content/registry.js'
import { buildTestDecks, playExpeditionMany } from '../../tools/balance-sim.mjs'

const RUNS = 4
const SEED = 7
const EXP = listExpeditions()[0]

/** 세 덱을 한 번만 돌려 공유한다 — 판이 비싸다 */
const decks = buildTestDecks(EXP)
const result = new Map(decks.map((d) => [d.name, {
  d, r: playExpeditionMany(EXP.id, 'normal', RUNS, { deck: d.deck, runes: d.runes, specials: true, policy: 'smart', seed: SEED }),
}]))
const rows = [...result.values()]
const best = rows[0]      // 최선 룬
const plain = rows[1]     // 룬 없음
const uniform = rows[2]   // 도배

test('원정: 어떤 덱으로도 첫 칸은 깬다', () => {
  /* 첫 칸에서 막히면 이 모드는 "속성을 모으기 전엔 못 들어가는 곳"이 된다.
   * 사용자가 고른 무료 원칙과 정면으로 어긋난다. */
  for (const { d, r } of rows) {
    assert.ok(r.minStages >= 1, `${d.name}: 최소 ${r.minStages}칸 — 첫 칸에서 막혔다`)
  }
})

test('원정: 상성을 맞춘 덱이 안 맞춘 덱보다 낫다', () => {
  /* 이게 이 모드가 존재하는 이유다. 여기가 빨개지면 속성은 장식이 된 것이다.
   * 같은 네 마리라 차이는 오직 룬에서 온다. */
  assert.ok(best.r.reachScore > plain.r.reachScore + 0.3,
    `최선 ${best.r.reachScore.toFixed(2)} vs 룬 없음 ${plain.r.reachScore.toFixed(2)} — 룬이 결과를 안 바꾼다`)
  assert.ok(best.r.reachScore > uniform.r.reachScore + 0.3,
    `최선 ${best.r.reachScore.toFixed(2)} vs 도배 ${uniform.r.reachScore.toFixed(2)} — 도배가 최선만큼 좋다`)
  assert.ok(best.r.clearRate > uniform.r.clearRate,
    `완주율 최선 ${best.r.clearRate} vs 도배 ${uniform.r.clearRate}`)
})

test('원정: 한 속성으로 도배하는 것이 정답이 아니다', () => {
  /* 다섯 칸으로 짰을 때 실제로 도배가 최선이었다(사다리에 빛 칸이 없어서 흙 도배에 약점이 없었다).
   * 여섯 칸으로 늘린 이유가 이것이고, 이 검사가 그 이유를 지킨다. */
  assert.ok(uniform.d.min < best.d.min,
    `도배 최약칸 ${uniform.d.min} vs 최선 ${best.d.min} — 도배에 약점이 없다`)
  assert.ok(uniform.r.clearRate < 0.5,
    `도배 덱 완주율 ${Math.round(uniform.r.clearRate * 100)}% — 도배로 반 넘게 깬다`)
})

test('원정: 마지막 칸이 아무 덱으로나 깨지지 않는다', () => {
  const total = EXP.stages.length
  const everyone = rows.every((x) => x.r.clearRate >= 1)
  assert.ok(!everyone, `세 덱이 전부 ${total}칸을 100% 깬다 — 끝이 없다`)
  // 그렇다고 아무도 못 깨면 안 된다 — 잘 맞춘 덱에는 길이 있어야 한다
  assert.ok(best.r.clearRate > 0, `최선 덱도 완주 못 한다 (${total}칸)`)
})

test('원정: 칸이 여섯 속성을 전부 쓴다 (도배에 약점을 만드는 구조 조건)', () => {
  const exp = getExpedition(EXP.id)
  assert.equal(new Set(exp.stages.map((s) => s.element)).size, 6)
})
