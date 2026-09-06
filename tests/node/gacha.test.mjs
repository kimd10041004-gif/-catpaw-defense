/**
 * 뽑기 — **공개한 확률이 실제 확률인지**를 검사한다.
 *
 * 캣닢은 현금으로도 사므로 이 뽑기는 확률형 아이템이고, 한국 게임산업법이 확률 공개를 의무화한다
 * (2024-03 시행). 그 법이 요구하는 것은 "표를 띄워라"가 아니라 **"띄운 값이 실제 값이어야 한다"** 다.
 * 그래서 여기서 세 가지를 못 박는다: 합이 1.0 · 화면 문구가 표에서 나온다 · 큰 표본의 실측이 표와 맞는다.
 *
 * 마지막 것이 진짜 증거다. 앞의 둘은 코드가 스스로 일관됐다는 것뿐이고,
 * 실측만이 "굴리는 코드가 표대로 굴린다"를 보인다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GACHA_TABLE, PITY_AT, SHARDS_PER_CARD, SHARDS_PER_DUPLICATE,
  DRAW_COST_CATNIP, DRAW10_COST_CATNIP,
  totalWeight, disclosureRows, rollTier, draw, drawTen,
} from '../../web/js/domain/gacha.js'
import { mulberry32 } from '../../web/js/domain/rng.js'
import { ELEMENTS } from '../../web/js/domain/elements.js'

const POOLS = { cats: { legend: ['aurora', 'nyx'], epic: ['ember', 'frost', 'gale'] } }

test('확률: 합이 정확히 1.0 이다', () => {
  /* 합이 1 이 아니면 공개한 확률이 곧바로 거짓말이 된다. 부동소수라 정확히 1 은 아닐 수 있으므로
   * 허용치를 명시한다 — 다만 0.999 같은 '대충'은 통과시키지 않는다. */
  const sum = totalWeight()
  assert.ok(Math.abs(sum - 1) < 1e-12, `확률 합이 ${sum} 이다`)
  for (const row of GACHA_TABLE) {
    assert.ok(row.weight > 0 && row.weight < 1, `${row.id}: 확률이 ${row.weight}`)
  }
  assert.equal(new Set(GACHA_TABLE.map((r) => r.id)).size, GACHA_TABLE.length, '등급 id 가 겹친다')
})

test('공개 문구가 표에서 나온다 (두 벌을 안 만든다)', () => {
  /* 화면 문구를 손으로 적어 두면 표를 고칠 때 한쪽만 고쳐진다. 그 순간 공개한 확률이 실제와 달라진다. */
  const rows = disclosureRows()
  assert.equal(rows.length, GACHA_TABLE.length)
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const src = GACHA_TABLE[i]
    assert.equal(r.id, src.id)
    assert.equal(r.weight, src.weight, `${r.id}: 문구의 확률이 표와 다르다`)
    assert.equal(r.percent, `${(src.weight * 100).toFixed(2)}%`, `${r.id}: 퍼센트 표기가 값과 다르다`)
    assert.ok(r.name && r.desc, `${r.id}: 이름이나 설명이 비었다`)
  }
  // 화면에 뜨는 퍼센트를 도로 더하면 100% 여야 한다 — 사람이 표를 보고 검산할 수 있어야 한다
  const shown = rows.reduce((a, r) => a + parseFloat(r.percent), 0)
  assert.ok(Math.abs(shown - 100) < 0.01, `화면 퍼센트의 합이 ${shown}% 다`)
})

test('실측 분포가 공개한 확률과 맞는다 (굴리는 코드가 표대로 굴린다)', () => {
  /* 여기가 진짜 증거다. 20만 번 굴려 각 등급의 실측 비율이 표와 맞는지 본다(허용치는 아래에서 등급마다).
   * 시드를 박아 두므로 이 검사는 흔들리지 않는다 — 빨개지면 확률이 실제로 틀어진 것이다. */
  const rng = mulberry32(20260906)
  const N = 200000
  const count = {}
  for (let i = 0; i < N; i += 1) {
    const t = rollTier(rng).id
    count[t] = (count[t] || 0) + 1
  }
  for (const row of GACHA_TABLE) {
    const actual = (count[row.id] || 0) / N
    /* 허용치는 등급마다 다르게 — 0.005 로 고정하면 2% 짜리 전설은 0.015~0.025 가 다 통과해
     * 사실상 아무것도 안 본다. 표본오차(N=20만에서 p=0.02 면 0.0003)의 여러 배이면서
     * 확률이 실제로 틀어진 것은 잡는 크기로 잡는다. */
    const tol = Math.max(0.002, row.weight * 0.05)
    assert.ok(Math.abs(actual - row.weight) < tol,
      `${row.id}: 공개 ${(row.weight * 100).toFixed(2)}% · 실측 ${(actual * 100).toFixed(2)}% (허용 ±${(tol * 100).toFixed(2)}%p)`)
  }
})

test('같은 시드는 같은 결과를 준다 (재현할 수 있다)', () => {
  const a = Array.from({ length: 50 }, (() => { const r = mulberry32(7); return () => draw(r, POOLS) })())
  const b = Array.from({ length: 50 }, (() => { const r = mulberry32(7); return () => draw(r, POOLS) })())
  assert.deepEqual(a, b)
  const c = Array.from({ length: 50 }, (() => { const r = mulberry32(8); return () => draw(r, POOLS) })())
  assert.notDeepEqual(a, c, '시드가 다른데 결과가 같다')
})

test('뽑은 것은 늘 셋 중 하나이고, 룬은 여섯 속성에서만 나온다', () => {
  const rng = mulberry32(99)
  const kinds = new Set()
  for (let i = 0; i < 5000; i += 1) {
    const r = draw(rng, POOLS)
    kinds.add(r.kind)
    assert.ok(GACHA_TABLE.some((t) => t.id === r.tier), `모르는 등급: ${r.tier}`)
    if (r.kind === 'rune') assert.ok(ELEMENTS.includes(r.id), `모르는 속성 룬: ${r.id}`)
    if (r.kind === 'cat') {
      assert.ok([...POOLS.cats.legend, ...POOLS.cats.epic].includes(r.id), `풀 밖의 고양이: ${r.id}`)
    }
    if (r.kind === 'shard') assert.ok(r.amount > 0, '조각이 0장 나왔다')
  }
  assert.deepEqual([...kinds].sort(), ['cat', 'rune', 'shard'])
})

test('10연 천장: 매번 상위 등급이 최소 하나 나온다', () => {
  /* 천장도 공개하는 약속이라 검사한다. 100번 돌려 한 번이라도 안 나오면 약속이 깨진 것이다. */
  const rng = mulberry32(4242)
  const pityIds = GACHA_TABLE.filter((r) => r.pity).map((r) => r.id)
  assert.ok(pityIds.length > 0, '천장 대상 등급이 없다')
  for (let n = 0; n < 100; n += 1) {
    const ten = drawTen(rng, POOLS)
    assert.equal(ten.length, PITY_AT, `10연이 ${ten.length}장이다`)
    assert.ok(ten.some((r) => pityIds.includes(r.tier)),
      `${n}번째 10연에 상위 등급이 없다: ${ten.map((r) => r.tier).join(',')}`)
  }
})

test('10연이 한 장 값보다 싸다 (덤이 실제로 덤이다)', () => {
  assert.ok(DRAW10_COST_CATNIP < DRAW_COST_CATNIP * PITY_AT,
    `10연 ${DRAW10_COST_CATNIP} vs 낱장 ${DRAW_COST_CATNIP * PITY_AT} — 덤이 아니다`)
})

test('빈 풀이어도 빈손으로 돌려보내지 않는다', () => {
  /* 판돈을 받고 아무것도 안 주는 것이 제일 나쁘다. 새 고양이가 하나도 없는 빌드(데모 등)에서도
   * 조각으로 바꿔 준다. */
  const rng = mulberry32(1)
  for (let i = 0; i < 2000; i += 1) {
    const r = draw(rng, { cats: { legend: [], epic: [] } })
    assert.ok(r.kind === 'rune' || (r.kind === 'shard' && r.amount > 0), `빈손: ${JSON.stringify(r)}`)
  }
})

test('조각 값이 말이 된다 — 운이 나빠도 결국 카드에 닿는다', () => {
  assert.ok(SHARDS_PER_CARD > SHARDS_PER_DUPLICATE, '중복 한 장이 카드 한 장이 된다')
  const perDraw = GACHA_TABLE.filter((r) => r.pool.kind === 'shard')
    .reduce((a, r) => a + r.weight * r.pool.amount, 0)
  assert.ok(perDraw > 0, '조각이 아예 안 나온다')
  const draws = SHARDS_PER_CARD / perDraw
  assert.ok(draws > 10 && draws < 200,
    `조각만으로 카드 한 장까지 ${Math.round(draws)}뽑 — 너무 짧거나 너무 길다`)
})
