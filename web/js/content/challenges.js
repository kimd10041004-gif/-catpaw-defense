/**
 * 도전 — 클리어한 자유 모드 맵에 규칙 하나를 얹어 다시 논다. 그림·맵·적을 새로 만들지 않고
 * 있는 것을 다르게 묻는다.
 *
 * ▶ 새 도전: 블록 하나. rules 는 registry.js 의 RULE_KEYS 만 받는다.
 *   replace 는 웨이브의 적 id 를 바꾼다(치환 대상도 등록된 적이어야 한다 — validateAll 이 본다).
 *   '공중만' 은 30웨이브 셋에 나오는 지상 적 전부를 덮어야 한다 (content.test 가 검사한다).
 */
import { registerChallenge } from './registry.js'

registerChallenge({
  id: 'half-gold', order: 1, name: '골드 절반', badge: '½',
  desc: '시작 골드도 처치 골드도 절반. 한 마리도 허투루 못 놓는다.',
  rules: { goldMul: 0.5, startGoldMul: 0.5 },
  reward: 15,
})

registerChallenge({
  id: 'air-only', order: 2, name: '공중만', badge: '翼',
  desc: '전부 날아온다. 지상 전용 고양이는 구경만 한다.',
  rules: {
    replace: {
      mouse: 'bat', roach: 'bat', fireant: 'bat', worm: 'bat',
      rat: 'pigeon', mole: 'pigeon', earwig: 'pigeon',
      ratking: 'batlord', molelord: 'batlord', roachqueen: 'batlord',
    },
  },
  reward: 20,
})

registerChallenge({
  id: 'double-boss', order: 3, name: '보스 2배', badge: '★★',
  desc: '보스 웨이브에 보스가 두 배로 온다. 왕관이 겹친다.',
  rules: { bossCountMul: 2 },
  reward: 20,
})

registerChallenge({
  id: 'six-cats', order: 4, name: '여섯 마리', badge: '6',
  desc: '고양이를 여섯 마리까지만 놓을 수 있다. 자리보다 순서가 중요해진다.',
  rules: { maxTowers: 6 },
  reward: 15,
})

registerChallenge({
  id: 'bare-paws', order: 5, name: '맨손', badge: '✕',
  desc: '필살기 없이. 마나는 차지만 쓸 곳이 없다.',
  rules: { noSpecials: true },
  reward: 15,
})
