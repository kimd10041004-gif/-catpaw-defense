import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWave, waveCount, WaveError } from '../../web/js/domain/waves.js'
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
  const w = buildWave(table, 2, { getEnemy, mapDifficulty: 1.15, hpMul: 0.75 })
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
