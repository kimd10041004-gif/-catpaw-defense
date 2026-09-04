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
