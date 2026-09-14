/**
 * 시나리오 난이도 곡선 — **24장을 지나며 어려워지는가.**
 *
 * 왜 필요한가: 시나리오에는 난이도 그물이 **하나도 없었다.** 챕터 검사(`content.test`)는
 * 맵·웨이브셋·목표 종류가 실재하는지만 보고, 밸런스 검사는 자유 모드만 본다.
 * 그래서 **스무 장이 완주율 100%** 인 채로 몇 달이 지났다 — 사람이 해 보고 "생각보다 쉽다"고
 * 말해 주기 전까지 아무도 몰랐다.
 *
 * ── 어떻게 재나 ────────────────────────────────────────────────────────────
 *
 * 챕터는 `mapId` + `waveSet` + `waveLimit` + (K 부터) `rules` 라서 `playMany` 로 그대로 재현된다.
 * 목표(별)는 생존에 영향을 안 주므로 안 본다 — 여기서 묻는 것은 "깰 수 있나"뿐이다.
 *
 * **장마다 그때 쓸 수 있는 고양이만 준다.** 보상 타워가 누적되는 순서를 그대로 따라간다.
 * 안 그러면 1장을 열다섯 마리로 재게 되고, 그건 아무도 겪지 않는 판이다.
 *
 * **구간 평균으로 본다** (1~8 · 9~16 · 17~24). 장 단위로 못 박으면 시드 하나에 빨개졌다
 * 파래졌다 하고, 그러면 검사가 아니라 소음이다. 곡선의 모양만 지킨다.
 *
 * 봇은 `deck` — 자리를 보고 놓는 쪽이다. 치즈냥 봇으로는 늦은 장이 전부 똑같아 보인다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listChapters, listTowers } from '../../web/js/content/registry.js'
import { playMany } from '../../tools/balance-sim.mjs'

const RUNS = 3
/** 시드 셋. 하나로는 장마다 33pp 단위로만 움직여서 구간 평균이 시드에 흔들린다 —
 *  실제로 시드 5 는 9~16장을 79%, 시드 31 은 58% 로 읽었다(같은 콘텐츠). 셋이면 ±4pp 안이다.
 *  값이 30초쯤 든다. 곡선 모양을 지키는 그물이라 이 값은 낼 만하다. */
const SEEDS = [7, 23, 11]
/** 시작 고양이 둘. 나머지는 챕터 보상으로 하나씩 붙는다. */
const STARTERS = ['cheese', 'calico']

/** 24장을 순서대로 돌면서 그때의 로스터로 잰다 — 한 번만 돌리고 나눠 쓴다 */
const rows = []
{
  let roster = [...STARTERS]
  const all = listTowers().map((t) => t.id)
  for (const ch of listChapters()) {
    const rates = SEEDS.map((seed) => playMany(ch.mapId, 'normal', RUNS, {
      seed,
      specials: true,
      policy: 'deck',
      waveSet: ch.waveSet,
      waveLimit: ch.waveLimit || 0,
      deck: roster,
      rules: { ...(ch.rules || {}), bannedTowers: all.filter((id) => !roster.includes(id)) },
    }).clearRate * 100)
    rows.push({ ch, roster: roster.length, clear: rates.reduce((a, b) => a + b, 0) / rates.length })
    if (ch.rewards && ch.rewards.tower && !roster.includes(ch.rewards.tower)) {
      roster = [...roster, ch.rewards.tower]
    }
  }
}

/** 1~8 / 9~16 / 17~24 구간 평균 완주율 */
const band = (from, to) => {
  const xs = rows.filter((r) => r.ch.order >= from && r.ch.order <= to)
  return xs.reduce((a, r) => a + r.clear, 0) / xs.length
}

test('시나리오: 24장이 실재하고 순서가 이어진다', () => {
  assert.equal(rows.length, 24, `챕터가 ${rows.length}장이다 — 이 검사의 구간(8장씩 셋)이 안 맞는다`)
  rows.forEach((r, i) => assert.equal(r.ch.order, i + 1, `${i + 1}번째 장의 order 가 ${r.ch.order} 다`))
})

test('시나리오: 첫 두 장은 막히지 않는다', () => {
  /* 처음 하는 사람이 첫 판에서 막히면 거기서 끝이다. 이 프로젝트의 오래된 원칙이라
   * 난이도를 올리더라도 여기만은 지킨다. */
  for (const r of rows.filter((x) => x.ch.order <= 2)) {
    assert.ok(r.clear >= 90,
      `${r.ch.order}장 '${r.ch.title}' 완주 ${r.clear.toFixed(0)}% — 첫 두 장은 막히면 안 된다`)
  }
})

test('시나리오: 뒤로 갈수록 어려워진다 (구간 평균이 내려간다)', () => {
  /* 이게 이 파일의 이유다. 지금까지 세 구간이 전부 100% 근처였다 —
   * 24장을 지나며 한 번도 안 올라가는 곡선이었다. */
  const early = band(1, 8)
  const mid = band(9, 16)
  const late = band(17, 24)
  assert.ok(mid <= early - 5,
    `9~16장 평균 ${mid.toFixed(0)}% 가 1~8장 ${early.toFixed(0)}% 보다 5pp 넘게 안 낮다 — 중반이 안 어려워진다`)
  assert.ok(late <= mid - 5,
    `17~24장 평균 ${late.toFixed(0)}% 가 9~16장 ${mid.toFixed(0)}% 보다 5pp 넘게 안 낮다 — 후반이 안 어려워진다`)
})

test('시나리오: 후반이 벽이 되지는 않는다', () => {
  /* 위 검사만 있으면 "뒤를 전부 0% 로 만들면 통과"가 된다. 그 반대쪽도 막는다. */
  const late = band(17, 24)
  assert.ok(late >= 25, `17~24장 평균 ${late.toFixed(0)}% — 후반이 벽이다`)
})

test('시나리오: 어떤 장도 봇이 한 번도 못 깨지 않는다', () => {
  /* **구간 평균은 0% 짜리 장을 숨긴다.** 위 검사 넷이 전부 초록인 채로 7·12·18장이
   * 완주율 0% 로 몇 달을 있었다 — 이 파일이 스스로 "벽 셋은 개별로는 0% 지만 구간 평균으로는
   * 살아 있어야 한다"고 적어 두고 그걸 통과시키고 있었다.
   *
   * N 에서 사용자가 **"봇으로 주행하자"** 고 정했다. 그 기준에서 봇이 한 번도 못 깨는 장은
   * 어려운 것이 아니라 **못 깨는 것**이다. 그래서 장마다 바닥을 깐다.
   *
   * 기준을 "> 0" 으로 둔 이유: 시드 셋 × 3판이면 눈금이 11pp 다. 그보다 높은 값을 요구하면
   * 콘텐츠가 아니라 시드를 재게 된다. 여기서 막는 것은 **막힘**이지 난이도가 아니다 —
   * 곡선의 모양은 위의 구간 검사 셋이 맡는다. */
  for (const r of rows) {
    assert.ok(r.clear > 0,
      `${r.ch.order}장 '${r.ch.title}'(${r.ch.mapId}/${r.ch.waveSet}) 완주 0% — 봇이 한 번도 못 깬다`)
  }
})
