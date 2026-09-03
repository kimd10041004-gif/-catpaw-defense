import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPath, pointAtDistance, isBuildable, buildableCount, tileKey, PathError,
} from '../../web/js/domain/path.js'

/** 골목길과 같은 형태의 간단한 ㄱ자 경로 (9x14 격자) */
const simple = {
  cols: 9, rows: 14,
  waypoints: [[4, -1], [4, 2], [1, 2], [1, 5]],
  blocked: [],
}

test('buildPath: 축 정렬 구간 길이를 모두 더해 경로 길이를 낸다', () => {
  const p = buildPath(simple)
  assert.equal(p.lengthTiles, 3 + 3 + 3)
  assert.equal(p.points.length, 4)
  assert.deepEqual(p.cumulative, [0, 3, 6, 9])
})

test('buildPath: 타일 중심은 (열+0.5, 행+0.5)다', () => {
  const p = buildPath(simple)
  assert.deepEqual(p.points[0], { x: 4.5, y: -0.5 })
  assert.deepEqual(p.points[3], { x: 1.5, y: 5.5 })
})

test('buildPath: 격자 밖 구간은 경로 타일로 등록하지 않는다', () => {
  const p = buildPath(simple)
  assert.equal(p.tileSet.has(tileKey(4, -1)), false)
  assert.equal(p.tileSet.has(tileKey(4, 0)), true)
})

test('buildPath: 대각선 구간은 PathError를 던진다', () => {
  assert.throws(
    () => buildPath({ cols: 9, rows: 9, waypoints: [[0, 0], [3, 3]] }),
    PathError,
  )
  assert.throws(() => buildPath({ cols: 9, rows: 9, waypoints: [[0, 0], [3, 3]] }), /대각선/)
})

test('buildPath: 같은 지점이 연달아 나오면 PathError를 던진다', () => {
  assert.throws(() => buildPath({ cols: 9, rows: 9, waypoints: [[2, 2], [2, 2]] }), PathError)
})

test('buildPath: 웨이포인트가 2개 미만이면 PathError를 던진다', () => {
  assert.throws(() => buildPath({ cols: 9, rows: 9, waypoints: [[0, 0]] }), PathError)
  assert.throws(() => buildPath({ cols: 9, rows: 9 }), PathError)
})

test('buildPath: 웨이포인트가 정수 쌍이 아니면 PathError를 던진다', () => {
  assert.throws(() => buildPath({ cols: 9, rows: 9, waypoints: [[0, 0], [0, 1.5]] }), PathError)
  assert.throws(() => buildPath({ cols: 9, rows: 9, waypoints: [[0, 0], [1]] }), PathError)
})

test('pointAtDistance: 시작과 끝에서 정확히 양 끝 지점을 준다', () => {
  const p = buildPath(simple)
  const a = pointAtDistance(p, 0)
  assert.equal(a.x, 4.5)
  assert.equal(a.y, -0.5)
  const b = pointAtDistance(p, p.lengthTiles)
  assert.equal(b.x, 1.5)
  assert.equal(b.y, 5.5)
})

test('pointAtDistance: 범위를 벗어난 거리는 양 끝으로 잘라낸다', () => {
  const p = buildPath(simple)
  assert.deepEqual(pointAtDistance(p, -50).x, 4.5)
  assert.deepEqual(pointAtDistance(p, 9999).y, 5.5)
})

test('pointAtDistance: 구간 중간은 선형 보간한다', () => {
  const p = buildPath(simple)
  const mid = pointAtDistance(p, 1.5) // 첫 세로 구간의 절반
  assert.equal(mid.x, 4.5)
  assert.equal(mid.y, 1.0)
})

test('isBuildable: 경로 타일 위에는 지을 수 없다', () => {
  const p = buildPath(simple)
  assert.equal(isBuildable(simple, p, 4, 0), false)
  assert.equal(isBuildable(simple, p, 1, 3), false)
})

test('isBuildable: 격자 밖과 정수가 아닌 좌표는 거부한다', () => {
  const p = buildPath(simple)
  assert.equal(isBuildable(simple, p, -1, 0), false)
  assert.equal(isBuildable(simple, p, 9, 0), false)
  assert.equal(isBuildable(simple, p, 0, 14), false)
  assert.equal(isBuildable(simple, p, 1.5, 3), false)
})

test('isBuildable: blocked에 명시한 장식 타일에도 지을 수 없다', () => {
  const withBlocked = { ...simple, blocked: [[8, 13]] }
  const p = buildPath(withBlocked)
  assert.equal(isBuildable(withBlocked, p, 8, 13), false)
  assert.equal(isBuildable(withBlocked, p, 7, 13), true)
})

test('buildableCount: 격자 전체에서 경로와 blocked를 뺀 수를 센다', () => {
  const p = buildPath(simple)
  const pathTilesInside = p.tiles.length
  assert.equal(buildableCount(simple, p), 9 * 14 - pathTilesInside)
})
