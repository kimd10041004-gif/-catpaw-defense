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
 * **이 파일이 npm test 시간의 대부분이다** (전체 ~47초 중 ~40초). 아래 '난이도' 묶음이
 * 3난이도 × 6맵 × 3판 = 54판을 실제로 끝까지 돌리기 때문이다. 줄일 수는 있지만 줄이지 않는다 —
 * 여기서 아낀 30초 때문에 길냥이가 몇 달 동안 놀 수 없는 상태로 남아 있었다.
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
import { DIFFICULTIES } from '../../web/js/domain/settings.js'

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

/* ──────────────────────────────────────────────────────────────────────────
 * 사람이 고를 수 있는 것을 전부 본다.
 *
 * 위 검사들은 전부 '집냥이'만 봤다(하나가 아깽이 첫 맵을 볼 뿐이다). 그래서 **길냥이는
 * 아무도 보지 않았고, 실제로 망가져 있었다**: 첫 실점이 4~6웨이브, 도달 중앙이 7~10웨이브.
 * 위의 두 기준(`median >= 5`, `firstLoss >= 5`)을 길냥이에 대 보면 그때도 빨갰다 — 안 댔을 뿐이다.
 *
 * 여기서는 `smart` 봇을 쓴다. 위 검사의 `cheese` 봇은 바닥 기준이라 난이도 차이가 잘 안 보인다
 * (치즈냥만 놓으면 아깽이든 길냥이든 비슷하게 못 깬다). smart 는 공중을 보고 펫을 데려가고
 * 보스에 필살기를 쓴다 — 사람에 더 가깝고, 그래서 난이도 사이의 간격이 실제 체감에 가깝다.
 * ────────────────────────────────────────────────────────────────────────── */

const DIFF_RUNS = 3
/** 난이도 × 맵 → playMany 결과. 한 번만 돌리고 아래 검사들이 나눠 쓴다. */
const byDiff = new Map()
for (const id of Object.keys(DIFFICULTIES)) {
  byDiff.set(id, new Map(listMaps().map((m) =>
    [m.id, playMany(m.id, id, DIFF_RUNS, { seed: SEED, policy: 'smart', specials: true })])))
}

test('난이도: 어느 난이도에서도 첫 실점이 5웨이브보다 이르지 않다', () => {
  /* 길냥이는 골드 배수 0.85 때문에 첫 두세 마리를 못 사서 4~6웨이브에 이미 새고 있었다.
   * 골드 삭감을 없애자(1.00) 최악이 10웨이브로 올라갔다 — settings.js DIFFICULTIES 머리말 참고. */
  for (const [diffId, maps] of byDiff) {
    for (const m of listMaps()) {
      const r = maps.get(m.id)
      assert.ok(r.firstLoss >= 5,
        `${DIFFICULTIES[diffId].name} ${m.name}: 첫 실점 ${r.firstLoss}웨이브 — 짓기도 전에 뚫린다`)
    }
  }
})

test('난이도: 어느 난이도에서도 표의 3분의 1은 넘긴다', () => {
  /* "어렵다"와 "시작하자마자 무너진다"를 가르는 선. 길냥이는 부엌·지붕·창고에서
   * 중앙 5~10웨이브였다 — 30웨이브 표에서 그건 난이도가 아니라 고장이다. */
  for (const [diffId, maps] of byDiff) {
    for (const m of listMaps()) {
      const r = maps.get(m.id)
      assert.ok(r.median >= Math.ceil(r.total / 3),
        `${DIFFICULTIES[diffId].name} ${m.name}: 중앙 ${r.median}/${r.total}웨이브`)
    }
  }
})

test('난이도: 쉬울수록 더 오래 버틴다 (아깽이 ≥ 집냥이 ≥ 길냥이)', () => {
  // 맵마다 도달 점수가 난이도 순서를 따라야 한다. 허용 오차는 위 사다리 검사와 같은 1.5.
  const ladder = ['kitten', 'normal', 'stray']
  for (const m of listMaps()) {
    for (let i = 1; i < ladder.length; i += 1) {
      const easier = byDiff.get(ladder[i - 1]).get(m.id)
      const harder = byDiff.get(ladder[i]).get(m.id)
      assert.ok(easier.reachScore + 1.5 >= harder.reachScore,
        `${m.name}: ${DIFFICULTIES[ladder[i - 1]].name} ${easier.reachScore.toFixed(1)}`
        + ` < ${DIFFICULTIES[ladder[i]].name} ${harder.reachScore.toFixed(1)} — 어려운 쪽이 더 쉽다`)
    }
  }
})

test('난이도: 어려움에는 고를 이유가 있고, 쉬움에는 벌점이 없다', () => {
  /* 난이도가 보상에 아무 영향이 없으면 어려움을 고를 이유가 없다. 반대로 쉬움을 벌하면
   * "결제 없이도 캣닢을 모을 수 있다"는 약속이 난이도 설정으로 깨진다 — 그래서 1.0 아래는 없다. */
  for (const d of Object.values(DIFFICULTIES)) {
    assert.ok(typeof d.catnipMul === 'number' && d.catnipMul >= 1,
      `${d.name}: catnipMul ${d.catnipMul} — 쉬운 난이도를 벌하지 않는다`)
  }
  assert.ok(DIFFICULTIES.stray.catnipMul > DIFFICULTIES.normal.catnipMul,
    '길냥이가 집냥이보다 캣닢을 더 주지 않는다 — 어려움을 고를 이유가 없다')
})

test('난이도: 난이도는 골드를 깎지 않는다', () => {
  /* 초반 골드 삭감은 복리가 붙는다: 첫 두세 마리를 못 산다 → 샌다 → 목숨이 준다 → 더 못 산다.
   * 길냥이가 놀 수 없었던 원인이 이것 하나였다. 새 난이도를 만들 때 같은 함정에 다시 빠지지 않게 못 박는다. */
  for (const d of Object.values(DIFFICULTIES)) {
    assert.ok(d.goldMul >= 1,
      `${d.name}: goldMul ${d.goldMul} — 골드는 체력·목숨으로 대신한다 (settings.js 머리말)`)
  }
})

test('도구: smart 봇이 mixed 봇보다 나쁘지 않다', () => {
  /* 난이도 수치를 이 봇으로 정하므로, 봇이 실제로 날카로워졌는지 못 박는다.
   * 재 보고 뺀 것도 있다 — 검은냥·고등어냥을 '강력' 표적으로 두는 것은 사람처럼 보이지만
   * 보스 맵에서 잡몹을 그냥 통과시켜 더 나빴다(아깽이 지하실 100% → 0%). balance-sim.mjs 머리말 참고. */
  const smart = byDiff.get('normal')
  for (const m of listMaps().slice(0, 3)) {
    const mixed = playMany(m.id, 'normal', DIFF_RUNS, { seed: SEED, policy: 'mixed', specials: true })
    assert.ok(smart.get(m.id).reachScore + 0.5 >= mixed.reachScore,
      `${m.name}: smart ${smart.get(m.id).reachScore.toFixed(1)} < mixed ${mixed.reachScore.toFixed(1)}`)
  }
})
