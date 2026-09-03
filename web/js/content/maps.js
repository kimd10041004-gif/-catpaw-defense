/**
 * 맵 정의.
 *
 * ▶ 새 맵을 추가하려면: registerMap 블록을 복사하고 waypoints만 새로 그리면 된다.
 *   waypoints는 [열, 행] 정수 쌍이고 반드시 수평/수직으로만 이어져야 한다(대각선 금지).
 *   격자 밖 좌표(예: [4, -1])는 화면 밖 등장/퇴장 지점으로 쓴다.
 *   order 순서대로 클리어하면 다음 맵이 해금된다.
 */

import { registerMap } from './registry.js'

registerMap({
  id: 'alley',
  name: '골목길',
  order: 1,
  desc: '밤중의 뒷골목. 처음 온 고양이도 버틸 만하다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [4, -1], [4, 2], [1, 2], [1, 5], [7, 5],
    [7, 8], [2, 8], [2, 11], [6, 11], [6, 14],
  ],
  blocked: [],
  difficulty: 1.00,
  startGold: 300,
  startLives: 20,
  waveSet: 'standard30',
  theme: {
    ground: '#243447', groundAlt: '#1e2c3d', path: '#4a4038', pathEdge: '#5d5145',
    accent: '#7fd1c1', sky: '#16202e',
  },
})

registerMap({
  id: 'kitchen',
  name: '부엌',
  order: 2,
  desc: '타일 바닥 위 먹이 냄새. 길이 길어진 만큼 적도 질겨졌다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [-1, 1], [7, 1], [7, 4], [2, 4], [2, 7],
    [6, 7], [6, 10], [1, 10], [1, 12], [9, 12],
  ],
  blocked: [[4, 6], [5, 6]],
  difficulty: 1.15,
  startGold: 280,
  startLives: 20,
  waveSet: 'standard30',
  theme: {
    ground: '#e8e2d6', groundAlt: '#dcd5c6', path: '#b8a68d', pathEdge: '#a5917a',
    accent: '#e07a5f', sky: '#f3efe6',
  },
})

registerMap({
  id: 'rooftop',
  name: '지붕',
  order: 3,
  desc: '해질녘 옥상. 길은 구불구불하지만 적은 훨씬 강하게 몰려온다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [4, -1], [4, 1], [7, 1], [7, 3], [1, 3], [1, 5], [7, 5],
    [7, 7], [1, 7], [1, 9], [7, 9], [7, 11], [3, 11], [3, 14],
  ],
  blocked: [[0, 0], [8, 13]],
  difficulty: 1.35,
  startGold: 260,
  startLives: 15,
  waveSet: 'standard30',
  theme: {
    ground: '#7b4b52', groundAlt: '#6c4148', path: '#3f3038', pathEdge: '#54414a',
    accent: '#ffb26b', sky: '#4a2f3c',
  },
})
