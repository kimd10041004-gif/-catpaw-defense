import test from 'node:test'
import assert from 'node:assert/strict'
import { bakeSkinStrip } from '../../web/js/framesets.js'

/** ctx.filter 를 아는 가짜 캔버스 — 무엇을 그렸는지 기록한다 */
function fakeCanvas({ supportsFilter = true } = {}) {
  const calls = []
  const ctx = { drawImage: (...a) => calls.push(a) }
  if (supportsFilter) ctx.filter = 'none'
  return { cv: { width: 0, height: 0, getContext: () => ctx, calls, ctx }, ctx, calls }
}

test('bakeSkinStrip: 스트립 크기 그대로, 필터를 걸고 한 번에 그린다', () => {
  const img = { naturalWidth: 845, naturalHeight: 169 }
  const { cv, ctx, calls } = fakeCanvas()
  const out = bakeSkinStrip(img, 'sepia(0.6) saturate(1.7)', () => cv)
  assert.equal(out, cv)
  assert.equal(cv.width, 845); assert.equal(cv.height, 169)
  assert.equal(ctx.filter, 'sepia(0.6) saturate(1.7)')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], [img, 0, 0])
})

test('bakeSkinStrip: ctx.filter 를 모르는 환경이면 null — 호출한 쪽이 원본을 쓴다 (오류 없음)', () => {
  const { cv, calls } = fakeCanvas({ supportsFilter: false })
  assert.equal(bakeSkinStrip({ width: 10, height: 10 }, 'sepia(1)', () => cv), null)
  assert.equal(calls.length, 0)
  assert.equal(bakeSkinStrip({ width: 10, height: 10 }, 'sepia(1)', () => { throw new Error('no canvas') }), null)
})
