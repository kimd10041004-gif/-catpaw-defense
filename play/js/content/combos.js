/**
 * 고양이 조합 — 특정 고양이들을 특정 모양으로 놓으면 이름이 붙고 배수가 얹힌다.
 *
 * ▶ 새 조합을 추가하려면: registerCombo 블록 하나를 복사하면 된다.
 *   도감의 조합 탭은 레지스트리를 순회하므로 UI 코드는 손대지 않는다.
 *
 * 모양(shape)
 *   adjacent  상하좌우로 이어진 한 덩어리
 *   diagonal  두 마리가 대각선으로 맞닿음
 *   line      같은 행 또는 열에서 빈칸 없이 연속
 *   near      전원이 3×3 안
 *
 * **효과를 작게 두고 수를 늘린다.** 하나가 너무 세면 '정답 배치'가 하나로 굳어
 * 오히려 자유가 준다. 어느 배치를 해도 뭔가 하나는 걸리는 쪽이 낫다.
 *
 * 배수는 domain/mods.js 가 buff·펫과 함께 합치고 상한을 씌운다. 여기 값은 그 전 값이다.
 */

import { registerCombo } from './registry.js'

registerCombo({
  id: 'cheese-trio',
  name: '치즈 삼총사',
  desc: '치즈냥 셋이 한 줄로 서면 서로 신이 나서 더 빨리 쏜다.',
  towers: ['cheese', 'cheese', 'cheese'],
  shape: 'line',
  mods: { fireRateMul: 1.25 },
})

registerCombo({
  id: 'monochrome',
  name: '흑백 콤비',
  desc: '검은냥 옆에 턱시도냥이 서면 시야가 트인다.',
  towers: ['black', 'tuxedo'],
  shape: 'adjacent',
  mods: { rangeAdd: 0.8 },
})

registerCombo({
  id: 'ice-garden',
  name: '얼음 정원',
  desc: '샴냥 둘이 대각선으로 마주 보면 눈빛이 겹쳐 더 오래 얼린다.',
  towers: ['siamese', 'siamese'],
  shape: 'diagonal',
  mods: { damageMul: 1.2, fireRateMul: 1.15 },
})

registerCombo({
  id: 'chonk-wall',
  name: '뚱냥 방벽',
  desc: '뚱냥 둘이 나란히 서면 서로 등을 맡기고 더 세게 후려친다.',
  towers: ['chonk', 'chonk'],
  shape: 'adjacent',
  mods: { damageMul: 1.2 },
})

registerCombo({
  id: 'rainbow-five',
  name: '무지개 다섯',
  desc: '서로 다른 다섯 마리가 한자리에 모이면 다 같이 힘이 난다.',
  towers: ['cheese', 'calico', 'siamese', 'black', 'chonk'],
  shape: 'near',
  mods: { damageMul: 1.1, fireRateMul: 1.1 },
})

registerCombo({
  id: 'tide-pool',
  name: '물결 웅덩이',
  desc: '샴냥 옆에 고등어냥이 서면 얼어붙은 상처가 더 깊게 벌어진다.',
  towers: ['siamese', 'mackerel'],
  shape: 'adjacent',
  mods: { damageMul: 1.15 },
})

registerCombo({
  id: 'static-field',
  name: '정전기 마당',
  desc: '러시안블루냥과 스핑크스냥이 가까이 있으면 털이 서서 둘 다 더 빨리 쏜다.',
  towers: ['bluerussian', 'sphynx'],
  shape: 'near',
  mods: { fireRateMul: 1.15 },
})

/* ── 카드 고양이 셋 (towers-cards.js) ────────────────────────────────────
 * `content.test` 가 "조합에 안 드는 고양이 없음"을 본다. 숫자를 채우려고 아무나 묶지 않고,
 * **효과가 서로를 설명하는 짝**으로 묶었다 — 장갑 둘 · 지원 둘 · 하늘과 땅. */

registerCombo({
  id: 'armor-breaker',
  name: '껍질 벗기기',
  desc: '먼치킨냥이 장갑을 벗기고 터키시앙고라냥이 그 틈으로 꿰뚫는다.',
  towers: ['munchkin', 'angora'],
  shape: 'adjacent',
  mods: { damageMul: 1.15 },
})

registerCombo({
  id: 'far-sight',
  name: '멀리 보는 눈',
  desc: '노르웨이숲냥이 시야를 넓히고 사바나냥이 그만큼 멀리 표식을 찍는다.',
  towers: ['forest', 'savannah'],
  shape: 'near',
  mods: { rangeAdd: 0.4 },
})

registerCombo({
  id: 'sky-and-ground',
  name: '하늘과 땅',
  desc: '벵갈냥이 하늘을 맡고 메인쿤냥이 땅을 밀어낸다. 서로 볼 일이 없어 둘 다 빨라진다.',
  towers: ['bengal', 'mainecoon'],
  shape: 'near',
  mods: { fireRateMul: 1.15 },
})
