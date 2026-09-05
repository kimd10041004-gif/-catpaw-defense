/**
 * 밸런스를 '해 보고' 검사한다.
 *
 * 지금까지 밸런스 검사는 공식(applyArmor·scaleHp)과 선언 숫자만 봤다.
 * content.test.mjs 의 '맵: 뒤로 갈수록 난이도가 높아진다'는 맵에 적어 둔
 * 값을 비교할 뿐이라, 실제로 돌려 보면 창고가 중앙값 4웨이브이고 다락방이
 * 20판 전부 1웨이브에 죽는데도 초록이었다.
 *
 * game.js 가 DOM 을 안 쓰므로 여기서 그대로 돌린다. 판 수를 적게 잡아
 * npm test 가 느려지지 않게 한다 (6맵 × 3판 ≈ 8초).
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
