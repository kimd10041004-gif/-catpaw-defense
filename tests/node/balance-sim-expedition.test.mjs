/**
 * 속성 원정 사다리 — **판을 실제로 돌려서** 확인한다.
 *
 *   1. 아무 덱으로나 1칸은 깬다        (들어가자마자 막히지 않는다)
 *   2. 상성을 맞춘 덱이 더 낫다        (속성이 실제로 결과를 바꾼다)
 *   3. 마지막 칸은 아무 덱으로나 안 깨진다 (끝이 남아 있다)
 *   4. 뒤 사다리가 앞 사다리보다 안 쉽다
 *
 * `balance-sim.test` 에 얹지 않고 파일을 나눈 이유: 그쪽은 이미 `npm test` 시간의 대부분이고
 * (3난이도 × 6맵 × 3판), 서술 범위도 "맵 사다리 × 난이도 사다리"로 못 박혀 있다. 원정은 축이 다르다.
 *
 * 덱 셋은 `buildTestDecks` 가 만든다. 셋 다 **같은 네 마리**이고 룬만 다르다: 고양이 화력이 아니라
 * 속성을 재려면 그래야 한다(처음엔 다른 고양이로 짰다가 '안 맞춘 덱'이 늘 이겨서, 상성이 아니라
 * 검은냥의 화력을 재고 있었다).
 *
 * ── K-5 에서 세 가지를 바꿨다. 셋 다 "잘 두는 봇 앞에서 이 검사가 거짓말을 했다"에서 나왔다 ──
 *
 * · **봇을 `deck` 으로.** `smart` 는 덱의 카드 고양이를 조용히 안 놓는다 — 덱을 실제로 드는 봇으로 재야 한다.
 * · **지표를 `holdScore` 로.** `deck` 은 실점이 0 이라 완주율·도달 점수가 세 덱 전부 100% / 6.00 으로
 *   포화했고, 그걸 보고 "상성이 결과를 안 바꾼다"고 문서에 적었다. 틀렸다 — 같은 세 덱이 남긴 목숨은
 *   20 / 12 / 9 였다. 버팀 점수는 완주한 뒤 남은 목숨까지 잇는다(0~7).
 * · **"최선" 덱을 공식이 아니라 실측으로.** 룬 배치를 실제 판으로 탐색하니 같은 네 마리로 완주율이
 *   0%~100% 로 갈렸는데, 공식이 고른 "최선"은 그 안에서 하위권이었다. 이제 콘텐츠의 `referenceRunes`
 *   (`--search-runes` 로 잰 것)를 쓰고, **없으면 이 검사가 빨개진다** — 공식으로 떨어진 덱은 주장이 아니다.
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
/** 덱을 실제로 드는 봇. `smart` 로 재면 카드 고양이가 든 덱은 재 본 적이 없는 것이 된다. */
const POLICY = 'deck'

/** 사다리마다 세 덱을 한 번씩만 돌려 공유한다 — 판이 비싸다 */
const measured = listExpeditions().map((exp) => {
  const decks = buildTestDecks(exp)
  const rows = decks.map((d) => {
    const rs = SEEDS.map((seed) => playExpeditionMany(exp.id, 'normal', RUNS, {
      deck: d.deck, runes: d.runes, specials: true, policy: POLICY, seed,
    }))
    const mean = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length
    return { d, r: { clearRate: mean('clearRate'), reachScore: mean('reachScore'), holdScore: mean('holdScore'), minStages: Math.min(...rs.map((r) => r.minStages)) } }
  })
  return { exp, best: rows[0], plain: rows[1], uniform: rows[2], rows }
})
const pct = (x) => `${Math.round(x * 100)}%`

test('원정: 어떤 덱으로도 첫 칸은 깬다', () => {
  /* 첫 칸에서 막히면 이 모드는 "속성을 모으기 전엔 못 들어가는 곳"이 된다.
   * 사용자가 고른 무료 원칙과 정면으로 어긋난다. */
  for (const { exp, rows } of measured) {
    for (const { d, r } of rows) {
      assert.ok(r.minStages >= 1, `${exp.name} · ${d.name}: 최소 ${r.minStages}칸 — 첫 칸에서 막혔다`)
    }
  }
})

test('원정: 기준 덱은 실측한 것이다 (공식으로 떨어지면 주장이 아니다)', () => {
  /* 공식 "최선"이 실측 26개 중 하위권이었다. 공식으로 고른 덱으로 아래 검사를 통과해도 그건
   * 우연이고, 실패해도 상성 탓이 아니다. 콘텐츠가 referenceRunes 를 들고 있어야 한다 —
   * 램프를 바꾸면 `--search-runes` 로 다시 재서 적는다. */
  for (const { exp, best } of measured) {
    assert.ok(best.d.measured, `${exp.name}: referenceRunes 가 없다 — 최선 덱이 공식(${best.d.name})이다`)
  }
})

test('원정: 룬을 맞춘 덱이 아무것도 안 낀 덱보다 낫다', () => {
  /* 이게 이 모드가 존재하는 이유다. 여기가 빨개지면 속성은 장식이 된 것이다.
   * 같은 네 마리라 차이는 오직 룬에서 온다.
   *
   * **완주율이 먼저고 버팀 점수는 보조다.** 처음엔 버팀 점수만 보려 했는데(완주율이 포화해서),
   * 천둥 고개에서 "매번 6칸 끝에서 죽는 덱"이 "75% 깨고 25% 는 2칸에서 죽는 덱"보다 버팀 점수가 높았다 —
   * 평균이 쌍봉을 숨긴다. 이 모드가 묻는 것은 "깨나"다. 완주율이 포화했다면(둘 다 100%) 그건
   * 사다리가 너무 쉬운 것이고 그때만 버팀 점수가 순서를 가른다.
   * 여유 15%p 는 시드 셋 × 4판 = 12판에서 약 두 판이다. */
  for (const { exp, best, plain } of measured) {
    if (best.r.clearRate >= 1 && plain.r.clearRate >= 1) {
      assert.ok(best.r.holdScore > plain.r.holdScore + 0.3,
        `${exp.name}: 둘 다 100% 완주 — 버팀 최선 ${best.r.holdScore.toFixed(2)} vs 룬 없음 ${plain.r.holdScore.toFixed(2)} 가 안 갈린다`)
    } else {
      assert.ok(best.r.clearRate >= plain.r.clearRate + 0.15,
        `${exp.name}: 완주율 최선 ${pct(best.r.clearRate)} vs 룬 없음 ${pct(plain.r.clearRate)} — 룬이 결과를 안 바꾼다`)
    }
  }
})

test('원정: 보스를 고르는 사다리에서는 도배가 답이 아니다', () => {
  /* "도배는 함정이다"는 여섯 칸 사다리의 **구조** 주장이었는데, 잘 두는 봇으로 재니 반만 맞았다.
   * 도배 덱은 한 칸에서 강하고 한 칸에서 약한데, 강한 칸이 가장 두껍고 약한 칸이 가벼우면 그냥 통과한다.
   * 그걸 막는 장치가 **칸마다 보스를 고르는 것**이다(잡몹 속성과 보스 속성, 답할 것이 둘) — 잿불 길·천둥 고개.
   *
   * 서릿길은 보스를 안 고른다(J-6: 서리 지렁이 여왕의 harden 이 장갑 칸과 겹쳐 어느 배치도 낫지 않았다).
   * 그래서 서릿길에서는 도배 얼음이 hpMul ×1.50 까지 100% 다 — 룬 없음이 ×1.35 부터 0% 인데도.
   * 3·4칸(얼음 도배의 약점 자리)을 14~15웨이브로 늘려도 안 물었다. hpMul·waveLimit 로는 못 막는다.
   * 그러니 이 주장은 **보스를 고르는 사다리에만** 건다. 서릿길에 다시 걸려면 보스를 고르게 해야 한다. */
  for (const { exp, best, uniform } of measured) {
    if (!exp.stages.some((st) => st.boss)) continue
    assert.ok(best.r.clearRate >= uniform.r.clearRate + 0.15 || (best.r.clearRate >= 1 && best.r.holdScore > uniform.r.holdScore + 0.3),
      `${exp.name}: 완주율 최선 ${pct(best.r.clearRate)} vs 도배 ${pct(uniform.r.clearRate)} — 도배가 답이다`)
  }
})

test('원정: 룬 없이는 절반도 못 깬다 (사람이 "쉽다"고 한 뒤의 기준)', () => {
  /* 상성이 결과를 바꾸는 것과 별개로, 사다리 자체가 거저면 안 된다. 잘 두는 봇이 룬 없이
   * 절반 넘게 완주하면 룬을 고를 이유가 없다. 목표는 룬 없음 17~33% 였다 — 여기서는 상한만 본다. */
  for (const { exp, plain } of measured) {
    assert.ok(plain.r.clearRate <= 0.5,
      `${exp.name}: 룬 없는 덱 완주 ${pct(plain.r.clearRate)} — 룬 없이도 절반 넘게 깬다`)
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
   * 실제로 서릿길을 처음 만들었을 때 룬 없는 덱 완주율이 60% 로 잿불 길(17%)보다 쉬웠다.
   *
   * 버팀 점수로 본다. 완주율로 보면 앞 사다리가 0% 에 닿는 순간 뒤 사다리도 정확히 0% 여야 해서
   * (`<=`) 램프가 거기 못 박혔다 — K 에서 천둥 고개가 그렇게 묶였다. 여유 0.25 는 반 칸 미만이다. */
  for (let i = 1; i < measured.length; i += 1) {
    const prev = measured[i - 1]
    const cur = measured[i]
    if (!cur.exp.requires) continue
    assert.ok(cur.plain.r.holdScore <= prev.plain.r.holdScore + 0.25,
      `${cur.exp.name}(룬 없음 버팀 ${cur.plain.r.holdScore.toFixed(2)}) 이 ${prev.exp.name}(${prev.plain.r.holdScore.toFixed(2)}) 보다 쉽다`)
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
