/**
 * 밸런스를 '해 보고' 검사한다.
 *
 * 지금까지 밸런스 검사는 공식(applyArmor·scaleHp)과 선언 숫자만 봤다.
 * content.test.mjs 의 '맵: 뒤로 갈수록 난이도가 높아진다'는 맵에 적어 둔
 * 값을 비교할 뿐이라, 실제로 돌려 보면 창고가 중앙값 4웨이브이고 다락방이
 * 20판 전부 1웨이브에 죽는데도 초록이었다.
 *
 * game.js 가 DOM 을 안 쓰므로 여기서 그대로 돌린다.
 *
 * 판을 실제로 끝까지 돌리므로 비싸다. 줄일 수는 있지만 줄이지 않는다 —
 * 여기서 아낀 30초 때문에 길냥이가 몇 달 동안 놀 수 없는 상태로 남아 있었다.
 *
 * ── U-3 · 파일 셋으로 나눴다 ────────────────────────────────────────────
 * node --test 는 **파일 단위**로 병렬이다. 이 파일 하나가 105초(바닥 봇 21판 · smart 84판 · deck 63판)라
 * 다른 파일이 다 끝난 뒤에도 혼자 돌았다. 판 수는 한 판도 안 줄이고 셋으로 나눴다:
 *   balance-sim.test.mjs             바닥 봇(치즈냥만) — 초반 붕괴 · 첫 실점 · 도달 순서 · 아깽이 첫 맵
 *   balance-sim-difficulty.test.mjs  smart 봇 × 세 난이도 — 난이도 사다리
 *   balance-sim-ladder.test.mjs      deck 봇 × 시드 셋 — 자유 맵 사다리(완주율 · 남은 목숨)
 * 같은 라운드에서 시뮬레이터 자체도 빨라졌다(mods.js matchCombo · game.js loadout · 봇의 쿨다운 거르기 —
 * 결과는 바이트 단위로 같다, tools/balance-sim 지문으로 대조). 시간은 tools/run-tests.mjs 머리말에.
 *
 * ── 이 검사가 못 보는 것 ────────────────────────────────────────────────
 * 자동 플레이어는 치즈냥만 쓰고 펫·조합·표적 모드·필살기를 안 쓴다. 그래서
 * 절대 수치는 사람보다 비관적이다. 모든 맵에 같은 정책을 대므로 맵끼리의
 * 비교만 유효하다 — 기준도 거기에 맞춰 느슨하게 잡는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listMaps } from '../../web/js/content/registry.js'
import { playMany } from '../../tools/balance-sim.mjs'

const RUNS = 3
/** 시드를 고정한다 — 같은 코드면 같은 결과. 운으로 초록이 됐다 빨개졌다 하지 않게. */
const SEED = 7

/** 맵마다 한 번만 돌리고 결과를 나눠 쓴다 (판당 ~250ms 라 아끼는 게 낫다) */
const results = new Map()
for (const m of listMaps()) results.set(m.id, playMany(m.id, 'normal', RUNS, { seed: SEED }))

test('밸런스: 어떤 맵도 초반에 무너지지 않는다', () => {
  /* 기준 5 는 고치기 전/후를 다 재서 그 사이로 잡았다.
   *   고치기 전  창고 중앙값 4 (범위 4~5) · 다락방 1 (20판 전부)
   *   고친 뒤    창고 30 · 다락방 20 (= 마지막 웨이브까지 도달)
   * 치즈냥만 쓰는 자동 플레이어가 5웨이브도 못 버티면 사람도 못 버틴다. */
  for (const m of listMaps()) {
    const r = results.get(m.id)
    assert.ok(r.median >= 5,
      `${m.name}: 중앙값 ${r.median}웨이브 (범위 ${r.min}~${r.max}) — 초반에 무너진다`)
  }
})

test('밸런스: 가장 쉬운 맵이 가장 오래 버틴다', () => {
  // 등급 사다리가 실제 플레이와 맞는지 보는 최소한의 확인.
  // 전 구간 단조까지 요구하지 않는다 — 난이도 반응이 절벽이라 그 정도로
  // 촘촘하게는 아직 못 맞춘다 (maps.js 머리말 참고).
  const maps = listMaps()
  const easiest = results.get(maps[0].id)
  const hardest = results.get(maps[maps.length - 1].id)
  assert.ok(easiest.median >= hardest.median,
    `${maps[0].name} ${easiest.median}웨이브 < ${maps[maps.length - 1].name} ${hardest.median}웨이브`
    + ' — 첫 맵이 마지막 맵보다 어렵다')
})

test('밸런스: 어떤 맵도 첫 실점이 5웨이브보다 이르지 않다', () => {
  /* 지붕·창고·다락방은 1웨이브에, 부엌은 2웨이브에 실점이 났다 — "짓기 전에 뚫리는" 시작은
   * 첫 판에 가장 나쁘다. 초반 행을 줄인 뒤 잰 값: 골목길 15 · 부엌 5 · 지붕 30 · 창고 30 ·
   * 지하실 7 · 다락방 20. 부엌은 바퀴 떼가 정체성이라 5 에서 멈췄다 — 첫 배치는 끝난 뒤다. */
  for (const m of listMaps()) {
    const r = results.get(m.id)
    assert.ok(r.firstLoss >= 5,
      `${m.name}: 첫 실점 ${r.firstLoss}웨이브 — 초반 웨이브 마릿수를 줄이거나 간격을 늘린다`)
  }
})

test('밸런스: 도달 점수가 ★ 순서로 내려간다 (사다리가 체감과 맞는다)', () => {
  /* 전에는 ★★ 부엌(클리어 100%)이 ★ 골목길(클리어 0%)보다 쉬웠다. 도달 점수 =
   * (클리어면 총 웨이브, 아니면 도달 웨이브−1) + 남은 목숨 비율. 허용 오차 1.5. */
  const maps = listMaps()
  for (let i = 1; i < maps.length; i += 1) {
    const easier = results.get(maps[i - 1].id)
    const harder = results.get(maps[i].id)
    assert.ok(easier.reachScore + 1.5 >= harder.reachScore,
      `${maps[i - 1].name} ${easier.reachScore.toFixed(1)} < ${maps[i].name} ${harder.reachScore.toFixed(1)}`
      + ' — 뒤 맵이 앞 맵보다 쉽다')
  }
})

test('밸런스: 가장 쉬운 난이도에서는 첫 맵을 깰 수 있다', () => {
  // 아무도 못 깨는 게임은 게임이 아니다. 아깽이 난이도의 첫 맵은
  // 치즈냥만 써도 클리어돼야 한다.
  const first = listMaps()[0]
  const r = playMany(first.id, 'kitten', RUNS, { seed: SEED })
  assert.ok(r.clearRate > 0,
    `${first.name} 아깽이 난이도 클리어율 0% (중앙값 ${r.median}/${r.total}웨이브)`)
})

test('카드 고양이: 뽑기로 얻은 고양이가 자유 모드를 대신 깨 주지 않는다', () => {
  /* "뽑기가 진행을 막지 않는다"의 **반대쪽** 약속이다 — 뽑기로 얻은 것이 그냥 더 세면
   * 운 좋은 사람에게는 게임이 사라진다. 같은 맵·같은 시드로 기존 순서와 카드 섞인 순서를
   * 나란히 돌려 카드 쪽이 크게 낫지 않은 것을 본다.
   *
   * 봇의 한계를 알고 쓴다: 고정 순서로 짓고 자리를 안 고르므로 sightaura·mark 처럼
   * "옆을 세게 하는" 효과는 여기서 값이 안 나온다. 그래서 이 검사는 **상한**만 본다
   * (하한은 effects-cards.test 가 메커니즘 단위로 본다). U-3 에서 원정 검사 파일에서 옮겨 왔다 — 원정과 무관하다. */
  const opts = { seed: 7, policy: 'smart', specials: true }
  const base = playMany('alley', 'normal', 2, opts)
  const withCards = playMany('alley', 'normal', 2, {
    ...opts, order: ['cheese', 'cheese', 'munchkin', 'black', 'bengal', 'cheese', 'angora', 'chonk'],
  })
  assert.ok(withCards.reachScore <= base.reachScore + 2,
    `카드 섞은 순서 ${withCards.reachScore.toFixed(1)} vs 기존 ${base.reachScore.toFixed(1)} — 뽑기가 판을 대신 깨고 있다`)
})
