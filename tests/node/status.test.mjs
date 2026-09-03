import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyStatus, applySlow, speedMultiplier, tickStatus, MAX_SLOW_FACTOR,
} from '../../web/js/domain/status.js'

test('emptyStatus: 아무 효과도 걸리지 않은 상태로 시작한다', () => {
  const s = emptyStatus()
  assert.equal(speedMultiplier(s, 0), 1)
})

test('applySlow: 감속 비율만큼 속도가 줄어든다', () => {
  const s = applySlow(emptyStatus(), 0.4, 2, 0)
  assert.equal(Math.round(speedMultiplier(s, 1) * 100) / 100, 0.6)
})

test('applySlow: 지속시간이 지나면 원래 속도로 돌아온다', () => {
  const s = applySlow(emptyStatus(), 0.5, 2, 0)
  assert.equal(speedMultiplier(s, 1.9), 0.5)
  assert.equal(speedMultiplier(s, 2.0), 1)
})

test('applySlow: 약한 슬로우가 강한 슬로우를 덮어쓰지 않는다', () => {
  const s = applySlow(emptyStatus(), 0.65, 3, 0)
  applySlow(s, 0.20, 3, 0)
  assert.equal(Math.round(speedMultiplier(s, 1) * 100) / 100, 0.35)
})

test('applySlow: 더 강한 슬로우는 세기와 지속시간을 모두 새로 쓴다', () => {
  const s = applySlow(emptyStatus(), 0.20, 10, 0)
  applySlow(s, 0.60, 2, 0)
  assert.equal(Math.round(speedMultiplier(s, 1) * 100) / 100, 0.4)
  assert.equal(speedMultiplier(s, 2.5), 1) // 짧은 지속시간으로 교체됐다
})

test('applySlow: 같은 세기를 다시 걸면 지속시간만 늘어난다', () => {
  const s = applySlow(emptyStatus(), 0.4, 2, 0)
  applySlow(s, 0.4, 2, 1)
  assert.equal(Math.round(speedMultiplier(s, 2.5) * 100) / 100, 0.6)
})

test('applySlow: 적의 저항만큼 효과가 깎인다 (두더지 resist.slow 0.5)', () => {
  const s = applySlow(emptyStatus(), 0.60, 2, 0, 0.5)
  assert.equal(Math.round(speedMultiplier(s, 1) * 100) / 100, 0.7) // 0.6 * 0.5 = 0.3 감속
})

test('applySlow: 저항 1이면 아무 효과도 없다', () => {
  const s = applySlow(emptyStatus(), 0.9, 5, 0, 1)
  assert.equal(speedMultiplier(s, 1), 1)
})

test('applySlow: 완전 정지는 되지 않는다 (최대 감속 상한)', () => {
  const s = applySlow(emptyStatus(), 5, 5, 0)
  assert.equal(speedMultiplier(s, 1), 1 - MAX_SLOW_FACTOR)
  assert.ok(speedMultiplier(s, 1) > 0)
})

test('applySlow: 지속시간이 0 이하면 무시한다', () => {
  const s = applySlow(emptyStatus(), 0.5, 0, 0)
  assert.equal(speedMultiplier(s, 0), 1)
})

test('tickStatus: 만료된 효과를 정리해 렌더가 껍데기 값을 보지 않게 한다', () => {
  const s = applySlow(emptyStatus(), 0.5, 1, 0)
  tickStatus(s, 2)
  assert.equal(s.slowFactor, 0)
  assert.equal(s.slowUntil, 0)
})
