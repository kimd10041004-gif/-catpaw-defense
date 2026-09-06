import test from 'node:test'
import assert from 'node:assert/strict'

import '../../web/js/content/index.js'
import { listAchievements, listTowers, listFreeTowers, listCombos, listPets, listChapters, listMaps, listChallenges } from '../../web/js/content/registry.js'
import { defaultProgress, defaultStats } from '../../web/js/domain/save.js'
import { evaluateAchievements, achievementProgress } from '../../web/js/domain/achievements.js'

const counts = () => ({
  towers: listTowers().length, freeTowers: listFreeTowers().length, combos: listCombos().length, pets: listPets().length,
  chapters: listChapters().length, maps: listMaps().length, challenges: listChallenges().length,
})

test('업적: 새 저장으로는 하나도 안 풀린다 (공짜 업적 없음)', () => {
  const { unlocked } = evaluateAchievements(defaultProgress(), null, listAchievements(), counts(), 1)
  assert.deepEqual(unlocked.map((a) => a.id), [])
})

test('업적: 조건이 맞으면 한 번만 풀리고 보상은 정확히 한 번 들어온다', () => {
  const p = { ...defaultProgress(), stats: { ...defaultStats(), wins: 1 } }
  const first = evaluateAchievements(p, null, listAchievements(), counts(), 1000)
  assert.deepEqual(first.unlocked.map((a) => a.id), ['first-win'])
  assert.equal(first.progress.catnip, p.catnip + 10)
  assert.equal(first.progress.achievements.unlocked['first-win'], 1000)
  const again = evaluateAchievements(first.progress, null, listAchievements(), counts(), 2000)
  assert.deepEqual(again.unlocked, [])
  assert.equal(again.progress, first.progress, '아무것도 안 바뀌면 같은 객체를 돌려준다')
})

test('업적: 판 요약이 있어야 풀리는 것은 부팅(summary null)에서 안 풀린다', () => {
  const p = { ...defaultProgress(), stats: { ...defaultStats(), wins: 3 } }
  const boot = evaluateAchievements(p, null, listAchievements(), counts(), 1)
  assert.equal(boot.unlocked.some((a) => a.id === 'no-leak-clear'), false)
  const run = evaluateAchievements(p, { cleared: true, leaked: 0 }, listAchievements(), counts(), 1)
  assert.ok(run.unlocked.some((a) => a.id === 'no-leak-clear'))
})

test('업적: check 가 던져도 판정이 멈추지 않는다', () => {
  const defs = [
    { id: 'boom', order: 1, name: 'x', desc: 'x', catnip: 0, check: () => { throw new Error('터짐') } },
    { id: 'ok', order: 2, name: 'y', desc: 'y', catnip: 3, check: () => true },
  ]
  const r = evaluateAchievements(defaultProgress(), null, defs, {}, 1)
  assert.deepEqual(r.unlocked.map((a) => a.id), ['ok'])
  assert.equal(r.progress.catnip, defaultProgress().catnip + 3)
})

test('업적: 등록된 정의 전부가 부팅 판정에서 안 던지고 id·order 가 유일하다', () => {
  const defs = listAchievements()
  assert.ok(defs.length >= 18, `업적 ${defs.length}개`)
  assert.equal(new Set(defs.map((d) => d.id)).size, defs.length)
  assert.equal(new Set(defs.map((d) => d.order)).size, defs.length)
  for (const d of defs) assert.doesNotThrow(() => d.check({ stats: defaultStats(), progress: defaultProgress(), summary: null, counts: counts() }))
  assert.deepEqual(achievementProgress(defaultProgress(), defs), { done: 0, total: defs.length })
})

test('업적: 원본 진행도를 변경하지 않는다', () => {
  const p = { ...defaultProgress(), stats: { ...defaultStats(), wins: 1 } }
  const snap = JSON.stringify(p)
  evaluateAchievements(p, null, listAchievements(), counts(), 1)
  assert.equal(JSON.stringify(p), snap)
})
