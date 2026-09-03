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
  resist: { slow: 0.35 },
  palette: { body: '#4b3f52', belly: '#7c6b84', ear: '#b0748a', tail: '#3d3343', crown: '#ffce4d' },
})
