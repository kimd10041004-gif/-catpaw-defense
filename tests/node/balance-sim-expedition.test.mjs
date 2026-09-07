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
import { listExpeditions } from '../../web/js/content/registry.js'
import { buildTestDecks, playExpeditionMany, playMany } from '../../tools/balance-sim.mjs'

const RUNS = 4
/** 시드 셋. 하나로 재면 완주율이 0/25/50/75/100 로만 움직여서 '최선이 기본보다 낫다'가
 *  운에 걸린다 — K 에서 같은 콘텐츠가 시드 7 로는 0%, 시드 7·23 으로는 38% 로 읽혔다. */
const SEEDS = [7, 23, 11]

/** 사다리마다 세 덱을 한 번씩만 돌려 공유한다 — 판이 비싸다 */
const measured = listExpeditions().map((exp) => {
  const decks = buildTestDecks(exp)
  const rows = decks.map((d) => {
    const rs = SEEDS.map((seed) => playExpeditionMany(exp.id, 'normal', RUNS, {
      deck: d.deck, runes: d.runes, specials: true, policy: 'smart', seed,
    }))
    const mean = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length
    return { d, r: { clearRate: mean('clearRate'), reachScore: mean('reachScore'), minStages: Math.min(...rs.map((r) => r.minStages)) } }
  })
  return { exp, best: rows[0], plain: rows[1], uniform: rows[2], rows }
})

test('원정: 어떤 덱으로도 첫 칸은 깬다', () => {
  /* 첫 칸에서 막히면 이 모드는 "속성을 모으기 전엔 못 들어가는 곳"이 된다.
   * 사용자가 고른 무료 원칙과 정면으로 어긋난다. */
  for (const { exp, rows } of measured) {
    for (const { d, r } of rows) {
      assert.ok(r.minStages >= 1, `${exp.name} · ${d.name}: 최소 ${r.minStages}칸 — 첫 칸에서 막혔다`)
    }
  }
})

test('원정: 룬을 어려운 칸에 맞춘 덱이 아무것도 안 낀 덱보다 낫다', () => {
  /* 이게 이 모드가 존재하는 이유다. 여기가 빨개지면 속성은 장식이 된 것이다.
   * 같은 네 마리라 차이는 오직 룬에서 온다.
   *
   * "최선"의 기준을 한 번 고쳤다: 처음엔 **최약칸 최대화**로 골랐는데 그 덱이 아무것도 안 낀 덱에
   * 졌다. 여섯 속성을 한 칸씩 쓰는 사다리에서는 덱 전체의 배수 합이 룬과 무관하게 늘 같아서
   * (고양이당 1.5+0.7+1×4 = 6.2), 룬은 힘을 더하는 게 아니라 **어느 칸에 몰지**를 정할 뿐이다.
   * 그래서 지금은 칸의 hpMul 로 나눈 값의 최솟값을 최대화한다 — "어려운 칸에 강한가". */
  for (const { exp, best, plain, uniform } of measured) {
    assert.ok(best.r.reachScore > plain.r.reachScore + 0.3,
      `${exp.name}: 최선 ${best.r.reachScore.toFixed(2)} vs 룬 없음 ${plain.r.reachScore.toFixed(2)} — 룬이 결과를 안 바꾼다`)
    assert.ok(best.r.clearRate > plain.r.clearRate,
      `${exp.name}: 완주율 최선 ${best.r.clearRate} vs 룬 없음 ${plain.r.clearRate}`)
    assert.ok(best.r.clearRate > uniform.r.clearRate,
      `${exp.name}: 완주율 최선 ${best.r.clearRate} vs 도배 ${uniform.r.clearRate}`)
  }
})

test('원정: 한 속성으로 도배하는 것이 정답이 아니다', () => {
  /* 다섯 칸으로 짰을 때 실제로 도배가 최선이었다(사다리에 빛 칸이 없어서 흙 도배에 약점이 없었다).
   * 여섯 칸으로 늘린 이유가 이것이고, 이 검사가 그 이유를 지킨다.
   *
   * "도배는 못 깬다"까지는 주장하지 않는다 — 한 속성에 몰면 어느 한 칸은 4×1.5 = 6.0 이 되므로
   * 그 칸이 마침 제일 어려우면 통할 수도 있다. 주장하는 것은 **최약칸이 더 나쁘다**는 구조와
   * **최선 덱보다 못하다**는 결과다(위 검사). */
  for (const { exp, best, uniform } of measured) {
    assert.ok(uniform.d.min < best.d.min,
      `${exp.name}: 도배 최약칸 ${uniform.d.min} vs 최선 ${best.d.min} — 도배에 약점이 없다`)
  }
})

test('원정: 마지막 칸이 아무 덱으로나 깨지지 않는다', () => {
  for (const { exp, best, rows } of measured) {
    assert.ok(!rows.every((x) => x.r.clearRate >= 1), `${exp.name}: 세 덱이 전부 100% 깬다 — 끝이 없다`)
    assert.ok(best.r.clearRate > 0, `${exp.name}: 최선 덱도 완주 못 한다`)
  }
})

test('원정: 칸이 여섯 속성을 전부 쓴다 (도배에 약점을 만드는 구조 조건)', () => {
  for (const exp of listExpeditions()) {
    assert.equal(new Set(exp.stages.map((s) => s.element)).size, 6, `${exp.name}`)
  }
})

test('원정: 뒤 사다리가 앞 사다리보다 쉽지 않다', () => {
  /* 선행 조건이 붙은 사다리가 더 쉬우면 순서가 거짓말이 된다.
   * 실제로 서릿길을 처음 만들었을 때 룬 없는 덱 완주율이 60% 로 잿불 길(17%)보다 쉬웠다. */
  for (let i = 1; i < measured.length; i += 1) {
    const prev = measured[i - 1]
    const cur = measured[i]
    if (!cur.exp.requires) continue
    assert.ok(cur.plain.r.clearRate <= prev.plain.r.clearRate,
      `${cur.exp.name}(룬 없음 ${cur.plain.r.clearRate}) 이 ${prev.exp.name}(${prev.plain.r.clearRate}) 보다 쉽다`)
  }
})

test('카드 고양이: 뽑기로 얻은 고양이가 자유 모드를 대신 깨 주지 않는다', () => {
  /* "뽑기가 진행을 막지 않는다"의 **반대쪽** 약속이다 — 뽑기로 얻은 것이 그냥 더 세면
   * 운 좋은 사람에게는 게임이 사라진다. 같은 맵·같은 시드로 기존 순서와 카드 섞인 순서를
   * 나란히 돌려 카드 쪽이 크게 낫지 않은 것을 본다.
   *
   * 봇의 한계를 알고 쓴다: 고정 순서로 짓고 자리를 안 고르므로 sightaura·mark 처럼
   * "옆을 세게 하는" 효과는 여기서 값이 안 나온다. 그래서 이 검사는 **상한**만 본다
   * (하한은 effects-cards.test 가 메커니즘 단위로 본다). */
  const opts = { seed: 7, policy: 'smart', specials: true }
  const base = playMany('alley', 'normal', 2, opts)
  const withCards = playMany('alley', 'normal', 2, {
    ...opts, order: ['cheese', 'cheese', 'munchkin', 'black', 'bengal', 'cheese', 'angora', 'chonk'],
  })
  assert.ok(withCards.reachScore <= base.reachScore + 2,
    `카드 섞은 순서 ${withCards.reachScore.toFixed(1)} vs 기존 ${base.reachScore.toFixed(1)} — 뽑기가 판을 대신 깨고 있다`)
})
