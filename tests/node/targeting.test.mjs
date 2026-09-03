import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectTarget, selectAllInRange, canTarget, inRange, nextTargetMode,
  TARGET_MODES, TARGET_MODE_LABELS,
} from '../../web/js/domain/targeting.js'

const tower = { x: 5, y: 5, range: 3, targets: 'all' }

/** 사거리 안 3마리: 진행도·체력·거리가 모두 다르게 배치 */
const enemies = [
  { id: 'near',  x: 5.5, y: 5.0, hp: 50,  progress: 10, flying: false, alive: true },
  { id: 'far',   x: 7.5, y: 5.0, hp: 500, progress: 30, flying: false, alive: true },
  { id: 'mid',   x: 6.5, y: 5.0, hp: 100, progress: 20, flying: false, alive: true },
  { id: 'out',   x: 99,  y: 99,  hp: 999, progress: 99, flying: false, alive: true },
]

test('selectTarget: first는 가장 많이 전진한 적을 고른다', () => {
  assert.equal(selectTarget(tower, enemies, 'first').id, 'far')
})

test('selectTarget: last는 가장 덜 전진한 적을 고른다', () => {
  assert.equal(selectTarget(tower, enemies, 'last').id, 'near')
})

test('selectTarget: strongest는 체력이 가장 많은 적을 고른다', () => {
  assert.equal(selectTarget(tower, enemies, 'strongest').id, 'far')
})

test('selectTarget: closest는 타워에 가장 가까운 적을 고른다', () => {
  assert.equal(selectTarget(tower, enemies, 'closest').id, 'near')
})

test('selectTarget: 사거리 밖의 적은 어떤 모드에서도 고르지 않는다', () => {
  for (const mode of TARGET_MODES) {
    assert.notEqual(selectTarget(tower, enemies, mode).id, 'out')
  }
})

test('selectTarget: 지상 전용 타워는 공중 적을 고르지 못한다', () => {
  const ground = { ...tower, targets: 'ground' }
  const air = [{ id: 'bat', x: 5.5, y: 5, hp: 10, progress: 1, flying: true, alive: true }]
  assert.equal(selectTarget(ground, air, 'first'), null)
  assert.equal(selectTarget({ ...tower, targets: 'all' }, air, 'first').id, 'bat')
})

test('selectTarget: 공중 전용 타워는 지상 적을 고르지 못한다', () => {
  const airTower = { ...tower, targets: 'air' }
  assert.equal(selectTarget(airTower, enemies, 'first'), null)
})

test('selectTarget: 죽었거나 체력이 0 이하인 적은 제외한다', () => {
  const dead = [
    { id: 'a', x: 5, y: 5, hp: 0, progress: 5, flying: false, alive: true },
    { id: 'b', x: 5, y: 5, hp: 10, progress: 5, flying: false, alive: false },
  ]
  assert.equal(selectTarget(tower, dead, 'first'), null)
})

test('selectTarget: 대상이 하나도 없으면 null을 준다', () => {
  assert.equal(selectTarget(tower, [], 'first'), null)
})

test('selectTarget: 모르는 모드는 first처럼 동작한다', () => {
  assert.equal(selectTarget(tower, enemies, '없는모드').id, 'far')
})

test('selectAllInRange: 사거리 안의 적을 전부 준다 (뚱냥 광역·스플래시 판정용)', () => {
  const all = selectAllInRange(tower, enemies)
  assert.equal(all.length, 3)
  assert.equal(all.some((e) => e.id === 'out'), false)
})

test('inRange / canTarget: 경계값과 종류 판정이 맞는다', () => {
  assert.equal(inRange(tower, { x: 8, y: 5 }), true)   // 정확히 사거리 3
  assert.equal(inRange(tower, { x: 8.1, y: 5 }), false)
  assert.equal(canTarget({ targets: 'all' }, { flying: true }), true)
  assert.equal(canTarget({ targets: 'ground' }, { flying: true }), false)
  assert.equal(canTarget({ targets: 'air' }, { flying: false }), false)
})

test('nextTargetMode: 정의된 순서대로 순환하고 모든 모드에 한국어 이름이 있다', () => {
  let m = TARGET_MODES[0]
  const seen = [m]
  for (let i = 0; i < TARGET_MODES.length - 1; i += 1) {
    m = nextTargetMode(m)
    seen.push(m)
  }
  assert.deepEqual(seen, TARGET_MODES)
  assert.equal(nextTargetMode(TARGET_MODES[TARGET_MODES.length - 1]), TARGET_MODES[0])
  for (const mode of TARGET_MODES) assert.equal(typeof TARGET_MODE_LABELS[mode], 'string')
})
