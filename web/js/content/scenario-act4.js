/**
 * 4막 — 25~30장 '새벽'. **유료 콘텐츠다** (shop.js 의 `story_act4`).
 *
 * 3막(scenario-act3.js)과 같은 규칙으로 파일이 따로다 — 데모 웹 빌드가 이 파일을 빼고 굽는다(`content/index.js` 의
 * `// demo:strip`). act 4 는 domain/entitlements.js 의 FREE_ACTS 밖이라 progress.unlocks.acts 에 4 가 있어야 열린다.
 *
 * 이야기: 24장 자정에 마왕 쥐를 돌려보냈더니, 동트기 전에 **속성 왕 셋**(번개 집게벌레 · 서리 지렁이 여왕 · 눈부신
 * 비둘기 — J-5 의 보스 셋, 지금까지 원정에만 나왔다)이 차례로 오고, 30장 새벽에 마왕 쥐가 왕관 셋을 쓰고 돌아온다.
 * 속성 상성은 시나리오에서 안 걸린다(README 약속 그대로) — 왕들은 능력으로 다르다.
 *
 * 맵: 원정 전용 맵 둘(좁은 복도 · 넓은 광장)을 이야기에서 처음 쓴다. 지금까지 시나리오는 자유 맵 일곱만 썼다.
 * 웨이브 구성 둘(dawn24 · kings18)은 waveSets.js 에 있다.
 *
 * ▶ 장별 `rules.hpMul` (U-4) — 3막처럼 **그 장의 봇 상한 위**에 둔다. scenario-curve.test 가 25~30장 구간 평균을
 *   17~24장보다 5pp 넘게 낮게, 20% 위로 못 박는다. 값은 `deck` 봇 · 보통 · 시드 7·23·11 × 3판 쓸이로 골랐다 —
 *   쓸이표는 각 줄 주석과 docs/확장가이드.md 에 있다.
 */
import { registerChapter } from './registry.js'

registerChapter({
  id: 'ch25', order: 25, act: 4, title: '동트기 전',
  mapId: 'alley', waveSet: 'dawn24', waveLimit: 12,
  // 쓸이(deck · 보통 · 시드 7·23·11 × 3판): 2.0 → 100% · 2.3 → 67% · 2.4·2.5 → 89% · **2.6·2.7 → 33%** · 2.8 → 11% · 3.0 → 0%
  // 재지 않은 사이값 2.65 는 0% 였다 — 절벽 근처는 이웃이 같아도 사이가 다르다. 잰 값만 쓴다.
  rules: { hpMul: 2.70 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'livesAbove', n: 15 }],
  intro: [
    { who: 'black', text: '자정은 지났다. 그런데 하늘이 이상해.' },
    { who: 'boltearwig', text: '번개가 먼저 간다. 왕들이 뒤따른다.', side: 'right' },
    { who: 'cheese', text: '왕이 더 있었어?' },
  ],
  outro: [{ who: 'black', text: '번개는 잡았다. 셋 중 하나.' }],
  rewards: { catnip: 60 },
})

registerChapter({
  id: 'ch26', order: 26, act: 4, title: '얼어붙은 복도',
  mapId: 'corridor', waveSet: 'kings18', waveLimit: 12,
  // 쓸이: 1.4 → 100% · 1.6 → 67% · **1.62 → 44%** · 1.65 → 78% · 1.68 → 22% · 1.70 → 0% · 1.73 → 11% · 1.76 → 0% — 절벽이 거칠다, 안전한 쪽
  rules: { hpMul: 1.62 },
  primary: { kind: 'killBoss', enemyId: 'frostworm' },
  bonus: [{ kind: 'noSell' }, { kind: 'maxSpecials', n: 3 }],
  intro: [
    { who: 'frostworm', text: '얼어라. 벽도, 발도.', side: 'right' },
    { who: 'mackerel', text: '벽은 갉고 발은 뛰지. 복도가 좁아서 좋네.' },
  ],
  outro: [{ who: 'mackerel', text: '여왕이 얼어붙었다. 제 얼음에.' }],
  rewards: { catnip: 65 },
})

registerChapter({
  id: 'ch27', order: 27, act: 4, title: '눈부신 아침',
  mapId: 'rooftop', waveSet: 'dawn24', waveLimit: 20,
  // 쓸이: 2.3 → 100% · 2.6 → 78% · 2.9 → 56% · **2.95 → 33%** · 3.0 → 22% · 3.05·3.1 → 0% · 3.15 → 11% (지붕은 20장처럼 봇이 잘 둔다 — 값이 크다)
  rules: { hpMul: 2.95 },
  primary: { kind: 'killBoss', enemyId: 'glowpigeon' },
  bonus: [{ kind: 'killAtLeast', n: 300 }, { kind: 'livesAbove', n: 12 }],
  intro: [
    { who: 'glowpigeon', text: '빛에 눈을 감아라.', side: 'right' },
    { who: 'bluerussian', text: '감고도 맞춰. 정전기는 눈이 없거든.' },
  ],
  outro: [{ who: 'calico', text: '눈부셨지만 다 봤다.' }],
  rewards: { catnip: 70 },
})

registerChapter({
  id: 'ch28', order: 28, act: 4, title: '온실의 왕들',
  // 18웨이브 그대로는 벽이다(온실 1.76 × 왕 둘 — 1.0 에서 0%, 0.55 에서야 67%). 12웨이브로 잘라 12웨이브의 왕 둘(서리 여왕·두더지 대장)을 끝으로 둔다
  // 쓸이(12웨이브): 0.9·1.0 → 100% · **1.1 → 33%** · 1.2 → 33% · 1.3 → 0%
  mapId: 'greenhouse', waveSet: 'kings18', waveLimit: 12,
  rules: { hpMul: 1.10 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'goldLeft', n: 300 }, { kind: 'makeCombo', comboId: 'rainbow-five' }],
  intro: [
    { who: 'sphynx', text: '온실이다. 여섯 색이 다 있어.' },
    { who: 'molelord', text: '땅 밑은 내 것이라 했지.', side: 'right' },
  ],
  outro: [{ who: 'sphynx', text: '땅 밑까지 우리 것.' }],
  rewards: { catnip: 80 },
})

registerChapter({
  id: 'ch29', order: 29, act: 4, title: '넓은 광장',
  mapId: 'plaza', waveSet: 'dawn24',
  // 쓸이: 1.0 → 100% · 1.2 → 89% · 1.24 → 78% · 1.27 → 56% · 1.30 → 67% · 1.33·1.36 → 44% · 1.38 → 0% — 절벽 앞이 44% 로 평평해서
  // 골드를 조금 덜 준다(360 → 324): 1.33 에 startGoldMul 0.9 → **33%** (0.85 → 33% · 0.8 → 44%, 거칠다)
  rules: { hpMul: 1.33, startGoldMul: 0.9 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'maxTowers', n: 14 }, { kind: 'clearWithin', sec: 1200 }],
  intro: [
    { who: 'tuxedo', text: '광장이 넓다. 노래가 멀리 간다.' },
    { who: 'demonking', text: '넷째 밤은 없다고 했지. 그래서 아침에 왔다.', side: 'right' },
  ],
  outro: [{ who: 'tuxedo', text: '아침에도 우리는 여기 있다.' }],
  rewards: { catnip: 90 },
})

registerChapter({
  id: 'ch30', order: 30, act: 4, title: '새벽',
  mapId: 'attic', waveSet: 'kings18',
  // 쓸이(startGoldMul 0.875): 1.2 → 67% · 1.22 → 56% · 1.25 → 67% · 1.28·1.29 → 56% · 1.30·1.31 → 11% · 1.34 → 0% — 절벽이라 사이가 없다.
  // 그래서 골드로 잡았다: 1.29 에 startGoldMul 0.8(480 → 384) → **22%** (0.75 → 11% · 0.7 → 33%, 거칠다). 최종장이 4막에서 가장 어렵다
  rules: { hpMul: 1.29, startGoldMul: 0.8 },
  primary: { kind: 'killBoss', enemyId: 'demonking' },
  bonus: [{ kind: 'livesAbove', n: 8 }, { kind: 'makeCombo', comboId: 'sky-and-ground' }],
  intro: [
    { who: 'demonking', text: '왕관 셋을 다 썼다. 새벽 전에 끝내지.', side: 'right' },
    { who: 'cheese', text: '새벽이 오고 있어. 그건 우리 편이야.' },
    { who: 'black', text: '전부 다 같이.' },
  ],
  outro: [
    { who: 'cheese', text: '해가 떴다. 집은 그대로다.' },
    { who: 'calico', text: '내일도, 모레도.' },
  ],
  rewards: { catnip: 200, skin: 'cheese-dawn' },
})
