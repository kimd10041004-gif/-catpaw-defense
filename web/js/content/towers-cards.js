/**
 * 카드 전용 고양이 여섯 — **뽑기로만 얻는다**(`rarity` 가 붙은 유일한 콘텐츠다).
 *
 * **무료다.** 티켓은 출석과 원정으로 벌리고 뽑기는 티켓부터 쓴다 — 결제 없이 여기 닿을 수 있다.
 * 그래서 `content/index.js` 에서 `// demo:strip` 을 안 붙인다.
 *
 * ── 무엇을 넣을지 감으로 안 골랐다 ─────────────────────────────────────────
 *
 * 기존 아홉을 재 보니 세 축이 몰려 있었다:
 *
 *   표적    all 8 · ground 1 · **air 0**
 *   건설비  80 하나, 나머지 여덟이 130~240 안
 *   사거리  1.9~3.6 안에 여덟 (검은냥 5.0 만 예외)
 *
 * 그리고 `ctx.applyTrueDamage` 는 만들어 두고 **쓰는 콘텐츠가 하나도 없었다**.
 * 여섯 마리는 그 빈 곳을 하나씩 메운다 — 같은 대역에 열 번째를 더하면 기존 하나를 밀어낼 뿐이다.
 *
 * ── 숫자를 키우지 않는다. 새 메커니즘을 준다 ────────────────────────────
 *
 * 처음엔 "값이 비싼 대신 한 방이 큰" 식으로 짰다가 `content.test` 의
 * **"모든 고양이가 적어도 한 축에서 1등이다"** 에 걸렸다 — 메인쿤이 검은냥의 '한 방 최대'를,
 * 사바나가 '사거리 최장'을, 먼치킨이 치즈냥의 '가장 싸다'를 뺏어서 **기존 고양이가 존재 이유를 잃었다.**
 * 시나리오 보상으로 무료로 주는 고양이를 뽑기 고양이가 밀어내면 그건 "뽑기가 진행을 대신 깨는" 것이다.
 *
 * 그래서 여섯 다 **자기만의 효과**를 갖고, 기존 최고 기록은 하나도 안 건드린다:
 *
 *   먼치킨 sunder    장갑을 벗긴다 — 옆의 모두가 이득을 본다
 *   벵갈   (표적)     이 게임의 유일한 **공중 전용**
 *   노르웨이숲 sightaura  옆 고양이의 **사거리**를 늘린다 (턱시도냥은 피해·연사)
 *   앙고라 truestrike  한 방이 장갑을 그대로 통과한다
 *   사바나 mark       찍힌 적이 **모두에게** 더 아프다
 *   메인쿤 knockback  길 뒤로 밀어낸다 — 피해가 아니라 시간을 번다
 *
 * 값·사거리·한 방은 전부 기존 1등 아래로 눌러 뒀다(검은냥 190/6.2 · 치즈냥 80).
 * `balance-sim --order` 로 재서 기존 봇보다 크게 나아지지 않는 것을 확인했다.
 *
 * 그림은 아직 **팔레트뿐이다**(`frames` 없음 → 벡터 고양이에 색만 다르다). 발주가 나가면
 * `registerFrameSet` + `frames:` 한 줄로 갈아 끼운다 — 스킨과 같은 길이다.
 */

import { registerTower } from './registry.js'

/* 표적·값·사거리에서 **한 번도 안 쓰던 자리**를 하나씩 잡는다.
 * 등급은 뽑기 표(gacha.js)의 이름과 같아야 한다: epic 10% · legend 2%. */

registerTower({
  id: 'munchkin',
  element: 'earth',
  rarity: 'epic',
  pose: 'jab',
  name: '먼치킨냥',
  order: 10,
  desc: '다리가 짧아 멀리 못 본다. 대신 쉬지 않고 때려서 해충의 장갑을 벗긴다.',
  sprite: 'cat',
  targets: 'ground',
  palette: { fur: '#b5723c', belly: '#f0dcc0', stripe: '#7a4a24', eye: '#7fd1c1', face: 'round' },
  levels: [
    /* 값 90 — 치즈냥(80)보다 **비싸다**. 처음에 60 으로 뒀다가 치즈냥이 '가장 싸다' 축을 잃었다.
     * 자기 화력은 평범하고, 값은 초당 여러 번 때려 장갑을 빠르게 벗기는 데 있다. */
    { cost: 90, damage: 7, range: 1.4, fireRate: 2.2, projectile: 'pellet',
      effects: [{ kind: 'sunder', amount: 1, max: 3, duration: 3 }] },
    { cost: 70, damage: 11, range: 1.5, fireRate: 2.6, projectile: 'pellet',
      effects: [{ kind: 'sunder', amount: 1, max: 4, duration: 3.5 }] },
    { cost: 150, damage: 17, range: 1.6, fireRate: 3.0, projectile: 'pellet',
      effects: [{ kind: 'sunder', amount: 2, max: 6, duration: 4 }] },
  ],
})

registerTower({
  id: 'bengal',
  element: 'bolt',
  rarity: 'epic',
  pose: 'jab',
  name: '벵갈냥',
  order: 11,
  desc: '하늘만 본다. 땅 위의 해충은 눈에 안 들어온다.',
  sprite: 'cat',
  targets: 'air',
  palette: { fur: '#d9b23a', belly: '#f7e7b6', stripe: '#1e1a12', eye: '#7fd8ff', face: 'sharp' },
  levels: [
    // 공중 전용은 이 게임에 하나도 없었다. 대공만 보는 대신 사거리와 연사를 크게 준다.
    { cost: 110, damage: 16, range: 3.9, fireRate: 1.8, projectile: 'dart', effects: [] },
    { cost: 90, damage: 26, range: 4.2, fireRate: 2.1, projectile: 'dart', effects: [] },
    { cost: 180, damage: 42, range: 4.6, fireRate: 2.4, projectile: 'dart', effects: [] },
  ],
})

registerTower({
  id: 'forest',
  element: 'ice',
  rarity: 'epic',
  pose: 'jab',
  name: '노르웨이숲냥',
  order: 12,
  desc: '덩치가 커서 굼뜨다. 대신 옆에 선 고양이들의 시야를 넓혀 준다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#7c8fa3', belly: '#dfe8ef', stripe: '#4a5866', eye: '#a7f3d0', face: 'sleepy' },
  levels: [
    /* `rangeAdd` 를 쓰는 콘텐츠가 조합 하나뿐이었다. 턱시도냥이 피해·연사를 올린다면
     * 이쪽은 **사거리**를 올린다 — 사거리가 짧은 고양이(먼치킨 1.6 · 뚱냥 1.9)와 같이 두면
     * 놓을 자리가 통째로 달라진다. combineMods 의 rangeAdd 상한이 1.5 라 무한정 쌓이지는 않는다.
     * 둔화는 일부러 안 붙였다 — 샴냥의 'slow 유일' 축을 뺏어 그 고양이를 고를 이유를 없앤다. */
    { cost: 260, damage: 8, range: 2.0, fireRate: 0.8, projectile: 'gaze',
      effects: [{ kind: 'sightaura', radius: 1.6, rangeAdd: 0.6 }] },
    { cost: 210, damage: 13, range: 2.2, fireRate: 0.9, projectile: 'gaze',
      effects: [{ kind: 'sightaura', radius: 1.9, rangeAdd: 0.9 }] },
    { cost: 370, damage: 21, range: 2.4, fireRate: 1.0, projectile: 'gaze',
      effects: [{ kind: 'sightaura', radius: 2.3, rangeAdd: 1.2 }] },
  ],
})

registerTower({
  id: 'angora',
  element: 'light',
  rarity: 'epic',
  pose: 'jab',
  name: '터키시앙고라냥',
  order: 13,
  desc: '한 방이 장갑을 그대로 통과한다. 두꺼운 놈일수록 아프다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#fbfaf7', belly: '#ffffff', stripe: '#ece8de', eye: '#7fd8ff', face: 'proud' },
  levels: [
    /* 장갑은 뺄셈이라 마왕 쥐(14)·두더지 대장(12) 앞에서는 한 방의 크기보다 **넘느냐**가 전부다.
     * 22짜리 한 방이 8이 되는 대신 22 그대로 들어간다 — 잡몹엔 평범하고 보스엔 두 배가 넘는다. */
    { cost: 300, damage: 22, range: 2.2, fireRate: 0.90, effects: [{ kind: 'truestrike' }] },
    { cost: 240, damage: 36, range: 2.4, fireRate: 1.00, effects: [{ kind: 'truestrike' }] },
    { cost: 430, damage: 58, range: 2.6, fireRate: 1.10, effects: [{ kind: 'truestrike' }] },
  ],
})

registerTower({
  id: 'savannah',
  element: 'fire',
  rarity: 'legend',
  pose: 'jab',
  name: '사바나냥',
  order: 14,
  desc: '멀리서 표식을 찍는다. 찍힌 해충은 모두에게 더 아프다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#d9a441', belly: '#fbeccb', stripe: '#2f2a20', eye: '#ff7a59', face: 'sharp' },
  levels: [
    /* 사거리 4.4 — 검은냥(6.2)의 '사거리 최장'은 안 건드린다. 값은 거리가 아니라 표식에 있다:
     * 뒤에 선 고양이가 몇 마리든 전부 이득을 보므로 **화력이 모인 판일수록 커진다.** */
    { cost: 360, damage: 14, range: 4.4, fireRate: 0.90, projectile: 'dart',
      effects: [{ kind: 'mark', mul: 1.22, duration: 4 }] },
    { cost: 290, damage: 22, range: 4.7, fireRate: 1.00, projectile: 'dart',
      effects: [{ kind: 'mark', mul: 1.30, duration: 4.5 }] },
    { cost: 520, damage: 35, range: 5.0, fireRate: 1.10, projectile: 'dart',
      effects: [{ kind: 'mark', mul: 1.40, duration: 5 }] },
  ],
})

registerTower({
  id: 'mainecoon',
  element: 'dark',
  rarity: 'legend',
  pose: 'jab',
  name: '메인쿤냥',
  order: 15,
  desc: '세 걸음에 한 번 때린다. 맞은 해충은 길 뒤로 밀려난다.',
  sprite: 'cat',
  targets: 'all',
  palette: { fur: '#4a3f52', belly: '#cfc6d8', stripe: '#2a2330', eye: '#a78bfa', face: 'grumpy' },
  levels: [
    /* 한 방 185(3레벨) — 검은냥 190 **바로 아래**다. 처음에 240 으로 뒀다가
     * `effects-cards.test` 의 "기존 1등을 안 뺏는다"에 걸렸다. 초당 피해도 92 vs 114 로 낮다.
     * 값은 **시간**이다: 맞을 때마다 뒤로 밀리니 같은 길을 두 번 지나게 만든다.
     * 보스는 덜 밀린다(35%) — 안 그러면 보스가 문 앞에서 영영 제자리걸음을 한다. */
    { cost: 400, damage: 100, range: 3.0, fireRate: 0.42, projectile: 'bomb',
      effects: [{ kind: 'knockback', tiles: 0.6, bossMul: 0.35 }] },
    { cost: 320, damage: 140, range: 3.2, fireRate: 0.46, projectile: 'bomb',
      effects: [{ kind: 'knockback', tiles: 0.8, bossMul: 0.35 }] },
    { cost: 560, damage: 185, range: 3.4, fireRate: 0.50, projectile: 'bomb',
      effects: [{ kind: 'knockback', tiles: 1.0, bossMul: 0.35 }] },
  ],
})
