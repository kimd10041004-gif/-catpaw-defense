/**
 * 출석 보상 — 순수. 날짜 문자열('YYYY-MM-DD', 현지)만 받는다.
 *
 * 7일 표를 돌고 다시 1일로. 하루를 건너뛰면 1일로 돌아간다. 서버가 없으므로 시계를
 * 앞으로 돌리는 농사는 못 막는다 — 표 합계(68캣닢 ≈ 이어하기 1.3회)가 그 상한이다.
 * 시계가 뒤로 돌아간 경우(−2일 이상)는 보상 없이 날짜만 오늘로 맞춘다. 안 그러면
 * 되돌린 날수만큼 며칠 동안 아무것도 못 받는다.
 */
import { DAILY_STREAK_MAX } from './save.js'
import { tr } from '../i18n/index.js'

export const DAILY_REWARDS = [5, 5, 8, 8, 10, 12, 20]

const KEY = /^\d{4}-\d{2}-\d{2}$/

/** 현지 날짜를 'YYYY-MM-DD' 로. UTC 로 만들면 자정 앞뒤로 하루가 어긋난다. */
export function localDateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** a → b 가 며칠 뒤인지. Date.UTC 로 계산해 서머타임에 23·25시간짜리 날이 있어도 정수다. */
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/**
 * 오늘 몫을 받는다 (제자리 변경 없이 새 객체 반환).
 * @returns {{ progress, claimed:boolean, day:number, reward:number, streak:number, reason?:string, code?:string }}
 * code 는 문구와 달리 언어를 타지 않는다 — 호출하는 쪽은 code 로 가른다
 */
export function claimDaily(progress, today) {
  const daily = progress.daily || { lastClaim: null, streak: 0 }
  const nothing = (reason, code) => ({ progress, claimed: false, day: daily.streak || 0, reward: 0, streak: daily.streak || 0, reason, code })
  if (typeof today !== 'string' || !KEY.test(today)) return nothing(tr('날짜 형식이 아니다'), 'bad-date')

  let streak
  if (!daily.lastClaim || !KEY.test(daily.lastClaim)) {
    streak = 1
  } else {
    const diff = daysBetween(daily.lastClaim, today)
    if (diff === 0) return nothing(tr('오늘은 이미 받았다'), 'claimed')
    if (diff === -1) return nothing(tr('오늘은 이미 받았다'), 'claimed')  // 자정 근처의 시간대 흔들림
    if (diff < -1) {
      // 시계가 뒤로 돌아갔다 — 보상 없이 날짜만 맞춘다 (며칠 동안 잠기지 않게)
      return { progress: { ...progress, daily: { ...daily, lastClaim: today } },
        claimed: false, day: daily.streak, reward: 0, streak: daily.streak, reason: tr('시계가 되돌아갔다'), code: 'clock-back' }
    }
    streak = diff === 1 ? (daily.streak % DAILY_STREAK_MAX) + 1 : 1
  }
  const day = Math.min(DAILY_STREAK_MAX, Math.max(1, streak))
  const reward = DAILY_REWARDS[day - 1]
  const next = { ...progress, daily: { lastClaim: today, streak: day } }
  const withCatnip = { ...next, catnip: Math.max(0, (next.catnip || 0) + reward) }
  return { progress: withCatnip, claimed: true, day, reward, streak: day }
}
