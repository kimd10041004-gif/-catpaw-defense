/**
 * 업적 — 레지스트리 콘텐츠. 도감의 업적 탭은 이 목록을 순회하므로 UI 는 손대지 않는다.
 *
 * check(ctx) 의 ctx = { stats, progress, summary, counts }
 *   stats    평생 기록 (save.js defaultStats 의 키)
 *   progress 진행도 전체 (bestWave · clears · combosSeen · pets · scenario · endless · challenge · daily)
 *   summary  방금 끝난 판의 요약. 부팅 때 소급 판정에서는 null 이므로 반드시 null 검사를 한다
 *   counts   { towers, combos, pets, chapters, maps, challenges } 등록 수 — 숫자를 박지 않는다
 *
 * ▶ 새 업적: 블록 하나. catnip 은 보상(0 이면 없음). 공짜 업적은 검사가 막는다
 *   (defaultProgress 로 전부 false 여야 한다).
 */
import { registerAchievement, listChapters } from './registry.js'
import { GROWTH_MAX } from '../domain/save.js'
import { FREE_ACTS } from '../domain/entitlements.js'

const maxOf = (obj) => Math.max(0, ...Object.values(obj || {}).map(Number))
const keysOf = (obj) => Object.keys(obj || {}).length

registerAchievement({ id: 'first-win', order: 1, name: '첫 완전 방어', desc: '한 맵을 끝까지 막았다.', catnip: 10,
  check: ({ stats }) => stats.wins >= 1 })
registerAchievement({ id: 'wave-10', order: 2, name: '열 번째 밤', desc: '자유 모드에서 10웨이브에 닿았다.', catnip: 5,
  check: ({ progress }) => maxOf(progress.bestWave) >= 10 })
registerAchievement({ id: 'maps-3', order: 3, name: '세 집', desc: '맵 세 곳을 클리어했다.', catnip: 20,
  check: ({ progress }) => keysOf(progress.clears) >= 3 })
registerAchievement({ id: 'maps-all', order: 4, name: '온 집', desc: '모든 맵을 클리어했다.', catnip: 50,
  check: ({ progress, counts }) => counts.maps > 0 && keysOf(progress.clears) >= counts.maps })
registerAchievement({ id: 'kills-1000', order: 5, name: '박멸 I', desc: '해충 1,000마리를 처치했다.', catnip: 10,
  check: ({ stats }) => stats.killed >= 1000 })
registerAchievement({ id: 'kills-10000', order: 6, name: '박멸 II', desc: '해충 10,000마리를 처치했다.', catnip: 30,
  check: ({ stats }) => stats.killed >= 10000 })
registerAchievement({ id: 'boss-10', order: 7, name: '왕 사냥꾼 I', desc: '보스 10마리를 처치했다.', catnip: 10,
  check: ({ stats }) => stats.bossesKilled >= 10 })
registerAchievement({ id: 'boss-100', order: 8, name: '왕 사냥꾼 II', desc: '보스 100마리를 처치했다.', catnip: 30,
  check: ({ stats }) => stats.bossesKilled >= 100 })
registerAchievement({ id: 'no-leak-clear', order: 9, name: '한 마리도', desc: '한 마리도 통과시키지 않고 맵을 클리어했다.', catnip: 20,
  check: ({ summary }) => !!summary && summary.cleared === true && summary.leaked === 0 && !summary.challengeId })
registerAchievement({ id: 'crit-500', order: 10, name: '급소', desc: '크리티컬 500번.', catnip: 10,
  check: ({ stats }) => stats.crits >= 500 })
registerAchievement({ id: 'specials-100', order: 11, name: '손맛', desc: '필살기를 100번 썼다.', catnip: 10,
  check: ({ stats }) => stats.specialsUsed >= 100 })
registerAchievement({ id: 'combos-all', order: 12, name: '조합 도감 완성', desc: '모든 고양이 조합을 만들어 봤다.', catnip: 20,
  check: ({ progress, counts }) => counts.combos > 0 && (progress.combosSeen || []).length >= counts.combos })
registerAchievement({ id: 'towers-all', order: 13, name: '아홉 마리 전부', desc: '모든 고양이를 데려가 봤다.', catnip: 15,
  check: ({ stats, counts }) => counts.towers > 0 && keysOf(stats.towerUse) >= counts.towers })
registerAchievement({ id: 'pets-all', order: 14, name: '온 식구', desc: '펫을 전부 모았다.', catnip: 20,
  check: ({ progress, counts }) => counts.pets > 0 && (progress.pets && progress.pets.owned || []).length >= counts.pets })
// 무료 막(1~2막)만 센다 — 안 사면 영영 못 푸는 업적을 만들지 않는다. 3막은 따로.
const freeChapters = () => listChapters().filter((c) => FREE_ACTS.includes(c.act || 1))
const starsOf = (progress, chs, min) => chs.filter((c) => (((progress.scenario && progress.scenario.stars) || {})[c.id] || 0) >= min).length
registerAchievement({ id: 'scenario-done', order: 15, name: '이야기의 끝', desc: '시나리오 1·2막 전 장을 깼다.', catnip: 30,
  check: ({ progress }) => { const chs = freeChapters(); return chs.length > 0 && starsOf(progress, chs, 1) >= chs.length } })
registerAchievement({ id: 'scenario-perfect', order: 16, name: '별 전부', desc: '시나리오 1·2막 전 장에서 별 셋.', catnip: 50,
  check: ({ progress }) => { const chs = freeChapters(); return chs.length > 0 && starsOf(progress, chs, 3) >= chs.length } })
registerAchievement({ id: 'act3-done', order: 22, name: '자정을 넘어', desc: '시나리오 3막 전 장을 깼다.', catnip: 40,
  check: ({ progress }) => { const chs = listChapters().filter((c) => c.act === 3); return chs.length > 0 && starsOf(progress, chs, 1) >= chs.length } })
registerAchievement({ id: 'endless-10', order: 17, name: '무한 열 웨이브', desc: '무한 모드에서 표 밖으로 10웨이브를 버텼다.', catnip: 30,
  check: ({ progress }) => maxOf(progress.endless && progress.endless.best) >= 10 })
registerAchievement({ id: 'daily-7', order: 18, name: '이레 연속', desc: '7일 연속 출석했다.', catnip: 15,
  check: ({ progress }) => ((progress.daily && progress.daily.streak) || 0) >= 7 })
registerAchievement({ id: 'train-all', order: 20, name: '훈련 교관', desc: '모든 고양이를 최고 단계까지 훈련시켰다.', catnip: 40,
  check: ({ progress, counts }) => Object.values(progress.growth || {}).filter((r) => r >= GROWTH_MAX).length >= counts.towers })
registerAchievement({ id: 'weekly-4', order: 21, name: '네 주 연속은 아니어도', desc: '주간 도전을 4주 클리어했다.', catnip: 30,
  check: ({ progress }) => keysOf(progress.weekly && progress.weekly.cleared) >= 4 })
registerAchievement({ id: 'challenge-5', order: 19, name: '도전자', desc: '도전 다섯 개를 클리어했다.', catnip: 25,
  check: ({ progress }) => keysOf(progress.challenge && progress.challenge.clears) >= 5 })
