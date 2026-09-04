import test from 'node:test'
import assert from 'node:assert/strict'
import {
  frameForPhase, frameRect, frameDrawBox,
  FRAME_COUNT, FRAME_SLEEP, BODY_H_PER_R, BODY_CY_PER_R,
  frameForWalk, FRAME_STOPPED, WALK_SWAPS_PER_SEC,
} from '../../web/js/domain/frames.js'

/** 실제로 쓰는 고양이 프레임셋과 같은 규격 */
const fs = { src: 'art/cat-cheese.png', frames: 5, w: 169, h: 169, body: { cx: 82, cy: 73, h: 107 } }

test('frameForPhase: 경계값이 시트 열 순서와 맞는다', () => {
  assert.equal(frameForPhase(1), 0)       // 발사 순간
  assert.equal(frameForPhase(0.82), 0)
  assert.equal(frameForPhase(0.81), 1)
  assert.equal(frameForPhase(0.48), 1)
  assert.equal(frameForPhase(0.47), 2)
  assert.equal(frameForPhase(0.15), 2)
  assert.equal(frameForPhase(0.14), 3)    // 대기
  assert.equal(frameForPhase(0), 3)
})

test('frameForPhase: 이상한 값이 와도 대기 프레임으로 떨어진다', () => {
  // recoil 은 game.js 가 관리하지만 여기서 NaN 이 새면 drawImage 가 조용히 아무것도
  // 안 그려서 고양이가 사라진다. 그림이 없는 것보다 대기 자세가 낫다.
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, '문자열']) {
    assert.equal(frameForPhase(bad), 3, `${String(bad)} → 대기`)
  }
})

test('frameForPhase: 1을 넘거나 음수여도 프레임 범위 안이다', () => {
  assert.equal(frameForPhase(2), 0)
  assert.equal(frameForPhase(-1), 3)
})

test('자는 프레임은 스트립의 마지막 칸이다', () => {
  assert.equal(FRAME_SLEEP, FRAME_COUNT - 1)
  assert.deepEqual(frameRect(fs, FRAME_SLEEP), { sx: 169 * 4, sy: 0, sw: 169, sh: 169 })
})

test('frameRect: 스트립 좌표를 정확히 낸다', () => {
  assert.deepEqual(frameRect(fs, 0), { sx: 0, sy: 0, sw: 169, sh: 169 })
  assert.deepEqual(frameRect(fs, 2), { sx: 338, sy: 0, sw: 169, sh: 169 })
})

test('frameRect: 범위를 벗어난 index 는 잘린다 (스트립 밖을 읽지 않는다)', () => {
  // 스트립 밖 좌표로 drawImage 하면 아무것도 안 그려진다 — 고양이가 사라진다.
  assert.equal(frameRect(fs, 9).sx, 169 * 4)
  assert.equal(frameRect(fs, -3).sx, 0)
  assert.equal(frameRect(fs, 2.7).sx, 338)
})

test('frameDrawBox: 그림 속 고양이 세로 폭이 벡터와 같아진다', () => {
  // 이게 어긋나면 벡터에서 그림으로 바꿀 때 고양이가 갑자기 커지거나 작아진다.
  const r = 18.36                            // 큰 폰의 타일 51px 기준 (t * 0.36)
  const box = frameDrawBox(fs, r)
  const scale = box.h / fs.h
  assert.ok(Math.abs(fs.body.h * scale - BODY_H_PER_R * r) < 1e-9,
    '그림 속 몸 높이가 벡터 스프라이트의 2.18r 과 같아야 한다')
})

test('frameDrawBox: 몸 중심이 타워 좌표에 온다', () => {
  const r = 20
  const box = frameDrawBox(fs, r)
  const scale = box.w / fs.w
  // 가로: 중심이 정확히 0
  assert.ok(Math.abs(box.dx + fs.body.cx * scale) < 1e-9)
  // 세로: 벡터 스프라이트의 무게중심(+0.07r)과 같은 곳
  assert.ok(Math.abs((box.dy + fs.body.cy * scale) - BODY_CY_PER_R * r) < 1e-9)
})

test('frameDrawBox: r 에 정비례한다 (타일 크기가 바뀌어도 비율이 유지된다)', () => {
  const a = frameDrawBox(fs, 10)
  const b = frameDrawBox(fs, 30)
  for (const k of ['w', 'h', 'dx', 'dy']) {
    assert.ok(Math.abs(b[k] - a[k] * 3) < 1e-9, `${k} 가 3배가 아니다`)
  }
})

// ── 해충 걷기 프레임 ──────────────────────────────────────────

/** 해충 스트립은 3장 — 걷기 A · 걷기 B · 멈춤 */
const pest = { src: 'art/enemy-mouse.png', frames: 3, w: 209, h: 209, body: { cx: 100, cy: 94, h: 105 } }

test('frameForWalk: 걷는 동안 두 프레임을 번갈아 쓴다', () => {
  const half = 1 / WALK_SWAPS_PER_SEC
  assert.equal(frameForWalk(0, 1), 0)
  assert.equal(frameForWalk(half * 0.9, 1), 0)
  assert.equal(frameForWalk(half * 1.1, 1), 1)
  assert.equal(frameForWalk(half * 2.1, 1), 0)
})

test('frameForWalk: 자장가급으로 둔화되면 멈춘 프레임이 된다', () => {
  // 발주서에서 3번 프레임을 '둔화·자장가에 걸렸을 때'로 요청했다. 자장가는 75% 둔화다.
  assert.equal(frameForWalk(0.3, 0.25), FRAME_STOPPED)
  assert.equal(frameForWalk(0.3, 0.5), FRAME_STOPPED)
  assert.equal(frameForWalk(0.3, 0.51), 1, '가벼운 둔화는 계속 걷는다')
})

test('frameForWalk: 이상한 값이 와도 프레임 범위를 벗어나지 않는다', () => {
  for (const t of [NaN, Infinity, undefined, null]) {
    const f = frameForWalk(t, 1)
    assert.ok(f === 0 || f === 1, `${String(t)} → ${f}`)
  }
  assert.equal(frameForWalk(0.3, NaN), FRAME_STOPPED, '속도를 못 읽으면 멈춘 자세')
  assert.equal(frameForWalk(-1, 1), 0, '음수 시간은 절댓값으로 본다')
})

test('frameDrawBox: 프레임셋이 hPerR 을 주면 그 크기로 그려진다', () => {
  // 생쥐 1.85r, 흡혈 박쥐왕 1.49r 처럼 캐릭터마다 벡터에서 쓰던 세로 폭이 다르다.
  // 이게 무시되면 해충이 전부 고양이 크기(2.18r)로 그려진다.
  const r = 20
  const withOverride = frameDrawBox({ ...pest, hPerR: 1.85, cyPerR: 0.23 }, r)
  const scale = withOverride.h / pest.h
  assert.ok(Math.abs(pest.body.h * scale - 1.85 * r) < 1e-9)
  assert.ok(Math.abs((withOverride.dy + pest.body.cy * scale) - 0.23 * r) < 1e-9)
})

test('frameDrawBox: hPerR 이 없으면 고양이 기준값으로 떨어진다', () => {
  const r = 20
  const box = frameDrawBox(pest, r)
  const scale = box.h / pest.h
  assert.ok(Math.abs(pest.body.h * scale - BODY_H_PER_R * r) < 1e-9)
})
