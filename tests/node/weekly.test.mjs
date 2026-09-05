import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isoWeek, weekKey, parseWeekKey, weekNumberOf, weekStart, daysLeft, weeklySeed, weeklyPick, WEEKLY_REWARD,
} from '../../web/js/domain/weekly.js'
import { mulberry32, fnv1a } from '../../web/js/domain/rng.js'
import { defaultProgress, recordWeekly, WEEKLY_HISTORY_MAX } from '../../web/js/domain/save.js'

const d = (y, m, day) => new Date(y, m - 1, day, 12)

test('ISO 주: 연말·연초 경계와 월요일 시작을 지킨다', () => {
  assert.equal(weekKey(d(2026, 9, 5)), '2026-W36')       // 토요일 — 8/31(월)부터의 주
  assert.equal(weekKey(d(2026, 9, 6)), '2026-W36')       // 일요일도 같은 주
  assert.equal(weekKey(d(2026, 9, 7)), '2026-W37')       // 월요일부터 새 주
  assert.equal(weekKey(d(2026, 12, 31)), '2026-W53')     // 2026-12-31 은 목요일 → 53주
  assert.equal(weekKey(d(2027, 1, 1)), '2026-W53')       // 금요일 — 아직 2026년의 53주
  assert.equal(weekKey(d(2027, 1, 4)), '2027-W01')
  assert.equal(weekKey(d(2024, 12, 30)), '2025-W01')     // 월요일 — 2025년 1주에 속한다
  assert.deepEqual(isoWeek(d(2021, 1, 3)), { year: 2020, week: 53 })
})

test('주 키: 파싱·정수화·월요일 계산·남은 날', () => {
  assert.deepEqual(parseWeekKey('2026-W36'), { year: 2026, week: 36 })
  assert.equal(parseWeekKey('2026-36'), null)
  assert.equal(parseWeekKey('2026-W54'), null)
  assert.ok(weekNumberOf('2026-W37') === weekNumberOf('2026-W36') + 1)
  assert.ok(weekNumberOf('2027-W01') > weekNumberOf('2026-W53'))
  const mon = weekStart('2026-W36')
  assert.equal(`${mon.getFullYear()}-${mon.getMonth() + 1}-${mon.getDate()}`, '2026-8-31')
  assert.equal(mon.getDay(), 1)
  assert.equal(daysLeft('2026-W36', d(2026, 8, 31)), 7)
  assert.equal(daysLeft('2026-W36', d(2026, 9, 6)), 1)
  assert.equal(daysLeft('2026-W36', d(2026, 9, 7)), 0, '지난 주는 0')
  assert.equal(daysLeft('없음'), 0)
})

test('시드: 같은 주는 같고 다른 주는 다르며, mulberry32 는 같은 시드에 같은 수열을 낸다', () => {
  assert.equal(weeklySeed('2026-W36'), weeklySeed('2026-W36'))
  assert.notEqual(weeklySeed('2026-W36'), weeklySeed('2026-W37'))
  assert.equal(fnv1a('abc'), 0x1A47E90B)
  const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43)
  const seqA = Array.from({ length: 5 }, a); const seqB = Array.from({ length: 5 }, b)
  assert.deepEqual(seqA, seqB)
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, c))
  for (const v of seqA) assert.ok(v >= 0 && v < 1)
})

test('회전: 같은 주엔 같은 맵·규칙, 주가 바뀌면 다음 칸, 맵과 규칙이 같은 주기로 돌지 않는다', () => {
  const maps = ['a', 'b', 'c'].map((id) => ({ id }))
  const chs = ['x', 'y', 'z'].map((id) => ({ id }))
  const p1 = weeklyPick('2026-W36', maps, chs)
  assert.deepEqual(weeklyPick('2026-W36', maps, chs), p1)
  const p2 = weeklyPick('2026-W37', maps, chs)
  assert.equal(maps.findIndex((m) => m.id === p2.mapId), (maps.findIndex((m) => m.id === p1.mapId) + 1) % 3)
  assert.equal(p1.seed, weeklySeed('2026-W36'))
  assert.notEqual(chs.findIndex((c) => c.id === p1.challengeId), maps.findIndex((m) => m.id === p1.mapId), '한 칸 앞서 돈다')
  assert.equal(weeklyPick('2026-W36', maps, []).challengeId, null)
  assert.equal(weeklyPick('2026-W36', [], chs), null)
})

test('recordWeekly: 최고만 남고, 첫 클리어 보상은 한 번, history 는 상한까지', () => {
  const base = defaultProgress().catnip
  let p = recordWeekly(defaultProgress(), '2026-W36', 12, false, WEEKLY_REWARD)
  assert.equal(p.weekly.best['2026-W36'], 12)
  assert.equal(p.weekly.cleared['2026-W36'], undefined)
  assert.equal(p.catnip, base)
  p = recordWeekly(p, '2026-W36', 9, false, WEEKLY_REWARD)
  assert.equal(p.weekly.best['2026-W36'], 12)
  p = recordWeekly(p, '2026-W36', 30, true, WEEKLY_REWARD)
  assert.equal(p.weekly.cleared['2026-W36'], true)
  assert.equal(p.catnip, base + WEEKLY_REWARD)
  p = recordWeekly(p, '2026-W36', 30, true, WEEKLY_REWARD)
  assert.equal(p.catnip, base + WEEKLY_REWARD, '두 번째 클리어는 보상이 없다')
  assert.deepEqual(p.weekly.history, ['2026-W36'])
  for (let i = 1; i <= WEEKLY_HISTORY_MAX + 3; i += 1) p = recordWeekly(p, `2027-W${String(i).padStart(2, '0')}`, 1, false)
  assert.equal(p.weekly.history.length, WEEKLY_HISTORY_MAX)
  assert.equal(p.weekly.history[0], '2027-W04')
  assert.deepEqual(p.bestWave, {}, '자유 모드 기록은 안 건드린다')
})
