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

import { registerObjective, getEnemy, getTower, getCombo } from './registry.js'

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

registerObjective('noSell', {
  label: () => '한 마리도 팔지 않기',
  check: (s) => (s.towersSold || 0) === 0,
})

registerObjective('goldLeft', {
  // 남은 골드를 본다. 아껴 쓰라는 뜻이라 '많이 벌기'가 아니라 '덜 쓰기'다.
  label: (spec) => `골드 ${spec.n} 이상 남기기`,
  check: (s, spec) => (s.goldLeft || 0) >= spec.n,
})

registerObjective('noUpgrade', {
  label: () => '업그레이드 없이 막기',
  check: (s) => (s.upgradesBought || 0) === 0,
})

registerObjective('clearWithin', {
  // 클리어한 판만 인정한다. 뚫리고 끝난 판이 '빨랐다'고 통과하면 안 된다.
  label: (spec) => `${spec.sec}초 안에 끝내기`,
  check: (s, spec) => s.cleared === true && (s.elapsed || Infinity) <= spec.sec,
})

registerObjective('makeCombo', {
  // 조합을 '만들어 보는' 것이 목표다 — 유지할 필요는 없다 (combosMade 는 성립한 순간 기록된다)
  label: (spec) => `'${(getCombo(spec.comboId) || { name: spec.comboId }).name}' 조합 만들기`,
  check: (s, spec) => (s.combosMade || []).includes(spec.comboId),
  requires: ['comboId'],
})

registerObjective('killAtLeast', {
  label: (spec) => `해충 ${spec.n}마리 이상 처치`,
  check: (s, spec) => (s.killed || 0) >= spec.n,
  requires: ['n'],
})
