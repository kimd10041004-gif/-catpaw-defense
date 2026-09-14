/**
 * 프레임 아트의 좌표 계산. DOM·이미지·캔버스에 의존하지 않는 순수 모듈이다.
 *
 * 왜 필요한가: 고양이 그림은 한 장에 프레임 5개가 가로로 붙은 스트립이고
 * (art/cat-*.png, 845×169), 그림 안에서 고양이가 프레임 전체를 채우지 않는다.
 * 어느 프레임을 쓸지, 그리고 그걸 타일 위 어디에 얼마 크기로 놓을지를
 * 여기서만 계산한다. render.js 는 결과를 받아 drawImage 만 한다.
 */

/** 고양이 스트립의 프레임 수. 발사순간 · 0.65 · 0.3 · 대기 · 자는중 순서다. */
export const FRAME_COUNT = 5
/** 마지막 칸은 자는 모습 — phase 와 무관하게 따로 고른다. */
export const FRAME_SLEEP = 4

/** 해충 스트립은 3장 — 걷기 A · 걷기 B · 멈춤 */
export const FRAME_WALK_A = 0
export const FRAME_WALK_B = 1
export const FRAME_STOPPED = 2
/** 걷기 두 장을 초당 몇 번 번갈아 보여줄지. 너무 빠르면 떨리고 느리면 미끄러진다. */
export const WALK_SWAPS_PER_SEC = 6

/**
 * 발사 후 경과에 따라 쓸 프레임.
 *
 * phase 는 발사 직후 1 에서 대기 0 으로 떨어진다(game.js 의 tower.recoil).
 * 경계값은 4프레임을 균등하게 나눈 것이 아니라 앞쪽을 짧게 잡았다 —
 * 발사 순간(0)은 순간이고, 대기(3)에 머무는 시간이 압도적으로 길기 때문이다.
 */
export function frameForPhase(phase) {
  const p = Number.isFinite(phase) ? phase : 0
  if (p >= 0.82) return 0   // 발사 순간
  if (p >= 0.48) return 1   // 되돌아오는 중
  if (p >= 0.15) return 2   // 거의 제자리
  return 3                  // 대기
}

/** 스트립 안에서 index 번 프레임이 차지하는 사각형. index 는 범위 안으로 잘린다. */
export function frameRect(fs, index) {
  const n = fs.frames || FRAME_COUNT
  const i = Math.max(0, Math.min(n - 1, Math.trunc(index) || 0))
  return { sx: i * fs.w, sy: 0, sw: fs.w, sh: fs.h }
}

/**
 * 캔버스 스프라이트가 반지름 r 로 쓰는 세로 폭. 귀 끝(-1.02r)부터
 * 바닥 그림자 아래(+1.16r)까지다. 그림을 이 크기에 맞춰야 벡터에서
 * 그림으로 바꿀 때 고양이가 갑자기 커지거나 작아지지 않는다.
 */
export const BODY_H_PER_R = 2.18
/** 같은 기준의 세로 중심. (-1.02 + 1.16) / 2 */
export const BODY_CY_PER_R = 0.07

/**
 * 프레임을 타워 중심 (x, y) 기준 어디에 얼마 크기로 그릴지.
 * 반환값은 중심에서의 상대 좌표라서 render.js 가 x + dx 로 쓴다.
 *
 * fs.body 는 슬라이스할 때 실측한 '대기 프레임에서 고양이(바닥 그림자 포함)가
 * 차지하는 영역'이다. 프레임 전체가 아니라 이 영역을 기준으로 맞춘다.
 */
export function frameDrawBox(fs, r) {
  const body = fs.body
  // 캐릭터마다 벡터에서 쓰던 세로 폭이 다르다(생쥐 1.85r, 흡혈 박쥐왕 1.49r).
  // 프레임셋이 값을 주면 그걸 쓰고, 없으면 고양이 기준값으로 떨어진다.
  const hPerR = fs.hPerR ?? BODY_H_PER_R
  const cyPerR = fs.cyPerR ?? BODY_CY_PER_R
  const scale = (hPerR * r) / body.h
  return {
    w: fs.w * scale,
    h: fs.h * scale,
    dx: -body.cx * scale,
    dy: cyPerR * r - body.cy * scale,
  }
}

/**
 * 걷는 적이 쓸 프레임.
 *
 * @param {number} t     경과 시간(초). 개체마다 다르게 넣어야 떼로 나올 때 발이 안 맞는다
 * @param {number} speed 둔화까지 반영한 속도 배율 (1 = 정상)
 */
export function frameForWalk(t, speed = 1) {
  // 자장가(75% 둔화)에 걸리면 멈춘 자세로 바꾼다. 발주서에서 이 프레임을
  // '둔화·자장가에 걸렸을 때'로 요청했으므로 그대로 쓴다.
  if (!(speed > 0.5)) return FRAME_STOPPED
  const tt = Number.isFinite(t) ? t : 0
  return Math.floor(Math.abs(tt) * WALK_SWAPS_PER_SEC) % 2
}
