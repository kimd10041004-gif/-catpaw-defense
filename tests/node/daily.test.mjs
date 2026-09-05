import test from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_REWARDS, claimDaily, daysBetween, localDateKey } from '../../web/js/domain/daily.js'
import { defaultProgress } from '../../web/js/domain/save.js'

const fresh = () => defaultProgress()

test('출석: 처음 받으면 1일차, 보상이 캣닢에 더해진다', () => {
  const r = claimDaily(fresh(), '2026-09-05')
  assert.equal(r.claimed, true)
  assert.equal(r.day, 1)
  assert.equal(r.reward, DAILY_REWARDS[0])
  assert.equal(r.progress.catnip, fresh().catnip + DAILY_REWARDS[0])
  assert.deepEqual(r.progress.daily, { lastClaim: '2026-09-05', streak: 1 })
})

test('출석: 같은 날 두 번은 안 된다', () => {
  const a = claimDaily(fresh(), '2026-09-05').progress
  const b = claimDaily(a, '2026-09-05')
  assert.equal(b.claimed, false)
  assert.equal(b.progress, a)
})

test('출석: 연속이면 다음 날차, 7일 뒤엔 다시 1일차', () => {
  let p = fresh()
  const days = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']
  const got = []
  for (const d of days) { const r = claimDaily(p, d); p = r.progress; got.push(r.day) }
  assert.deepEqual(got, [1, 2, 3, 4, 5, 6, 7, 1])
  assert.equal(p.catnip, fresh().catnip + DAILY_REWARDS.reduce((a, b) => a + b, 0) + DAILY_REWARDS[0])
})

test('출석: 하루를 건너뛰면 1일차로 돌아간다', () => {
  const a = claimDaily(fresh(), '2026-09-05').progress
  const b = claimDaily(a, '2026-09-06').progress
  const c = claimDaily(b, '2026-09-08')
  assert.equal(c.day, 1)
  assert.equal(c.streak, 1)
})

test('출석: 시계가 하루 뒤로 가면 받은 것으로 보고, 더 뒤로 가면 보상 없이 날짜만 맞춘다', () => {
  const a = claimDaily(fresh(), '2026-09-05').progress
  const yesterday = claimDaily(a, '2026-09-04')
  assert.equal(yesterday.claimed, false)
  assert.deepEqual(yesterday.progress.daily, a.daily)
  const way = claimDaily(a, '2026-08-01')
  assert.equal(way.claimed, false)
  assert.equal(way.progress.catnip, a.catnip, '보상 없음')
  assert.deepEqual(way.progress.daily, { lastClaim: '2026-08-01', streak: 1 })
  // 그다음 날은 정상적으로 이어진다
  assert.equal(claimDaily(way.progress, '2026-08-02').day, 2)
})

test('출석: 날짜 형식이 아니면 아무것도 안 한다', () => {
  const r = claimDaily(fresh(), '어제')
  assert.equal(r.claimed, false)
  assert.equal(r.progress.catnip, fresh().catnip)
})

test('출석: 서머타임이 끼어도 하루는 하루다', () => {
  assert.equal(daysBetween('2026-03-28', '2026-03-29'), 1)
  assert.equal(daysBetween('2026-03-29', '2026-03-30'), 1)
  assert.equal(daysBetween('2026-10-25', '2026-10-26'), 1)
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
  assert.equal(daysBetween('2026-09-05', '2026-09-03'), -2)
})

test('출석: localDateKey 는 현지 날짜를 YYYY-MM-DD 로 준다', () => {
  assert.equal(localDateKey(new Date(2026, 8, 5, 23, 59)), '2026-09-05')
  assert.equal(localDateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01')
})

test('출석: 보상표는 7칸이고 전부 양수이며 마지막이 가장 크다', () => {
  assert.equal(DAILY_REWARDS.length, 7)
  for (const v of DAILY_REWARDS) assert.ok(v > 0)
  assert.equal(Math.max(...DAILY_REWARDS), DAILY_REWARDS[6])
})
