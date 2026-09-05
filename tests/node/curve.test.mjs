/**
 * 웨이브 곡선 검사 — 셋의 '모양'. 어디를 어떻게 고쳐야 하는지 메시지에 적는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { waveCurve, findCliffs, describeFlag, CURVE_RULES } from '../../web/js/domain/curve.js'
import { waveCount } from '../../web/js/domain/waves.js'

import '../../web/js/content/index.js'
import { getEnemy, listWaveSets, listMaps } from '../../web/js/content/registry.js'

/** 가짜 적 — 도메인이 순수하다는 증거 (레지스트리 없이 돈다) */
const FAKE = {
  mouse: { id: 'mouse', baseHp: 100, gold: 8, boss: false },
  king:  { id: 'king',  baseHp: 1000, gold: 100, boss: true },
}
const fakeEnemy = (id) => FAKE[id] || null
const row = (mice, kings = 0) => (kings ? [['mouse', mice, 0.5, 0], ['king', kings, 1, 3]] : [['mouse', mice, 0.5, 0]])

test('waveCurve: 웨이브별 체력·배율·보스 표시를 준다', () => {
  const rows = waveCurve([row(10), row(12), row(10, 1)], fakeEnemy)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].ratio, null)
  assert.ok(Math.abs(rows[1].ratio - rows[1].totalHp / rows[0].totalHp) < 1e-9)
  assert.equal(rows[2].boss, true)
  assert.ok(rows[2].ratio2 > 1, '2웨이브 전 대비 배율')
})

test('findCliffs: 절벽·공백·보스·마지막 네 가지를 각각 잡는다', () => {
  // 1~9 잡몹 완만 → 10 보스(×4) → 11 공백(9의 0.4배) → 12~18 공백에서 완만하게 회복 → 19 절벽 → 20 마지막(×5)
  const t = []
  for (let w = 1; w <= 9; w += 1) t.push(row(10 + w))                // 완만
  t.push(row(10, 6))                                                   // 10: 보스 ×4 이상
  t.push(row(7))                                                       // 11: 9웨이브(19마리)의 0.4배 — 공백
  for (let w = 12; w <= 18; w += 1) t.push(row(w - 4))               // 8,9,…,14 마리 — 완만
  t.push(row(60))                                                      // 19: ×4 절벽
  t.push(row(60, 25))                                                  // 20: 마지막 ×5
  const flags = findCliffs(waveCurve(t, fakeEnemy))
  const kinds = flags.map((f) => `${f.kind}@${f.w}`)
  assert.ok(kinds.includes('BOSS@10'), kinds.join(' '))
  assert.ok(kinds.includes('LULL@11'), kinds.join(' '))
  assert.ok(kinds.includes('CLIFF@19'), kinds.join(' '))
  assert.ok(kinds.includes('FINAL@20'), kinds.join(' '))
  assert.equal(flags.length, 4, kinds.join(' '))
  assert.match(describeFlag(flags[0]), /10웨이브: ×\d+\.\d+ \(.*상한 2\.5\)/)
})

test('findCliffs: 1~4웨이브는 재지 않는다 (체력이 작아 노이즈다)', () => {
  const flags = findCliffs(waveCurve([row(1), row(4), row(9), row(20), row(21)], fakeEnemy))
  assert.deepEqual(flags, [])
  assert.equal(CURVE_RULES.fromWave, 5)
})

/** 자유 모드 셋 = 20웨이브 이상. 짧은 셋(12·10·14)은 한 판짜리 교훈이라 일부러 튄다. */
const longSets = () => listWaveSets().filter(({ table }) => waveCount(table) >= 20)

test('곡선: 20웨이브 이상 웨이브셋 전부에 절벽·공백이 없다', () => {
  assert.ok(longSets().length >= 6, `긴 셋 ${longSets().length}종`)
  for (const { id, table } of longSets()) {
    const map = listMaps().find((m) => m.waveSet === id)
    const flags = findCliffs(waveCurve(table, getEnemy, { mapHpMul: map ? map.hpMul : 1 }))
    assert.deepEqual(flags, [],
      `${id}${map ? ` (${map.name})` : ''}:\n    ${flags.map(describeFlag).join('\n    ')}\n`
      + '    → 마릿수·지연·간격 순으로 손본다 (tools/curve-report.mjs --set ' + id + ')')
  }
})
