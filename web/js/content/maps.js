/**
 * 맵 정의.
 *
 * ▶ 새 맵을 추가하려면: registerMap 블록을 복사하고 waypoints만 새로 그리면 된다.
 *   waypoints는 [열, 행] 정수 쌍이고 반드시 수평/수직으로만 이어져야 한다(대각선 금지).
 *   격자 밖 좌표(예: [4, -1])는 화면 밖 등장/퇴장 지점으로 쓴다.
 *   order 순서대로 클리어하면 다음 맵이 해금된다.
 */

import { registerMap } from './registry.js'

/* ── tier 와 hpMul 은 다른 것이다 ─────────────────────────────────────────────
 *
 * 예전엔 difficulty 하나가 둘을 겸했다. 그런데 맵마다 전용 웨이브셋이 생기면서
 * 난이도가 두 번 들어가 버렸다 — 웨이브 행 자체가 이미 무거운데 그 위에 배수가
 * 또 곱해진 것이다. 1~5웨이브 원본 체력을 골목길과 견줘 재 보면 이렇다:
 *
 *   맵        웨이브셋 무게   옛 difficulty   실효(곱)
 *   골목길        1.00x          1.00        1.00x
 *   부엌         1.09x          1.15        1.25x
 *   지붕         1.31x          1.35        1.77x
 *   창고         1.40x          1.45        2.02x
 *   지하실        1.13x          1.52        1.72x
 *   다락방        3.75x          1.60        6.00x   ← 20판 전부 1웨이브에 죽었다
 *
 * 그래서 갈랐다:
 *   tier  — 플레이어에게 보이는 사다리(1~6). 맵 카드와 검사가 이걸 본다
 *   hpMul — 조율 손잡이. 웨이브셋이 이미 가진 무게를 상쇄해서, 실효 난이도가
 *           tier 순서를 따라가게 만든다. 그래서 숫자가 1보다 작을 수도 있다
 *
 * 값은 눈대중이 아니라 tools/balance-sim.mjs 로 실제 판을 돌려서 정한다.
 * ──────────────────────────────────────────────────────────────────────────*/

registerMap({
  id: 'alley',
  art: 'alley',      props: ['crate', 'jar'],
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
  tier: 1,
  hpMul: 1.00,
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
  art: 'kitchen',    props: ['jar', 'pot'],
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
  tier: 2,
  hpMul: 1.18,
  startGold: 280,
  startLives: 20,
  waveSet: 'kitchen30',
  theme: {
    ground: '#e8e2d6', groundAlt: '#dcd5c6', path: '#b8a68d', pathEdge: '#a5917a',
    accent: '#e07a5f', sky: '#f3efe6',
  },
})

registerMap({
  id: 'rooftop',
  art: 'rooftop',    props: ['pot', 'crate'],
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
  tier: 3,
  hpMul: 1.10,
  startGold: 260,
  startLives: 15,
  waveSet: 'rooftop30',
  theme: {
    ground: '#7b4b52', groundAlt: '#6c4148', path: '#3f3038', pathEdge: '#54414a',
    accent: '#ffb26b', sky: '#4a2f3c',
  },
})

registerMap({
  id: 'attic',
  art: 'attic',      props: ['furniture', 'crate'],
  name: '악몽의 다락방',
  order: 6,          // 창고·지하실을 앞에 끼우면서 뒤로 밀었다. 여전히 마지막 맵이다.
  desc: '해충 군단의 본진. 20웨이브 내내 보스가 쏟아지고 마지막엔 마왕 쥐가 둘이나 나온다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [4, -1], [4, 2], [7, 2], [7, 5], [2, 5],
    [2, 8], [7, 8], [7, 11], [1, 11], [1, 14],
  ],
  blocked: [[0, 13], [8, 0]],
  tier: 6,
  hpMul: 0.72,
  startGold: 420,
  startLives: 15,
  waveSet: 'nightmare20',
  theme: {
    ground: '#2a2038', groundAlt: '#241b30', path: '#3b2f42', pathEdge: '#4d3d55',
    accent: '#c084fc', sky: '#170f20',
  },
})

registerMap({
  id: 'warehouse',
  art: 'warehouse',  props: ['crate', 'barrel', 'sack'],
  name: '창고',
  order: 4,
  desc: '쌓인 상자 사이로 길이 갈린다. 지을 자리가 상자에 막혀 배치가 까다롭다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [1, -1], [1, 3], [7, 3], [7, 6], [3, 6],
    [3, 9], [7, 9], [7, 12], [4, 12], [4, 14],
  ],
  blocked: [[5, 1], [6, 1], [0, 5], [0, 6], [5, 11], [6, 11]],
  tier: 4,
  hpMul: 1.05,
  startGold: 300,
  startLives: 18,
  waveSet: 'warehouse30',
  theme: {
    ground: '#3a3630', groundAlt: '#332f2a', path: '#57493a', pathEdge: '#6b5a47',
    accent: '#d9a05b', sky: '#241f1a',
  },
})

registerMap({
  id: 'basement',
  art: 'basement',   props: ['barrel', 'jar', 'sack'],
  name: '지하실',
  order: 5,
  desc: '축축하고 어둡다. 길이 가장 짧아 실수를 되돌릴 시간이 없다.',
  cols: 9,
  rows: 14,
  waypoints: [
    [4, -1], [4, 4], [1, 4], [1, 9], [7, 9], [7, 14],
  ],
  blocked: [[0, 0], [8, 0], [0, 13], [8, 13], [4, 6], [4, 7]],
  tier: 5,
  hpMul: 1.20,
  startGold: 340,
  startLives: 15,
  waveSet: 'basement30',
  theme: {
    ground: '#1f2a2b', groundAlt: '#1a2425', path: '#3a4442', pathEdge: '#4b5654',
    accent: '#5fd6c0', sky: '#111a1b',
  },
})
