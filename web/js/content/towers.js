/**
 * 고양이 타워 정의.
 *
 * ▶ 새 고양이를 추가하려면: 아래 registerTower 블록 하나를 통째로 복사해서 값만 바꾸면 된다.
 *   상점 카드, 도감, 업그레이드 패널, 사거리 표시가 전부 자동으로 따라온다. UI 코드는 손대지 않는다.
 *
 * 규약:
 *   levels[0].cost = 건설비 / levels[n>0].cost = 그 레벨로 올리는 업그레이드비
 *   range = 타일, fireRate = 발/초, damage = 1발당 공격력 (적 방어력만큼 깎이고 최소 1은 들어간다)
 *   targets = 'all' | 'ground' | 'air'
 *   effects = effects.js에 등록된 kind만 쓸 수 있다 (오타면 부팅 때 ContentError로 잡힌다)
 */

import { registerTower } from './registry.js'

registerTower({
  id: 'cheese',
  pose: 'jab',      // 공격 모션 (sprites.js 의 registerPose)
  frames: 'cat-cheese',   // 프레임 아트. 있으면 이걸 그리고 pose 는 안 쓴다
  name: '치즈냥',
  order: 1,
  desc: '빠르게 연사하는 기본 고양이. 싸고 무난하지만 두꺼운 장갑엔 힘을 못 쓴다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#f2b544', belly: '#ffe6b0', stripe: '#d4901f', eye: '#3c8c46', face: 'wide' },
  levels: [
    { cost:  80, damage: 12, range: 2.6, fireRate: 1.6, projectile: 'pellet', effects: [] },
    { cost:  60, damage: 20, range: 2.9, fireRate: 2.0, projectile: 'pellet', effects: [] },
    { cost: 130, damage: 32, range: 3.2, fireRate: 2.4, projectile: 'pellet', effects: [] },
  ],
})

registerTower({
  id: 'calico',
  pose: 'cast',      // 공격 모션 (sprites.js 의 registerPose)
  frames: 'cat-calico',
  name: '삼색냥',
  order: 2,
  desc: '헤어볼을 뱉어 주변까지 터뜨린다. 몰려오는 무리에 강하지만 하늘은 못 본다.',
  sprite: 'cat',
  targets: 'ground',
  palette: { fur: '#f6f1e7', belly: '#ffffff', stripe: '#c8622f', patch: '#2f2a26', eye: '#c9a227', face: 'grumpy' },
  levels: [
    { cost: 160, damage: 26, range: 2.4, fireRate: 0.70, projectile: 'bomb',
      effects: [{ kind: 'splash', radius: 1.1, falloff: 0.5 }] },
    { cost: 120, damage: 42, range: 2.6, fireRate: 0.80, projectile: 'bomb',
      effects: [{ kind: 'splash', radius: 1.3, falloff: 0.5 }] },
    { cost: 240, damage: 66, range: 2.8, fireRate: 0.95, projectile: 'bomb',
      effects: [{ kind: 'splash', radius: 1.6, falloff: 0.55 }] },
  ],
})

registerTower({
  id: 'siamese',
  pose: 'gaze',      // 공격 모션 (sprites.js 의 registerPose)
  frames: 'cat-siamese',
  // 그림에 눈빛이 없다(흰 선은 수염이다). 이 한 마리만 코드 효과를 덧그린다.
  effectOverArt: true,
  name: '샴냥',
  order: 3,
  desc: '서늘한 눈빛으로 적을 얼린다. 피해는 약하지만 다른 고양이들이 때릴 시간을 벌어준다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#e8ddcc', belly: '#f7f1e6', stripe: '#5b4a45', eye: '#4aa3d8', face: 'cold' },
  levels: [
    { cost: 130, damage:  6, range: 2.4, fireRate: 1.2, projectile: 'gaze',
      effects: [{ kind: 'slow', factor: 0.40, duration: 1.6 }] },
    { cost: 100, damage: 10, range: 2.7, fireRate: 1.4, projectile: 'gaze',
      effects: [{ kind: 'slow', factor: 0.52, duration: 2.0 }] },
    { cost: 200, damage: 16, range: 3.0, fireRate: 1.6, projectile: 'gaze',
      effects: [{ kind: 'slow', factor: 0.65, duration: 2.4 }] },
  ],
})

registerTower({
  id: 'black',
  pose: 'blade',      // 공격 모션 (sprites.js 의 registerPose)
  frames: 'cat-black',
  name: '검은냥',
  order: 4,
  desc: '맵 절반을 노려보는 저격수. 한 방이 무거워 두더지 같은 중장갑을 뚫는 유일한 답이다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#3a3540', belly: '#575060', stripe: '#2a262f', eye: '#f2d45c', face: 'smug' },
  levels: [
    { cost: 240, damage:  70, range: 5.0, fireRate: 0.45, projectile: 'dart', effects: [] },
    { cost: 180, damage: 115, range: 5.5, fireRate: 0.50, projectile: 'dart', effects: [] },
    { cost: 360, damage: 190, range: 6.2, fireRate: 0.60, projectile: 'dart', effects: [] },
  ],
})

registerTower({
  id: 'chonk',
  pose: 'slam',      // 공격 모션 (sprites.js 의 registerPose)
  frames: 'cat-chonk',
  name: '뚱냥',
  order: 5,
  desc: '몸통으로 주변을 통째로 후려친다. 사거리는 짧지만 적이 뭉칠수록 무섭다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#b0b7c3', belly: '#e2e7ee', stripe: '#8d95a3', eye: '#6fae6f', face: 'sleepy' },
  levels: [
    { cost: 200, damage: 14, range: 1.9, fireRate: 0.90, projectile: null,
      effects: [{ kind: 'aura' }] },
    { cost: 150, damage: 24, range: 2.1, fireRate: 1.05, projectile: null,
      effects: [{ kind: 'aura' }] },
    { cost: 300, damage: 38, range: 2.4, fireRate: 1.20, projectile: null,
      effects: [{ kind: 'aura' }] },
  ],
})

/*
 * ── 아래 넷은 effects.js 에 계약만 열려 있던 능력 4개를 하나씩 채운다 ──────────
 *
 * 그림(frames)이 아직 없어서 sprite 로 떨어진다 — 벡터 도형으로 그려진다.
 * 밸런스를 확인한 뒤에 발주하려고 일부러 이 순서로 둔다. 그림이 오면 frames 한 줄을
 * 더하면 되고 다른 코드는 손대지 않는다.
 *
 * 값의 기준선(Lv3 초당 피해 / 총투자): 치즈냥 76.8/270 · 삼색냥 62.7/520 ·
 * 샴냥 25.6/430 · 검은냥 114/780 · 뚱냥 45.6×적수/650.
 * 넷 다 시나리오 후반 보상이라 건설비를 190~240 대에 뒀다.
 */

registerTower({
  id: 'mackerel',
  frames: 'cat-mackerel',
  pose: 'blade',
  name: '고등어냥',
  order: 6,
  desc: '할퀸 자리가 계속 아프다. 한 방은 약하지만 상처는 갑옷을 가리지 않는다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#8f9aa6', belly: '#e3e8ec', stripe: '#4a5560', eye: '#8fe388', face: 'wide' },
  levels: [
    { cost: 190, damage: 9, range: 2.8, fireRate: 1.20, projectile: 'dart',
      effects: [{ kind: 'dot', dps: 7, duration: 3.0, maxStacks: 2 }] },
    { cost: 150, damage: 15, range: 3.0, fireRate: 1.35, projectile: 'dart',
      effects: [{ kind: 'dot', dps: 11, duration: 3.5, maxStacks: 3 }] },
    { cost: 280, damage: 24, range: 3.3, fireRate: 1.50, projectile: 'dart',
      effects: [{ kind: 'dot', dps: 16, duration: 4.0, maxStacks: 3 }] },
  ],
})

registerTower({
  id: 'bluerussian',
  frames: 'cat-bluerussian',
  pose: 'gaze',
  name: '러시안블루냥',
  order: 7,
  desc: '털에서 정전기가 튄다. 옆으로 옮겨붙어 하늘에 뜬 것까지 감전시킨다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#8ea6bd', belly: '#cfe0ee', stripe: '#6b8299', eye: '#ffd166', face: 'wide' },
  levels: [
    { cost: 220, damage: 20, range: 2.7, fireRate: 0.90, projectile: 'gaze',
      effects: [{ kind: 'chain', jumps: 2, radius: 1.6, falloff: 0.60 }] },
    { cost: 170, damage: 32, range: 2.9, fireRate: 1.00, projectile: 'gaze',
      effects: [{ kind: 'chain', jumps: 3, radius: 1.8, falloff: 0.62 }] },
    { cost: 300, damage: 52, range: 3.1, fireRate: 1.15, projectile: 'gaze',
      effects: [{ kind: 'chain', jumps: 4, radius: 2.0, falloff: 0.65 }] },
  ],
})

registerTower({
  id: 'tuxedo',
  frames: 'cat-tuxedo',
  pose: 'jab',
  name: '턱시도냥',
  order: 8,
  // 자기 화력이 거의 없다는 걸 설명에 분명히 적는다. 안 그러면 "약한 고양이"로 보인다.
  desc: '자기는 거의 안 때린다. 대신 옆에 선 고양이들이 눈에 띄게 세진다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#2b2b30', belly: '#f2f2f0', stripe: '#1a1a1e', eye: '#ffd166', face: 'grumpy' },
  levels: [
    { cost: 200, damage: 4, range: 2.0, fireRate: 0.80, projectile: 'pellet',
      effects: [{ kind: 'buff', radius: 1.5, damageMul: 1.12, fireRateMul: 1.08 }] },
    { cost: 170, damage: 6, range: 2.2, fireRate: 0.90, projectile: 'pellet',
      effects: [{ kind: 'buff', radius: 1.8, damageMul: 1.18, fireRateMul: 1.12 }] },
    { cost: 300, damage: 9, range: 2.4, fireRate: 1.00, projectile: 'pellet',
      effects: [{ kind: 'buff', radius: 2.2, damageMul: 1.26, fireRateMul: 1.18 }] },
  ],
})

registerTower({
  id: 'sphynx',
  frames: 'cat-sphynx',
  pose: 'slam',
  name: '스핑크스냥',
  order: 9,
  desc: '꼬리를 창처럼 곧게 쏜다. 길이 곧게 뻗은 자리에 놓으면 줄지어 선 것을 한 번에 꿴다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#d9b9a3', belly: '#f0dccb', stripe: '#b5917a', eye: '#7fd1c1', face: 'wide' },
  levels: [
    { cost: 240, damage: 30, range: 3.6, fireRate: 0.60, projectile: null,
      effects: [{ kind: 'pierce', width: 0.45, maxHits: 3 }] },
    { cost: 190, damage: 48, range: 4.0, fireRate: 0.70, projectile: null,
      effects: [{ kind: 'pierce', width: 0.50, maxHits: 4 }] },
    { cost: 330, damage: 78, range: 4.4, fireRate: 0.80, projectile: null,
      effects: [{ kind: 'pierce', width: 0.55, maxHits: 5 }] },
  ],
})
