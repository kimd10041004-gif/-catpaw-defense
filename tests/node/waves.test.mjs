import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWave, waveCount, summarizeWave, WaveError,
  endlessGroups, buildEndlessWave, buildWaveFromGroups, ENDLESS_COUNT_CAP, ENDLESS_INTERVAL_MIN,
} from '../../web/js/domain/waves.js'
import { scaleHp } from '../../web/js/domain/balance.js'

/** 레지스트리를 끌어오지 않고 가짜 적 정의만으로 검증한다 (도메인이 순수하다는 증거) */
const FAKE = {
  mouse: { id: 'mouse', baseHp: 100, gold: 8, boss: false },
  king:  { id: 'king',  baseHp: 1000, gold: 100, boss: true },
}
const getEnemy = (id) => FAKE[id] || null

const table = [
  [['mouse', 3, 1.0, 0]],
  [['mouse', 2, 0.5, 0], ['king', 1, 1.0, 5]],
]

test('waveCount: 테이블의 줄 수가 곧 총 웨이브 수다', () => {
  assert.equal(waveCount(table), 2)
  assert.throws(() => waveCount('배열아님'), WaveError)
})

test('buildWave: 그룹 마리수를 모두 합쳐 스폰을 만든다', () => {
  const w = buildWave(table, 2, { getEnemy })
  assert.equal(w.count, 3)
  assert.equal(w.spawns.length, 3)
})

test('buildWave: 스폰 시각은 지연 + 순번 * 간격이고 오름차순으로 정렬된다', () => {
  const w = buildWave(table, 2, { getEnemy })
  const times = w.spawns.map((s) => s.atSec)
  assert.deepEqual(times, [0, 0.5, 5])
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i] >= times[i - 1])
})

test('buildWave: durationSec은 마지막 스폰 시각이다', () => {
  assert.equal(buildWave(table, 2, { getEnemy }).durationSec, 5)
  assert.equal(buildWave(table, 1, { getEnemy }).durationSec, 2) // 0, 1, 2
})

test('buildWave: 보스 수를 세고 스폰에 isBoss를 표시한다', () => {
  const w = buildWave(table, 2, { getEnemy })
  assert.equal(w.bossCount, 1)
  assert.equal(w.spawns.filter((s) => s.isBoss).length, 1)
  assert.equal(buildWave(table, 1, { getEnemy }).bossCount, 0)
})

test('buildWave: 체력에 웨이브·맵난이도·난이도 배율이 반영된다', () => {
  const w = buildWave(table, 2, { getEnemy, mapHpMul: 1.15, hpMul: 0.75 })
  const expected = scaleHp(100, 2, 1.15, 0.75)
  assert.equal(w.spawns.find((s) => s.enemyId === 'mouse').hp, expected)
  assert.equal(w.spawns[0].maxHp, w.spawns[0].hp)
})

test('buildWave: totalHp는 모든 스폰 체력의 합이다', () => {
  const w = buildWave(table, 2, { getEnemy })
  assert.equal(w.totalHp, w.spawns.reduce((n, s) => n + s.hp, 0))
})

test('buildWave: 등록되지 않은 적을 참조하면 WaveError를 던진다', () => {
  const bad = [[['없는적', 1, 1, 0]]]
  assert.throws(() => buildWave(bad, 1, { getEnemy }), WaveError)
  assert.throws(() => buildWave(bad, 1, { getEnemy }), /없는적/)
})

test('buildWave: 그룹 형식이 4개 항목이 아니면 WaveError를 던진다', () => {
  assert.throws(() => buildWave([[['mouse', 1, 1]]], 1, { getEnemy }), WaveError)
  assert.throws(() => buildWave([['mouse']], 1, { getEnemy }), WaveError)
})

test('buildWave: 마리수·간격·지연이 잘못되면 WaveError를 던진다', () => {
  assert.throws(() => buildWave([[['mouse', 0, 1, 0]]], 1, { getEnemy }), WaveError)
  assert.throws(() => buildWave([[['mouse', 1, -1, 0]]], 1, { getEnemy }), WaveError)
  assert.throws(() => buildWave([[['mouse', 1, 1, -1]]], 1, { getEnemy }), WaveError)
})

test('buildWave: 웨이브 번호가 범위를 벗어나면 WaveError를 던진다', () => {
  assert.throws(() => buildWave(table, 0, { getEnemy }), WaveError)
  assert.throws(() => buildWave(table, 3, { getEnemy }), WaveError)
})

test('buildWave: getEnemy를 넘기지 않으면 WaveError를 던진다', () => {
  assert.throws(() => buildWave(table, 1, {}), WaveError)
})

test('summarizeWave: 같은 적을 묶고 보스를 먼저, 그다음 마릿수 순으로 준다', () => {
  const wave = buildWave(table, 2, { getEnemy })      // 생쥐 2 + 왕 1
  const rows = summarizeWave(wave, getEnemy)
  assert.deepEqual(rows.map((r) => [r.enemyId, r.count, r.boss]), [['king', 1, true], ['mouse', 2, false]])
  assert.equal(rows[0].name, 'king')
})

test('summarizeWave: 순수하다 — 두 번 불러도 같고 입력을 바꾸지 않는다', () => {
  const wave = buildWave(table, 1, { getEnemy })
  const before = JSON.stringify(wave)
  assert.deepEqual(summarizeWave(wave, getEnemy), summarizeWave(wave, getEnemy))
  assert.equal(JSON.stringify(wave), before)
})

test('summarizeWave: 모르는 적은 id 를 이름으로 쓰고, 빈 웨이브는 빈 배열이다', () => {
  assert.deepEqual(summarizeWave({ spawns: [{ enemyId: 'ghost' }] }, getEnemy)[0].name, 'ghost')
  assert.deepEqual(summarizeWave(null, getEnemy), [])
})

// ───────────────────────────── 무한 모드

const longTable = Array.from({ length: 10 }, (_, i) => (
  (i + 1) % 5 === 0 ? [['mouse', 4, 0.5, 0], ['king', 1, 1.0, 2]] : [['mouse', 4 + i, 0.5, 0]]
))

test('endlessGroups: 마지막 5줄을 순환하고 다섯 번째마다 보스 줄이 온다', () => {
  const rows = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((w) => endlessGroups(longTable, w))
  // 11 → 6번째 줄(index 5), 15 → 10번째(보스), 16 → 다시 6번째
  assert.equal(rows[0][0][0], 'mouse')
  assert.ok(rows[4].some((g) => g[0] === 'king'), '15웨이브는 보스 줄')
  assert.ok(!rows[5].some((g) => g[0] === 'king'), '16웨이브는 다시 잡몹 줄')
  assert.ok(rows[9].some((g) => g[0] === 'king'), '20웨이브는 보스 줄')
})

test('endlessGroups: 마릿수는 8%씩 늘다 2배에서 멈추고 간격은 0.5초 아래로 안 내려간다', () => {
  const base = longTable[5][0][1]                       // 6번째 줄 생쥐 수
  assert.equal(endlessGroups(longTable, 11)[0][1], Math.ceil(base * 1.08))
  assert.equal(endlessGroups(longTable, 61)[0][1], Math.ceil(base * ENDLESS_COUNT_CAP))   // k=51 → 상한
  assert.equal(endlessGroups(longTable, 61)[0][2], ENDLESS_INTERVAL_MIN)
})

test('endlessGroups / buildWave: 표 안 번호와 표 밖 번호를 서로 거부한다', () => {
  assert.throws(() => endlessGroups(longTable, 10), WaveError)
  assert.throws(() => buildWave(longTable, 11, { getEnemy }), WaveError)
})

test('buildEndlessWave: 체력이 웨이브 번호를 따라 계속 오른다', () => {
  const w30 = buildEndlessWave(longTable, 30, { getEnemy })
  const w40 = buildEndlessWave(longTable, 40, { getEnemy })
  assert.ok(w40.spawns[0].hp > w30.spawns[0].hp)
  assert.equal(w30.waveNo, 30)
})

test('buildWaveFromGroups: transform 이 적을 치환하고 보스 수를 곱한다', () => {
  const groups = [['mouse', 6, 0.5, 0], ['king', 1, 1, 2]]
  const w = buildWaveFromGroups(groups, 5, { getEnemy, transform: { replace: { mouse: 'king' }, bossCountMul: 2 } })
  assert.equal(w.spawns.every((s) => s.enemyId === 'king'), true)
  assert.equal(w.count, 6 * 2 + 1 * 2, '치환 먼저(생쥐 6 → 왕 6), 그다음 보스 배수 2')
  assert.throws(() => buildWaveFromGroups(groups, 5, { getEnemy, transform: { replace: { mouse: 'ghost' } } }), WaveError)
})
