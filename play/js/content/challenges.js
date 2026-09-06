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

/* ── 구현은 다 돼 있는데 쓰는 콘텐츠가 없던 규칙 둘 ────────────────────────
 * `bannedTowers`(game.js:317)와 `hpMul`(game.js:199)은 검증·적용·문구가 전부 있는데
 * 이걸 쓰는 도전이 **하나도 없었다.** 블록 다섯 줄이면 되는 것을 안 쓰고 있던 셈이다.
 * 무료 파일에 넣는다 — 주간 도전은 무료 규칙만 돌리므로 로테이션도 같이 길어진다(weekly.js). */

registerChallenge({
  id: 'no-crutch', order: 6, name: '목발 없이', badge: '✂',
  // 판마다 가장 많이 놓이는 둘을 뺀다. 남은 일곱으로 판을 다시 짜야 한다.
  desc: '치즈냥과 검은냥 없이. 나머지로 길을 막아라.',
  rules: { bannedTowers: ['cheese', 'black'] },
  reward: 25,
})

registerChallenge({
  id: 'thick-hide', order: 7, name: '두꺼운 껍질', badge: '🛡',
  desc: '해충의 체력이 1.5배다. 장갑이 아니라 그냥 두껍다.',
  rules: { hpMul: 1.5 },
  reward: 30,
})
