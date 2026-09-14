/**
 * 로딩 진행률. 로더들이 여기에 보고하고 로딩 화면이 구독한다. DOM 을 모른다.
 *
 * 가짜 타이머가 아니다 — framesets.js 와 mapart.js 가 파일 하나 끝날 때마다
 * finish() 를 부른다. 실패도 finish 다: 그림이 없으면 벡터로 그리므로 로딩은
 * '끝난' 것이 맞다. 4G 흉내에서 캐릭터 그림 23장이 오는 데 10초가 걸리고,
 * 그동안 상점 카드가 벡터였다가 사진으로 하나씩 바뀌던 것을 이 화면이 가린다.
 *
 * 등록할 게 없으면(expect 가 한 번도 안 불림 — Node 검사, 그림 없는 빌드)
 * 즉시 완료다. 기다릴 게 없으니까. main.js 는 로더들을 먼저 부르고 그 다음
 * whenComplete 를 건다 — 순서를 바꾸면 완료가 조기 발화한다.
 */
let total = 0
let done = 0
let completed = false
const progressCbs = []
const completeCbs = []

/** 로더가 시작할 때 자기 몫을 등록한다 */
export function expect(n) {
  total += Math.max(0, n | 0)
  notify()
}

/** 파일 하나가 끝났다 (성공·실패 무관) */
export function finish() {
  done = Math.min(total, done + 1)
  notify()
}

/** 매 변화마다 { done, total, ratio } 를 준다. 등록 즉시 현재값을 한 번 준다. */
export function subscribe(cb) {
  progressCbs.push(cb)
  cb(snapshot())
}

/** done === total 이 되는 순간 한 번. 이미 끝났으면 즉시. */
export function whenComplete(cb) {
  if (completed) cb()
  else completeCbs.push(cb)
}

export function snapshot() {
  return { done, total, ratio: total ? done / total : 1 }
}

/** 검사용 — 모듈 상태를 되돌린다. 게임 코드는 부르지 않는다. */
export function _reset() {
  total = 0
  done = 0
  completed = false
  progressCbs.length = 0
  completeCbs.length = 0
}

function notify() {
  const s = snapshot()
  for (const cb of progressCbs) cb(s)
  if (!completed && done >= total) {
    completed = true
    while (completeCbs.length) completeCbs.shift()()
  }
}
