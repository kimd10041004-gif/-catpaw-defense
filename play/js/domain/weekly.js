/**
 * 주간 도전 — 서버 없이 "이번 주엔 모두 같은 판". ISO 주 키에서 맵·규칙·시드가 결정되므로
 * 같은 주에 켠 모든 기기가 같은 맵에서 같은 도전 규칙으로, 같은 엘리트·크리스탈·크리티컬 굴림을 본다.
 *
 * 순수 함수만. 기록은 progress.weekly (save.js v6): best[key] = 최고 웨이브, cleared[key] = true, history = 최근 키.
 * 시계를 앞으로 돌리면 다음 주 판을 미리 볼 수 있다 — 출석과 같은 한계다(서버 없음). 순위표는 없다.
 */
import { fnv1a } from './rng.js'

/** 첫 클리어 캣닢. 프리미엄은 2배 (shop.js 의 혜택 목록) */
export const WEEKLY_REWARD = 25

/** ISO 8601 주 — 월요일 시작, 그 주의 목요일이 속한 해가 주의 해다. 현지 시각 기준. */
export function isoWeek(date = new Date()) {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNum = (t.getDay() + 6) % 7          // 월=0 … 일=6
  t.setDate(t.getDate() - dayNum + 3)          // 이 주의 목요일
  const year = t.getFullYear()
  const jan4 = new Date(year, 0, 4)
  const week = 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7)
  return { year, week }
}

/** 'YYYY-Www' */
export function weekKey(date = new Date()) {
  const { year, week } = isoWeek(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

const KEY_RE = /^(\d{4})-W(\d{2})$/

export function parseWeekKey(key) {
  const m = KEY_RE.exec(String(key || ''))
  if (!m) return null
  const year = Number(m[1]); const week = Number(m[2])
  if (week < 1 || week > 53) return null
  return { year, week }
}

/** 주를 하나의 정수로 — 회전(맵·규칙)에 쓴다 */
export function weekNumberOf(key) {
  const p = parseWeekKey(key)
  return p ? p.year * 53 + (p.week - 1) : 0
}

/** 그 주의 월요일 00:00 (현지) */
export function weekStart(key) {
  const p = parseWeekKey(key)
  if (!p) return null
  const jan4 = new Date(p.year, 0, 4)
  const monday = new Date(p.year, 0, 4 - ((jan4.getDay() + 6) % 7))
  monday.setDate(monday.getDate() + (p.week - 1) * 7)
  return monday
}

/** 이번 주가 끝날 때까지 남은 날 (오늘 포함, 1~7). 지난 주면 0. */
export function daysLeft(key, now = new Date()) {
  const start = weekStart(key)
  if (!start) return 0
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((end - today) / 86400000))
}

export function weeklySeed(key) {
  return fnv1a(`catpaw-weekly:${key}`)
}

/**
 * 이번 주의 맵·도전 규칙. 등록 순서대로 회전한다 — 같은 주엔 모두 같다.
 * @param {string} key
 * @param {Array<{id:string}>} maps  listMaps() 순서
 * @param {Array<{id:string}>} challenges  listChallenges() 순서 (비어 있으면 규칙 없음)
 */
export function weeklyPick(key, maps, challenges) {
  const n = weekNumberOf(key)
  if (!maps || maps.length === 0) return null
  const map = maps[n % maps.length]
  // 맵과 규칙이 같은 주기로 돌지 않게 규칙은 한 칸 앞서 돈다 (6맵×5규칙이면 30주 뒤에야 같은 짝이 온다)
  const ch = challenges && challenges.length ? challenges[(n + 1) % challenges.length] : null
  return { mapId: map.id, challengeId: ch ? ch.id : null, seed: weeklySeed(key) }
}
