/**
 * 적(해충) 정의.
 *
 * ▶ 새 적을 추가하려면: 아래 registerEnemy 블록 하나를 복사해서 값만 바꾸면 된다.
 *   sprite는 sprites.js에 등록된 키여야 하고, 새 모양이 필요하면 거기에도 하나 추가한다.
 *   추가한 뒤 waveSets.js의 웨이브 테이블에 넣어야 실제로 등장한다.
 *
 * 단위: speed = 타일/초, baseHp/armor/gold = 웨이브 스케일링 전 기준값, size = 타일 대비 반지름 비율
 */

import { registerEnemy } from './registry.js'

registerEnemy({
  id: 'mouse',
  element: 'earth',
  frames: 'enemy-mouse',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '생쥐',
  desc: '가장 흔한 침입자. 약하지만 숫자로 밀고 들어온다.',
  sprite: 'rodent',
  baseHp: 32,
  speed: 1.15,
  armor: 0,
  gold: 5,
  size: 0.30,
  flying: false,
  boss: false,
  livesCost: 1,
  palette: { body: '#9aa3ad', belly: '#d7dce1', ear: '#e5a9b4', tail: '#8b939c' },
})

registerEnemy({
  id: 'roach',
  element: 'dark',
  frames: 'enemy-roach',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '바퀴',
  desc: '눈 깜짝할 새 지나간다. 체력은 종잇장이지만 떼로 몰려온다.',
  sprite: 'roach',
  baseHp: 26,
  speed: 2.10,
  armor: 0,
  gold: 4,
  size: 0.24,
  flying: false,
  boss: false,
  livesCost: 1,
  palette: { body: '#5b3a22', shell: '#7d5330', leg: '#3a2415' },
})

registerEnemy({
  id: 'rat',
  element: 'earth',
  frames: 'enemy-rat',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '시궁쥐',
  desc: '생쥐보다 크고 질기다. 가죽이 두꺼워 잔공격이 잘 안 통한다.',
  sprite: 'rodent',
  baseHp: 95,
  speed: 0.95,
  armor: 2,
  gold: 9,
  size: 0.36,
  flying: false,
  boss: false,
  livesCost: 1,
  palette: { body: '#6f6257', belly: '#a89b8d', ear: '#c98f96', tail: '#5d5148' },
})

registerEnemy({
  id: 'bat',
  element: 'dark',
  frames: 'enemy-bat',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '박쥐',
  desc: '공중으로 날아온다. 지상만 노리는 삼색냥의 헤어볼은 닿지 않는다.',
  sprite: 'bat',
  baseHp: 62,
  speed: 1.60,
  armor: 0,
  gold: 8,
  size: 0.30,
  flying: true,
  boss: false,
  livesCost: 1,
  palette: { body: '#4a3f5c', wing: '#6b5b82', eye: '#ffd166' },
})

registerEnemy({
  id: 'mole',
  element: 'earth',
  frames: 'enemy-mole',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '두더지',
  desc: '단단한 등딱지로 무장했다. 한 방이 센 공격이 아니면 긁히지도 않는다.',
  sprite: 'mole',
  baseHp: 240,
  speed: 0.62,
  armor: 8,
  gold: 16,
  size: 0.42,
  flying: false,
  boss: false,
  livesCost: 1,
  resist: { slow: 0.5 },
  palette: { body: '#7a5230', armor: '#8d8f96', claw: '#e8e2d4', nose: '#d98a8a' },
})

registerEnemy({
  id: 'ratking',
  element: 'earth',
  frames: 'enemy-ratking',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '쥐왕',
  desc: '해충 무리의 왕. 뚫리면 목숨을 5개나 앗아간다.',
  sprite: 'rodent',
  baseHp: 1400,
  speed: 0.55,
  armor: 6,
  gold: 110,
  size: 0.62,
  flying: false,
  boss: true,
  livesCost: 5,
  tier: 1,
  resist: { slow: 0.35 },
  abilities: [
    { kind: 'summon', enemyId: 'mouse', count: 3, every: 6, hpMul: 0.8 },
  ],
  palette: { body: '#4b3f52', belly: '#7c6b84', ear: '#b0748a', tail: '#3d3343', crown: '#ffce4d' },
})

// ─────────────────────────────────────────────────────────────────────────────
// 고등급 보스 — 체력만 많은 게 아니라 각자 패턴을 가진다.
// tier: 0 일반 / 1 보스 / 2 정예 보스 / 3 최종 보스
// abilities의 kind는 enemyAbilities.js에 등록된 것만 쓸 수 있다.
// ─────────────────────────────────────────────────────────────────────────────

registerEnemy({
  id: 'molelord',
  element: 'earth',
  frames: 'enemy-molelord',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '두더지 대장',
  desc: '강철 투구를 쓴 지휘관. 보호막을 두르고 주변 부하들까지 단단하게 만든다.',
  sprite: 'mole',
  baseHp: 2600,
  speed: 0.50,
  armor: 12,
  gold: 190,
  size: 0.70,
  flying: false,
  boss: true,
  tier: 2,
  livesCost: 6,
  resist: { slow: 0.5 },
  abilities: [
    { kind: 'shield', amount: 0.35, rechargeAfter: 7 },
    { kind: 'warcry', radius: 3.2, armorAdd: 4, speedMul: 1.18 },
  ],
  palette: { body: '#6b4526', armor: '#b9bcc4', claw: '#f2ecdd', nose: '#d98a8a', crest: '#ffce4d' },
})

registerEnemy({
  id: 'roachqueen',
  element: 'dark',
  frames: 'enemy-roachqueen',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '바퀴 여왕',
  desc: '죽는 순간 새끼 바퀴로 쪼개진다. 광역기 없이 잡으면 뒷감당이 안 된다.',
  sprite: 'roach',
  baseHp: 2100,
  speed: 1.05,
  armor: 4,
  gold: 170,
  size: 0.60,
  flying: false,
  boss: true,
  tier: 2,
  livesCost: 5,
  abilities: [
    { kind: 'split', enemyId: 'roach', count: 8, hpMul: 0.55 },
    { kind: 'summon', enemyId: 'roach', count: 3, every: 6, hpMul: 0.6 },
  ],
  palette: { body: '#4a2b16', shell: '#8d5a2f', leg: '#2e1c0f', crown: '#ffce4d' },
})

registerEnemy({
  id: 'batlord',
  element: 'dark',
  frames: 'enemy-batlord',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '흡혈 박쥐왕',
  desc: '공중에서 피를 빨아 스스로 회복한다. 체력이 깎이면 미친 듯이 빨라진다.',
  sprite: 'bat',
  baseHp: 2300,
  speed: 1.15,
  armor: 3,
  gold: 180,
  size: 0.58,
  flying: true,
  boss: true,
  tier: 2,
  livesCost: 5,
  resist: { slow: 0.4 },
  abilities: [
    { kind: 'regen', percentPerSec: 0.022 },
    { kind: 'enrage', below: 0.45, speedMul: 1.9, armorAdd: 5 },
  ],
  palette: { body: '#3a2b4a', wing: '#7b3f6b', eye: '#ff5c5c', crown: '#ffce4d' },
})

registerEnemy({
  id: 'demonking',
  element: 'fire',
  frames: 'enemy-demonking',   // 프레임 아트. 없으면 sprite 로 떨어진다
  name: '마왕 쥐',
  desc: '해충 군단의 최종 병기. 보호막·재생·소환·광폭화를 전부 가졌다. 각오해라.',
  sprite: 'rodent',
  baseHp: 9000,
  speed: 0.46,
  armor: 14,
  gold: 600,
  size: 0.92,
  flying: false,
  boss: true,
  tier: 3,
  livesCost: 12,
  resist: { slow: 0.6 },
  abilities: [
    { kind: 'shield', amount: 0.30, rechargeAfter: 9 },
    { kind: 'regen', percentPerSec: 0.012 },
    { kind: 'summon', enemyId: 'rat', count: 4, every: 7, hpMul: 0.75 },
    { kind: 'enrage', below: 0.35, speedMul: 1.7, armorAdd: 8 },
    { kind: 'warcry', radius: 3.6, armorAdd: 5, speedMul: 1.2 },
  ],
  palette: { body: '#2e1f38', belly: '#57406a', ear: '#a63f6a', tail: '#241830',
             crown: '#ff4d6d', horn: '#f2e6d0' },
})

/*
 * ── 아래 넷은 비어 있던 축을 채운다 ────────────────────────────────────────
 *
 * 일반 5종이 덮던 것: 기본(생쥐) · 빠름(바퀴) · 약간 단단(시궁쥐) · 공중(박쥐) ·
 * 중장갑(두더지). 비어 있던 것: 공중+장갑 · 둔화 완전 면역 · 일반 등급 분열 ·
 * 아군 회복.
 *
 * 그림이 아직 없어서 sprite 로 떨어진다(벡터 도형). 밸런스를 확인한 뒤 발주한다.
 */

registerEnemy({
  id: 'pigeon',
  element: 'light',
  frames: 'enemy-pigeon',
  name: '비둘기',
  desc: '날면서도 두껍다. 박쥐를 잡던 잔공격으로는 긁히지도 않는다.',
  sprite: 'bat',
  baseHp: 78,
  speed: 1.30,
  armor: 4,
  gold: 11,
  size: 0.34,
  flying: true,
  boss: false,
  livesCost: 1,
  palette: { body: '#8a94a3', wing: '#b9c2cd', ear: '#d9dee4', eye: '#e0a03a' },
})

registerEnemy({
  id: 'fireant',
  element: 'fire',
  frames: 'enemy-fireant',
  name: '불개미',
  desc: '몸이 뜨거워 얼지 않는다. 샴냥의 눈빛이 통하지 않는 유일한 해충이다.',
  sprite: 'roach',
  baseHp: 34,
  speed: 1.45,
  armor: 1,
  gold: 6,
  size: 0.22,
  flying: false,
  boss: false,
  livesCost: 1,
  // 1.0 = 완전 면역. resist 자체는 원래 있던 계약이고, 끝값을 쓰는 건 이 녀석이 처음이다.
  resist: { slow: 1 },
  palette: { body: '#b3462a', shell: '#e0703c', leg: '#6d2415' },
})

registerEnemy({
  id: 'worm',
  element: 'ice',
  frames: 'enemy-worm',
  name: '지렁이',
  desc: '느리지만 반으로 잘리면 둘이 된다. 광역기 없이 잡으면 수가 는다.',
  sprite: 'roach',
  baseHp: 70,
  speed: 0.80,
  armor: 1,
  gold: 10,
  size: 0.34,
  flying: false,
  boss: false,
  livesCost: 1,
  // 자기 자신으로 분열한다. split 이 분열체에 noSplit 표시를 달아 한 세대에서 멈춘다 —
  // 그 표시가 없으면 4의 거듭제곱으로 늘어나 게임이 멈춘다.
  abilities: [{ kind: 'split', enemyId: 'worm', count: 2, hpMul: 0.45 }],
  palette: { body: '#c98a9a', shell: '#e0a8b4', leg: '#a4636f' },
})

registerEnemy({
  id: 'earwig',
  element: 'bolt',
  frames: 'enemy-earwig',
  name: '집게벌레',
  desc: '혼자면 약하다. 무리에 섞이면 옆의 것들을 계속 고쳐 놓는다.',
  sprite: 'roach',
  baseHp: 52,
  speed: 1.00,
  armor: 2,
  gold: 12,
  size: 0.28,
  flying: false,
  boss: false,
  livesCost: 1,
  abilities: [{ kind: 'mend', radius: 2.2, heal: 6, every: 1.5, bossFactor: 0.5 }],
  palette: { body: '#4e6b3a', shell: '#7a9a56', leg: '#33481f' },
})

/* ── J-5: 빈 세 속성의 보스 ──────────────────────────────────────────────────
 *
 * 보스 다섯을 속성으로 세 보니 흙 2 · 어둠 2 · 불 1 이었다. 번개·얼음·빛 보스가 없어서
 * 고양이 열다섯 중 여덟(흙 3 · 번개 2 · 어둠 3)이 **강하게 나갈 보스가 없었다.**
 * 상성 고리로 풀면 흙→번개, 번개→얼음, 어둠→빛인데 그 세 자리가 비어 있었다.
 *
 * 셋 다 **기존 해충의 대장 형태**다 — 쥐→쥐왕, 바퀴→바퀴 여왕과 같은 결이다.
 * 각 속성의 해충은 이미 있었다(집게벌레 번개 · 지렁이 얼음 · 비둘기 빛).
 *
 * 수치로 기존 보스의 1등을 안 뺏는다: 마왕 쥐의 체력 9000 · 장갑 14 · 현상금 600,
 * 흡혈 박쥐왕의 속도 1.15 는 그대로 둔다. 셋의 값은 **새 능력**에 있다.
 *
 * 그림은 아직 없다 — sprite 로 떨어진다(카드 고양이 여섯이 그랬던 것과 같다).
 * art-spec.mjs 의 보스 필터가 frames 없는 보스를 자동으로 집으므로 발주서는 그냥 나온다.
 */

registerEnemy({
  id: 'boltearwig',
  element: 'bolt',
  name: '번개 집게벌레',
  desc: '길을 건너뛴다. 입구에 화력을 몰아 두면 그 위를 지나가 버린다.',
  sprite: 'roach',
  baseHp: 2000,
  speed: 1.05,          // 흡혈 박쥐왕(1.15)의 '가장 빠른 보스'는 안 뺏는다
  armor: 4,
  gold: 170,
  size: 0.56,
  flying: false,
  boss: true,
  tier: 2,
  livesCost: 5,
  resist: { slow: 0.45 },
  // 체력이 깎일수록 자주 건너뛴다 — 두 번째 blink 가 below 로 늦게 켜진다.
  abilities: [
    { kind: 'blink', every: 4.5, tiles: 1.4 },
    { kind: 'blink', every: 3.0, tiles: 1.2, below: 0.45 },
    { kind: 'enrage', below: 0.35, speedMul: 1.5, armorAdd: 3 },
  ],
  palette: { body: '#3f5a7a', shell: '#6f9fd0', leg: '#26364a' },
})

registerEnemy({
  id: 'frostworm',
  element: 'ice',
  name: '서리 지렁이 여왕',
  desc: '맞을수록 껍질이 굳는다. 잔펀치로는 영영 못 뚫는다 — 한 방이 필요하다.',
  sprite: 'roach',
  baseHp: 2400,
  speed: 0.52,
  // 기본 4 + 굳기 최대 10 = 최대 14. 마왕 쥐(14)와 같지만 **맞는 동안만**이고
  // 2.5초 안 맞으면 통째로 풀린다. 답은 장갑을 지나가는 한 방이다
  // (앙고라냥 truestrike · 메인쿤냥 185).
  armor: 4,
  gold: 180,
  size: 0.66,
  flying: false,
  boss: true,
  tier: 2,
  livesCost: 6,
  resist: { slow: 0.5 },
  abilities: [
    { kind: 'harden', perHit: 1.2, max: 10, decay: 2.5 },
    { kind: 'regen', percentPerSec: 0.015 },
  ],
  palette: { body: '#7fa8c8', shell: '#cfe6f5', leg: '#4b6f8c' },
})

registerEnemy({
  id: 'glowpigeon',
  element: 'light',
  name: '눈부신 비둘기',
  desc: '날개를 펼치면 고양이들의 시야가 줄어든다. 멀리 보는 고양이가 필요하다.',
  sprite: 'bat',
  baseHp: 2200,
  speed: 1.00,
  armor: 3,
  gold: 180,
  size: 0.58,
  flying: true,
  boss: true,
  tier: 2,
  livesCost: 5,
  resist: { slow: 0.4 },
  // 눈부심은 약하게 잡았다 — 날면서 사거리를 줄이면 겹쳐서 억울해지기 쉽다.
  // 0.75 배 · 2초 · 6초마다. 엔진의 DAZZLE_FLOOR(0.6)가 그 아래를 막는다.
  abilities: [
    { kind: 'dazzle', radius: 3.0, mul: 0.75, duration: 2.0, every: 6 },
    { kind: 'summon', enemyId: 'pigeon', count: 2, every: 7, hpMul: 0.7 },
  ],
  palette: { body: '#c9c2a8', wing: '#f2ead2', ear: '#fff8e2', eye: '#ffd166' },
})
