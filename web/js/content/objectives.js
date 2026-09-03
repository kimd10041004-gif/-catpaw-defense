/**
 * 시나리오 목표 종류. 새 목표 = 여기에 블록 하나.
 *
 * 계약
 *   label(spec)            결과 화면에 보여줄 문구
 *   check(summary, spec)   Game.summary() 를 보고 true/false
 *
 * summary 에 없는 값이 필요하면 game.js 의 stats 에 집계를 더하고 summary()가
 * 실어 보내게 한다. 판정 로직은 domain/objectives.js 가 돌리므로 여기엔 조건만 쓴다.
 */

import { registerObjective, getEnemy, getTower } from './registry.js'

/** 타워 id 목록을 '치즈냥·검은냥' 처럼 읽히게 */
const towerNames = (ids) => (ids || []).map((id) => (getTower(id) || { name: id }).name).join('·')

registerObjective('survive', {
  label: () => '마지막 웨이브까지 버티기',
  check: (s) => s.cleared === true,
})

registerObjective('killBoss', {
  label: (spec) => `${(getEnemy(spec.enemyId) || { name: spec.enemyId }).name} 처치`,
  check: (s, spec) => (s.bossIdsKilled || []).includes(spec.enemyId),
})

registerObjective('noLeak', {
  label: () => '한 마리도 통과시키지 않기',
  check: (s) => s.leaked === 0,
})

registerObjective('livesAbove', {
  label: (spec) => `목숨 ${spec.n} 이상 남기기`,
  check: (s, spec) => s.livesLeft >= spec.n,
})

registerObjective('maxTowers', {
  // '지은 횟수'다. 팔고 다시 지으면 그만큼 늘어난다 — 아껴 쓰라는 목표이므로 그게 맞다.
  label: (spec) => `고양이 ${spec.n}마리 이하로 막기`,
  check: (s, spec) => s.towersBuilt <= spec.n,
})

registerObjective('onlyTowers', {
  label: (spec) => `${towerNames(spec.ids)}만 쓰기`,
  check: (s, spec) => (s.towerIdsUsed || []).every((id) => spec.ids.includes(id)),
})

registerObjective('withoutTowers', {
  label: (spec) => `${towerNames(spec.ids)} 없이 막기`,
  check: (s, spec) => !(s.towerIdsUsed || []).some((id) => spec.ids.includes(id)),
})

registerObjective('maxSpecials', {
  label: (spec) => (spec.n === 0 ? '필살기 없이 막기' : `필살기 ${spec.n}회 이하로 쓰기`),
  check: (s, spec) => s.specialsUsed <= spec.n,
})
