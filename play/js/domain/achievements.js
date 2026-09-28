/**
 * 업적 판정 — 순수. 정의(레지스트리)와 진행도를 받아 새로 풀린 것을 돌려준다.
 *
 * check(ctx) 가 던지면 false 로 본다 — 업적 하나의 오타가 판 결과 화면을 죽이면 안 된다.
 * 보상 캣닢은 여기서 더한다(addCatnip). 이미 풀린 업적은 다시 안 본다.
 */
import { addCatnip } from './save.js'

/**
 * @param {object} progress 현재 진행도 (v5: stats · achievements 가 있다)
 * @param {object|null} summary 방금 끝난 판의 Game.summary(). 부팅 때는 null.
 * @param {Array} defs registerAchievement 로 등록된 정의 목록
 * @param {object} counts { towers, combos, pets, chapters, maps, challenges } 등록 수
 * @param {number} now 시각(ms)
 * @returns {{ progress: object, unlocked: Array }}
 */
export function evaluateAchievements(progress, summary, defs, counts = {}, now = Date.now()) {
  const done = { ...((progress.achievements && progress.achievements.unlocked) || {}) }
  const ctx = { stats: progress.stats || {}, progress, summary: summary || null, counts }
  const unlocked = []
  let next = progress
  for (const def of defs) {
    if (done[def.id]) continue
    let ok = false
    try { ok = !!def.check(ctx) } catch { ok = false }
    if (!ok) continue
    done[def.id] = now
    unlocked.push(def)
    if (def.catnip > 0) next = addCatnip(next, def.catnip)
  }
  if (unlocked.length === 0) return { progress, unlocked }
  return { progress: { ...next, achievements: { unlocked: done } }, unlocked }
}

/** 풀린 업적 수 / 전체 (도감 탭 머리말) */
export function achievementProgress(progress, defs) {
  const done = (progress.achievements && progress.achievements.unlocked) || {}
  return { done: defs.filter((d) => done[d.id]).length, total: defs.length }
}
