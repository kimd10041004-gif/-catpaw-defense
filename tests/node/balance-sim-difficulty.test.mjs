/**
 * 난이도 사다리 — 사람이 고를 수 있는 것을 전부 '해 보고' 검사한다 (smart 봇 × 아깽이·집냥이·길냥이).
 *
 * `balance-sim.test.mjs` 에서 U-3 에 떼어 냈다 — 판 수는 그대로다(3난이도 × 7맵 × 3판 = 63판 + smart/mixed 대조 9판).
 * node --test 는 파일 단위로 병렬이라, 세 묶음을 한 파일에 두면 105초짜리 파일 하나가 나머지가 다 끝난 뒤에도 혼자 돈다.
 * 검사 내용과 이름은 옮기기 전과 같다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listMaps } from '../../web/js/content/registry.js'
import { playMany } from '../../tools/balance-sim.mjs'
import { DIFFICULTIES } from '../../web/js/domain/settings.js'

/** 시드를 고정한다 — 같은 코드면 같은 결과. 운으로 초록이 됐다 빨개졌다 하지 않게. */
const SEED = 7

/* ──────────────────────────────────────────────────────────────────────────
 * 사람이 고를 수 있는 것을 전부 본다.
 *
 * `balance-sim.test` 의 바닥 봇 검사들은 전부 '집냥이'만 봤다(하나가 아깽이 첫 맵을 볼 뿐이다). 그래서 **길냥이는
 * 아무도 보지 않았고, 실제로 망가져 있었다**: 첫 실점이 4~6웨이브, 도달 중앙이 7~10웨이브.
 * 위의 두 기준(`median >= 5`, `firstLoss >= 5`)을 길냥이에 대 보면 그때도 빨갰다 — 안 댔을 뿐이다.
 *
 * 여기서는 `smart` 봇을 쓴다. 그쪽의 `cheese` 봇은 바닥 기준이라 난이도 차이가 잘 안 보인다
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
