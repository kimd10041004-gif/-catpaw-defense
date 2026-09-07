/**
 * 3막 — 19~24장. **유료 콘텐츠다** (shop.js 의 `story_act3`).
 *
 * 왜 파일이 따로인가: 데모 웹 빌드(`tools/demo-build.mjs` → `site/play/`)가 이 파일을 **빼고 굽는다**.
 * 데모에는 유료 콘텐츠가 안 들어가 있어야 한다 — 잠가 두는 게 아니라 아예 없다.
 * 그래서 유료 콘텐츠는 무료 콘텐츠와 같은 파일에 섞지 않는다. `content/index.js` 의 `// demo:strip` 표시가 짝이다.
 *
 * act 3 은 domain/entitlements.js 의 FREE_ACTS 밖이라 progress.unlocks.acts 에 3 이 있어야 열린다.
 * 1~2막은 그대로 무료다(content.test 가 검사한다).
 *
 * ▶ 장별 `rules.hpMul` (K) — 규칙과 근거는 scenario.js 머리말에 있다. 여기가 마지막 막이라
 *   배수는 **그 장의 봇 상한 위**에 둔다: `deck` 봇 완주율 41% 다(목표 40~60%).
 *   22장 '두 하늘'만 배수가 없다 — 손 안 댄 채로도 봇이 67% 라 이미 상한 근처다.
 *   20장의 ×1.90 이 커 보이는 것은 그 장 원판이 유난히 물러서다(상한 ×1.70).
 */
import { registerChapter } from './registry.js'

registerChapter({
  id: 'ch19', order: 19, act: 3, title: '세 번째 밤',
  mapId: 'alley', waveSet: 'gauntlet20',
  rules: { hpMul: 1.20 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'makeCombo', comboId: 'tide-pool' }],
  intro: [
    { who: 'cheese', text: '골목이 조용하다. 너무 조용해.' },
    { who: 'ratking', text: '왕들이 순서를 정했다. 나흘에 하나씩.', side: 'right' },
    { who: 'siamese', text: '그럼 나흘에 하나씩 재우면 되겠네.' },
  ],
  outro: [{ who: 'cheese', text: '첫 왕이 갔다. 다음은 누구지.' }],
  rewards: { catnip: 40 },
})

registerChapter({
  id: 'ch20', order: 20, act: 3, title: '번갈아 오는 것들',
  mapId: 'rooftop', waveSet: 'mixed25', waveLimit: 20,
  rules: { hpMul: 1.90 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 12 }, { kind: 'killAtLeast', n: 250 }],
  intro: [
    { who: 'batlord', text: '땅에서 오면 하늘을 잊고, 하늘에서 오면 땅을 잊지.', side: 'right' },
    { who: 'calico', text: '나는 하늘을 못 봐. 그래서 옆에 누가 있는 거야.' },
  ],
  outro: [{ who: 'calico', text: '둘 다 막았다. 둘이서.' }],
  rewards: { catnip: 45 },
})

registerChapter({
  id: 'ch21', order: 21, act: 3, title: '왕관 행렬',
  mapId: 'warehouse', waveSet: 'gauntlet20',
  rules: { hpMul: 1.05 },
  primary: { kind: 'killBoss', enemyId: 'roachqueen' },
  bonus: [{ kind: 'noSell' }, { kind: 'maxSpecials', n: 2 }],
  intro: [
    { who: 'roachqueen', text: '새끼들아, 왕관을 쓰고 가라.', side: 'right' },
    { who: 'chonk', text: '왕관이 몇 개든 한 번에 흔들면 다 떨어져.' },
  ],
  outro: [{ who: 'chonk', text: '여왕이 갔다. 새끼들도 같이.' }],
  rewards: { catnip: 50 },
})

registerChapter({
  id: 'ch22', order: 22, act: 3, title: '두 하늘',
  mapId: 'kitchen', waveSet: 'mixed25',
  primary: { kind: 'survive' },
  bonus: [{ kind: 'withoutTowers', ids: ['chonk'] }, { kind: 'goldLeft', n: 400 }],
  intro: [
    { who: 'bluerussian', text: '스물다섯. 하늘이 열두 번 온다.' },
    { who: 'tuxedo', text: '옆에 서. 내가 노래할게.' },
  ],
  outro: [{ who: 'bluerussian', text: '정전기가 하늘까지 닿았다.' }],
  rewards: { catnip: 60 },
})

registerChapter({
  id: 'ch23', order: 23, act: 3, title: '왕 없는 밤',
  mapId: 'basement', waveSet: 'gauntlet20', waveLimit: 16,
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.33 },                      // 0.95 × 1.33 = 1.26 = 1.20 × 1.05
  primary: { kind: 'noLeak' },
  bonus: [{ kind: 'noUpgrade' }, { kind: 'clearWithin', sec: 900 }],
  intro: [
    { who: 'molelord', text: '지하는 내 것이다. 벽도, 어둠도.', side: 'right' },
    { who: 'mackerel', text: '벽은 갉으면 되고 어둠은 익숙해.' },
  ],
  outro: [{ who: 'mackerel', text: '한 마리도 안 새게. 그게 다였다.' }],
  rewards: { catnip: 70 },
})

registerChapter({
  id: 'ch24', order: 24, act: 3, title: '자정',
  mapId: 'attic', waveSet: 'mixed25',
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.44, startGoldMul: 0.875 },   // 0.60 × 1.44 = 0.864 = 0.72 × 1.20 · 골드 420
  primary: { kind: 'killBoss', enemyId: 'demonking' },
  bonus: [{ kind: 'livesAbove', n: 10 }, { kind: 'makeCombo', comboId: 'static-field' }],
  intro: [
    { who: 'demonking', text: '세 번째 밤이다. 셋이면 충분하다고 했지.', side: 'right' },
    { who: 'black', text: '넷째는 없어. 오늘 끝내.' },
    { who: 'cheese', text: '다 같이.' },
  ],
  outro: [
    { who: 'black', text: '자정이다. 집은 조용하다.' },
    { who: 'cheese', text: '내일도 지킬 거야. 그게 우리 일이니까.' },
  ],
  rewards: { catnip: 150, skin: 'black-midnight' },
})
