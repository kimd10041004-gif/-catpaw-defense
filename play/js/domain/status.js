/**
 * 적에게 걸리는 상태이상(현재는 슬로우) 계산.
 * 규칙: 중첩하지 않고 "가장 강한 효과가 자기 지속시간 동안 유지"된다.
 * 약한 슬로우가 강한 슬로우를 덮어쓰지 못하므로 샴냥을 여러 마리 놔도 예측 가능하게 동작한다.
 * 시간은 게임 내부 초(now)를 절대값으로 쓴다.
 */

/** 아무리 슬로우를 걸어도 완전 정지는 되지 않는다 (스턴은 별도 효과로 추가할 것) */
export const MAX_SLOW_FACTOR = 0.95

/** 상태이상이 없는 초기 상태 */
export function emptyStatus() {
  return { slowFactor: 0, slowUntil: 0 }
}

/**
 * 슬로우를 적용한다. 적의 resist 값만큼 효과가 깎인다.
 * @param {{slowFactor:number, slowUntil:number}} status 대상의 현재 상태 (제자리 변경)
 * @param {number} factor 감속 비율 0~1 (0.4 = 40% 감속)
 * @param {number} duration 지속 시간(초)
 * @param {number} now 현재 게임 시각(초)
 * @param {number} resist 저항 0~1 (0.5면 효과 절반)
 * @returns {{slowFactor:number, slowUntil:number}} 같은 status 객체
 */
export function applySlow(status, factor, duration, now, resist = 0) {
  const effective = Math.min(MAX_SLOW_FACTOR, Math.max(0, factor * (1 - resist)))
  if (effective <= 0 || duration <= 0) return status

  const active = now < status.slowUntil
  const currentFactor = active ? status.slowFactor : 0

  if (effective > currentFactor) {
    // 더 강한 슬로우 — 세기와 지속시간을 모두 새로 쓴다
    status.slowFactor = effective
    status.slowUntil = now + duration
  } else if (effective === currentFactor) {
    // 같은 세기 — 지속시간만 늘려준다
    status.slowUntil = Math.max(status.slowUntil, now + duration)
  }
  // 더 약한 슬로우는 무시 (강한 효과를 덮어쓰지 않는다)
  return status
}

/**
 * 현재 이동 속도 배율 (1 = 정상 속도).
 * @param {{slowFactor:number, slowUntil:number}} status
 * @param {number} now 현재 게임 시각(초)
 */
export function speedMultiplier(status, now) {
  if (!status || now >= status.slowUntil) return 1
  return 1 - status.slowFactor
}

/** 만료된 상태이상을 정리한다 (렌더가 껍데기 값을 보지 않도록). */
export function tickStatus(status, now) {
  if (status && now >= status.slowUntil && status.slowFactor !== 0) {
    status.slowFactor = 0
    status.slowUntil = 0
  }
  return status
}
