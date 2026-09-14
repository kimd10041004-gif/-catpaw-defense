/**
 * 시나리오 챕터 12개.
 *
 * 맵을 12개 만들지 않는다. waveLimit 으로 맵 6개 × 웨이브셋 5개를 조합해서
 * 길이와 성격을 다르게 준다. Game 은 waveSet / waveLimit 두 옵션만 받으면 되고,
 * 승리 판정·진행률·다음 웨이브 버튼이 전부 totalWaves 를 보므로 새 분기가 없다.
 *
 * ▶ 챕터를 추가하려면 registerChapter 블록을 하나 더 쓴다. order 는 겹치면 안 되고,
 *   mapId · waveSet · 목표 kind · 보상 타워 · 컷신 화자는 전부 부팅 때 검사한다.
 *
 * 설계 의도
 *   - 고양이는 2·4·6장에서 하나씩 풀린다. 새 고양이를 받은 다음 장이 그 고양이를
 *     써야 풀리게 짜여 있다 (4장 공중 → 검은냥, 5장 검은냥만, 6장 물량 → 뚱냥)
 *   - 부 목표는 챕터당 2개, 별은 최대 3개. 주 목표를 못 지키면 별이 0개다
 *   - 시나리오는 자유 모드 기록(bestWave·unlockedMaps)을 건드리지 않는다
 *
 * ▶ 장별 `rules.hpMul` (K) — **사람이 "생각보다 쉽다"고 해서 얹었다.** 봇이 아니라 사람 신호다.
 *   그전엔 24장 중 스무 장이 `deck` 봇 완주율 100% 였다 — 24장을 지나며 한 번도 안 올라갔다.
 *
 *   숫자가 장마다 크게 다른 이유: **원판 세기가 다르기 때문이다.** 장마다 봇이 버티는 상한
 *   (완주율 90% 가 깨지는 hpMul)을 재 보니 ×1.05 부터 ×2.6 초과까지 벌어져 있었다 —
 *   13장 '두 번째 밤'은 ×2.6 에도 안 지고, 15장 '하늘의 장갑'은 ×1.05 에서 벌써 흔들린다.
 *   그래서 배수는 **그 차이를 메우는 값**이지 "뒤로 갈수록 큰 수"가 아니다. 압박이 커지는 것은
 *   배수가 아니라 **상한과의 거리**다: 1막은 상한 한참 아래, 2막은 근처, 3막은 상한 위.
 *
 *   K 결과 (`deck` 봇 · 보통 · 시드 7/23/11 × 3판 · 그때의 로스터 · 벽 셋 제외):
 *     3~8장 93% · 9~16장 79% · 17~24장 41%   (전부 100% 였다)
 *
 *   안 건드린 것: **1·2장** — 첫 두 판은 막히면 안 된다. 지금도 100% 다.
 *
 * ▶ **N — 벽 셋을 봇으로 주행해 없앴다.** K 는 벽 셋(7·12·18장)을 *"사람이 깨는지 확인하기 전엔 안 낮춘다"*
 *   로 남겼는데, 사용자가 **"사람이 확인 하는건 어렵다 봇으로 주행하자"** 고 정했다. 그래서 봇을 기준으로 잡았다.
 *
 *   24장을 전부 재고 나니 벽 셋이 **서로 다른 고장**이었다:
 *     · 12·18장은 벽이 아니라 **마지막 한 웨이브**다 — 19웨이브를 살아남고 20웨이브 마왕 쥐에서만 죽는다
 *     · 7장은 반대로 **1웨이브에 뚫린다** — `bossrush10` 인데 지붕 골드 260 에 로스터가 다섯이다
 *   덤으로 곡선의 뒤집힘 둘도 찾았다: **최종장(24장)이 3막에서 가장 쉬웠고**(89%), 11장이 혼자 솟아 있었다(11%).
 *
 *   다섯 장을 고쳤다 (값 옆 주석에 쓸이표가 있다): 7장 0 → 33% · 11장 11 → 67% ·
 *   12장 0 → 22% · 18장 0 → 22% · 24장 89 → 22%. 구간 평균 **88 / 78 / 36%**.
 *
 *   **왜 여태 안 걸렸나**: `scenario-curve.test` 가 **구간 평균만** 봤다. 0% 짜리 장 셋이 평균 뒤에 숨어 있었고,
 *   그 검사가 스스로 그렇게 적어 두기까지 했다. 그래서 **장마다 바닥**을 깔았다 — *"어떤 장도 봇이 한 번도
 *   못 깨지 않는다"*. 고치기 전에 7장에서 빨갰다.
 *
 *   **정직하게**: 봇은 필살기 기본 로드아웃만 쓰고(하악질을 안 든다) 훈련 0단계다 — 장갑 14 짜리 마왕 쥐 앞에서
 *   사람보다 확실히 약하다. 그래서 12·18장은 사람에게 이 숫자보다 쉬울 수 있다. 알고도 봇으로 간 것이다.
 *
 *   `goldMul` 은 손잡이가 **아니다**: ×0.5 로 깎아도 열 장 중 아홉이 완주율 100% 였다.
 *   봇은 돈을 다 안 쓴다. 시나리오에서 골드는 빡빡한 자원이 아니라는 뜻이다.
 *   난이도 프리셋의 `hpMul` 과는 **곱해진다** (game.js: `difficulty.hpMul * rules.hpMul`).
 *
 * ▶ **맵 값이 바뀌면 장 값을 되돌린다 (L-1).** 장의 실효 체력은 `맵.hpMul × 장.hpMul` 이라, 자유 맵 사다리를 고치며
 *   지하실(1.20 → 0.95)·다락방(0.72/420 → 0.60/480)을 움직이니 그 맵을 쓰는 일곱 장(10·11·12·17·18·23·24)이 조용히
 *   쉬워졌다 — `scenario-curve.test` 가 잡았다(9~16장 평균 79 → 88%). 그래서 그 일곱 장의 `hpMul` 을 되돌리고
 *   다락방 장에는 `startGoldMul: 0.875`(480 → 420)를 얹어 **실효값이 K 때와 같게** 했다.
 *   자유 맵의 값을 다시 바꾸면 이 일곱 줄도 다시 계산한다(각 줄 옆 주석에 식이 있다).
 *   (N 에서 11·12·18·24장의 `hpMul` 은 **일부러** K 값에서 벗어났다 — 그 줄 주석에 그렇게 적혀 있다.
 *   `startGoldMul` 쪽 보정은 그대로다.)
 *
 *   **M 에서 한 번 더 했다.** 창고(1.05/300 → 1.15/440)를 움직이며 그 맵을 쓰는 네 장(8·9·16·21장)에
 *   같은 보정을 얹었다 — `hpMul × 1.05/1.15` · `startGoldMul: 0.68`. 이제 보정된 장이 열하나다.
 *
 *   **Q 에서 세 번째로 했다 — 이번엔 `hpMul` 이 아니라 맵의 `blocked` 다.** 지붕의 2·6·10행을 막아
 *   지을 수 있는 칸을 79 → 55 로 줄이자(§5) 지붕을 쓰는 네 장 중 둘이 움직였다:
 *     · **7장 33% → 0%** — 지을 칸이 줄어 어려워졌다. `hpMul` 0.60 → **0.57**
 *     · **20장 22% → 100%** — 지을 칸이 줄었는데 **쉬워졌다.** 선택지를 뺐더니 봇이 더 잘 뒀다는 뜻이다
 *       (봇의 자리 고르기가 값을 흘린다 — 따로 잡을 일이다). `hpMul` 1.90 → **2.16**
 *   6장·15장은 한 칸도 안 움직였다. 구간 평균 **89 / 78 / 40%** (N 의 88/78/36 에서 두 장만큼 움직였다).
 *   **맵을 바꿀 때는 `hpMul` 만이 아니라 기하도 장에 샌다** — 그리고 방향이 장마다 반대일 수 있다.
 */

import { registerChapter } from './registry.js'

registerChapter({
  id: 'ch1', order: 1, title: '골목의 첫 밤',
  mapId: 'alley', waveSet: 'standard30', waveLimit: 6,
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 20 }, { kind: 'maxTowers', n: 3 }],
  intro: [
    { who: 'cheese', text: '여긴 내 골목이야.' },
    { who: 'mouse', text: '오늘부터 우리 거임.', side: 'right' },
    { who: 'cheese', text: '…해 보든가.' },
  ],
  outro: [{ who: 'cheese', text: '첫 밤은 지켰다. 여섯 번쯤 더 오겠지.' }],
  rewards: { catnip: 10 },
})

registerChapter({
  id: 'ch2', order: 2, title: '수상한 발소리',
  mapId: 'alley', waveSet: 'standard30', waveLimit: 10,
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'maxSpecials', n: 0 }],
  intro: [
    { who: 'calico', text: '숫자가 어제의 두 배야. 누가 세고 있어.' },
    { who: 'ratking', text: '왕이 왔다. 길을 비켜라.', side: 'right' },
  ],
  outro: [
    { who: 'cheese', text: '왕이라던 놈, 생각보다 물렀다.' },
    { who: 'siamese', text: '시끄러워서 나왔어. 나도 낄게.' },
  ],
  rewards: { catnip: 15, tower: 'siamese' },
})

registerChapter({
  id: 'ch3', order: 3, title: '부엌으로',
  mapId: 'kitchen', waveSet: 'kitchen30', waveLimit: 10,
  rules: { hpMul: 1.30 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 18 }, { kind: 'maxTowers', n: 5 }],
  intro: [
    { who: 'chonk', text: '부엌 냄새가 이상해.' },
    { who: 'rat', text: '냄새 따라 왔지. 너희도 그랬잖아.', side: 'right' },
  ],
  outro: [{ who: 'calico', text: '길이 길어졌어. 그만큼 놓칠 데도 많아졌고.' }],
  rewards: { catnip: 15 },
})

registerChapter({
  id: 'ch4', order: 4, title: '위를 봐',
  mapId: 'kitchen', waveSet: 'airborne12',
  rules: { hpMul: 1.30 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'withoutTowers', ids: ['calico'] }],
  intro: [
    { who: 'bat', text: '바닥만 보고 있었지?', side: 'right' },
    { who: 'calico', text: '내 헤어볼은 위로 안 날아가.' },
    { who: 'siamese', text: '내 눈은 날아가.' },
  ],
  outro: [
    { who: 'siamese', text: '천장까지 봐야 해. 이제 알겠지.' },
    { who: 'black', text: '…소란스럽군. 손을 빌려주지.' },
  ],
  rewards: { catnip: 20, tower: 'black' },
})

registerChapter({
  id: 'ch5', order: 5, title: '한 자루로',
  mapId: 'alley', waveSet: 'standard30', waveLimit: 15,
  rules: { hpMul: 1.30 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 15 }, { kind: 'onlyTowers', ids: ['black'] }],
  intro: [
    { who: 'black', text: '전부 물러나 있어.' },
    { who: 'cheese', text: '혼자 하겠다고?' },
    { who: 'black', text: '한 자루면 된다.' },
  ],
  outro: [{ who: 'black', text: '됐다. 다음.' }],
  rewards: { catnip: 20 },
})

registerChapter({
  id: 'ch6', order: 6, title: '지붕 위의 물량',
  mapId: 'rooftop', waveSet: 'rooftop30', waveLimit: 15,
  rules: { hpMul: 1.30 },
  primary: { kind: 'survive' },
  // 950초의 근거: 준비 시간을 한 번도 안 쓰고 자동 시뮬레이션을 돌리면 829초가 나온다.
  // 매번 준비를 다 쓰면 20 + 12×14 = 188초가 더 붙어 1020초라 못 넘긴다.
  // 즉 "준비 시간을 아끼고 밀어붙여라"가 이 별의 뜻이다. 사람이 해보고 조정할 값이다.
  bonus: [{ kind: 'noLeak' }, { kind: 'clearWithin', sec: 950 }],
  intro: [
    { who: 'roach', text: '한 마리씩 세지 마. 셀 수 없을 거야.', side: 'right' },
    { who: 'cheese', text: '한 번에 쓸어야겠는데.' },
  ],
  outro: [
    { who: 'chonk', text: '…시끄러워서 깼어. 한 번만 굴러줄게.' },
    { who: 'cheese', text: '그 한 번이 필요했어.' },
  ],
  rewards: { catnip: 25, tower: 'chonk' },
})

registerChapter({
  id: 'ch7', order: 7, title: '왕을 잡아라',
  mapId: 'rooftop', waveSet: 'bossrush10',
  // N — 규칙이 아예 없었고 `deck` 봇 완주율이 **0%** 였다. 1웨이브에 실점하고 중앙 5/10 에서 끝난다 —
  // `bossrush10` 이 1웨이브부터 보스를 던지는데 지붕 시작 골드가 260(전 맵 최저)이고 로스터가 다섯뿐이다.
  // **골드만으로는 절대 안 된다**(×1.5·2.0·3.0 전부 0%). 다만 골드가 도달은 바꾼다(첫 실점 1 → 5 · 중앙 5 → 10).
  // 그래서 온실·창고에서 쓴 방법대로 둘을 같이 움직인다. 쓸이(시드 7·23·11 × 3판):
  //   hp 0.7 → 0% · hp 0.7+골드 1.5+목숨 1.5 → 11% · **hp 0.6+골드 1.5 → 33%** · hp 0.5+골드 1.5 → 89% · hp 0.4 → 100%
  // 1막 절정이라 33% 를 골랐다 — 이 구간에서 가장 어렵고, 봇이 그래도 세 번에 한 번은 깬다.
  //
  // Q — 지붕 맵의 `blocked` 를 바꾸면서(2·6·10행) 0.60 이 33% → **0%** 가 됐다. 다시 쓸었다:
  //   0.60 → 0% · 0.59 → 11% · 0.58 → 0% · **0.57 → 44%** · 0.56 → 44% · 0.55 → 44% · 0.50 → 100%
  // 0.58~0.60 은 칼날 위라 값이 튄다. 0.55~0.57 세 칸이 전부 44% 인 평지라 그중 가장 덜 움직이는 0.57 을 골랐다.
  rules: { hpMul: 0.57, startGoldMul: 1.5 },
  primary: { kind: 'killBoss', enemyId: 'ratking' },
  bonus: [{ kind: 'maxSpecials', n: 0 }, { kind: 'livesAbove', n: 15 }],
  intro: [
    { who: 'ratking', text: '이번엔 혼자 오지 않았다.', side: 'right' },
    { who: 'black', text: '왕부터 벤다.' },
  ],
  outro: [{ who: 'calico', text: '왕관이 하나가 아니었어. 뒤에 더 있어.' }],
  rewards: { catnip: 25, tower: 'mackerel' },
})

registerChapter({
  id: 'ch8', order: 8, title: '상자 사이',
  mapId: 'warehouse', waveSet: 'warehouse30', waveLimit: 20,
  rules: { hpMul: 1.23, startGoldMul: 0.68 },   // 1.15 × 1.23 ≒ 1.05 × 1.35 · 440 × 0.68 ≒ 300
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'noSell' }],
  intro: [
    { who: 'cheese', text: '상자 때문에 설 자리가 없어.' },
    { who: 'siamese', text: '자리가 없으면 길목을 골라.' },
  ],
  outro: [{ who: 'chonk', text: '상자 안에도 뭔가 있었는데… 안 봤어.' }],
  rewards: { catnip: 30 },
})

registerChapter({
  id: 'ch9', order: 9, title: '셀 수 없는',
  mapId: 'warehouse', waveSet: 'swarm14',
  rules: { hpMul: 1.46, startGoldMul: 0.68 },   // 1.15 × 1.46 ≒ 1.05 × 1.60 · 440 × 0.68 ≒ 300
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 12 }, { kind: 'maxSpecials', n: 2 }],
  intro: [
    { who: 'roachqueen', text: '내 아이들이야. 전부.', side: 'right' },
    { who: 'chonk', text: '…전부?' },
  ],
  outro: [{ who: 'cheese', text: '손이 모자랄 땐 자리로 이긴다.' }],
  rewards: { catnip: 30, tower: 'bluerussian' },
})

registerChapter({
  id: 'ch10', order: 10, title: '다락으로 가는 길',
  mapId: 'attic', waveSet: 'nightmare20', waveLimit: 15,
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.92, startGoldMul: 0.875 },   // 0.60 × 1.92 = 0.72 × 1.60 · 480 × 0.875 = 420
  primary: { kind: 'survive' },
  // 500의 근거: 있는 돈을 다 쓰는 시뮬레이션은 261골드로 끝난다. 그 두 배쯤 남기려면
  // 타워를 덜 짓거나 덜 올려야 한다. 이것도 사람이 해보고 조정할 값이다.
  bonus: [{ kind: 'noLeak' }, { kind: 'goldLeft', n: 500 }],
  intro: [
    { who: 'calico', text: '다락에서 내려오는 거였어. 전부.' },
    { who: 'molelord', text: '올라올 생각은 하지 마라.', side: 'right' },
  ],
  outro: [{ who: 'cheese', text: '절반 왔다. 위가 진짜다.' }],
  rewards: { catnip: 40, tower: 'tuxedo' },
})

registerChapter({
  id: 'ch11', order: 11, title: '지하실의 숨',
  mapId: 'basement', waveSet: 'basement30', waveLimit: 20,
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  // N — 1.96 은 `deck` 봇 완주율 **11%** 로, 앞뒤(10장 89% · 13장 100%) 사이에 혼자 솟아 있었고
  // 아래 막 최종장 넷(22~33%)보다도 어려웠다. 쓸이: 1.96 → 11% · **1.90 → 67%** · 1.85 → 78% · 1.80 → 89%.
  // 1.90 과 1.96 사이가 또 절벽이라 그 사이에 쓸 값이 없다 — 봉우리를 없애는 쪽으로 1.90 을 골랐다.
  rules: { hpMul: 1.90 },                      // 0.95 × 1.90 = 1.805 (K 의 1.86 에서 살짝 내렸다)
  primary: { kind: 'survive' },
  bonus: [{ kind: 'livesAbove', n: 10 }, { kind: 'noUpgrade' }],
  intro: [
    { who: 'siamese', text: '길이 짧아. 놓치면 바로 뚫려.' },
    { who: 'black', text: '한 번도 놓치지 않으면 된다.' },
  ],
  outro: [{ who: 'calico', text: '지하와 다락이 이어져 있었어. 처음부터.' }],
  rewards: { catnip: 50, tower: 'sphynx' },
})

registerChapter({
  id: 'ch12', order: 12, title: '마왕 쥐',
  mapId: 'attic', waveSet: 'nightmare20',
  // N — **벽이 아니라 마지막 한 웨이브였다.** 봇이 19웨이브를 다 살아남고 20웨이브 마왕 쥐에서만 죽는다
  // (첫 실점 20 · 중앙 20/20 · 완주율 0%). 골드는 손잡이가 아니다(×1.4 에도 0%) — 장갑 14 를 못 뚫는 것이라
  // 체력만 통한다. 쓸이: 1.20 → 0% · 1.00 → 0% · **0.95 → 22%** · 0.90 → 56% · 0.85 → 67% · 0.80 → 89%.
  // 1막 최종장이라 22% 를 골랐다. `startGoldMul` 은 L-1 의 다락방 보정 그대로 둔다(골드 420).
  rules: { hpMul: 0.95, startGoldMul: 0.875 },   // 0.60 × 0.95 = 0.57 (K 의 0.72 에서 내렸다 — 의도한 것이다)
  primary: { kind: 'killBoss', enemyId: 'demonking' },
  bonus: [{ kind: 'noLeak' }, { kind: 'livesAbove', n: 10 }],
  intro: [
    { who: 'demonking', text: '고양이 다섯. 그게 전부인가.', side: 'right' },
    { who: 'cheese', text: '다섯이면 충분해.' },
    { who: 'chonk', text: '나 일어났어.' },
  ],
  outro: [
    { who: 'cheese', text: '집은 지켰다.' },
    { who: 'calico', text: '…당분간은.' },
  ],
  rewards: { catnip: 100 },
})

// ─────────────────────────────────────────────────────────────────────────────
// 2막 — 집은 지켰다. 그다음 밤들.
//
// 1막이 고양이를 한 마리씩 소개했다면 2막은 '알고 있는 것을 조합하라'다. 조합 만들기·
// 처치 수·빠른 클리어처럼 방법을 묻는 목표가 늘고, 2막 전용 웨이브셋 셋(rush20·airraid16·
// siege20)이 각각 속도·공중 장갑·지원 적을 묻는다. 보상은 캣닢과 새 펫(부엉이·너구리).
// act: 2 는 챕터 목록이 '2막' 제목을 끼워 넣는 데 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

registerChapter({
  id: 'ch13', order: 13, act: 2, title: '두 번째 밤',
  mapId: 'alley', waveSet: 'standard30', waveLimit: 20,
  rules: { hpMul: 1.60 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'makeCombo', comboId: 'cheese-trio' }, { kind: 'livesAbove', n: 15 }],
  intro: [
    { who: 'cheese', text: '골목이 조용하다. 너무 조용해.' },
    { who: 'rat', text: '조용한 게 아니야. 세고 있는 거지.', side: 'right' },
    { who: 'cheese', text: '셋이 한 줄로 서 봐. 예전에 그게 먹혔어.' },
  ],
  outro: [{ who: 'cheese', text: '한 줄. 그게 시작이었지.' }],
  rewards: { catnip: 30 },
})

registerChapter({
  id: 'ch14', order: 14, act: 2, title: '질주',
  mapId: 'kitchen', waveSet: 'rush20',
  rules: { hpMul: 1.65 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'noLeak' }, { kind: 'maxSpecials', n: 1 }],
  intro: [
    { who: 'fireant', text: '멈추면 잡히니까 안 멈춰.', side: 'right' },
    { who: 'siamese', text: '빠른 건 얼리면 돼.' },
    { who: 'fireant', text: '불개미한테 그 말을 해 보시지.', side: 'right' },
  ],
  outro: [
    { who: 'calico', text: '얼리는 대신 쓸었어.' },
    { who: 'cheese', text: '…지붕 위에서 누가 보고 있어. 눈이 크다.' },
  ],
  rewards: { catnip: 30, pet: 'owl' },
})

registerChapter({
  id: 'ch15', order: 15, act: 2, title: '하늘의 장갑',
  mapId: 'rooftop', waveSet: 'airraid16',
  rules: { hpMul: 1.30 },
  primary: { kind: 'survive' },
  bonus: [{ kind: 'withoutTowers', ids: ['calico'] }, { kind: 'killAtLeast', n: 200 }],
  intro: [
    { who: 'pigeon', text: '박쥐가 못 한 걸 우리가 한다. 두껍게.', side: 'right' },
    { who: 'bluerussian', text: '두꺼우면 튀면 되지.' },
    { who: 'sphynx', text: '줄 서 있으면 꿰고.' },
  ],
  outro: [{ who: 'black', text: '하늘도 길이 있다. 그 길을 봤다.' }],
  rewards: { catnip: 35 },
})

registerChapter({
  id: 'ch16', order: 16, act: 2, title: '고치는 것들',
  mapId: 'warehouse', waveSet: 'siege20',
  rules: { hpMul: 1.46, startGoldMul: 0.68 },   // 1.15 × 1.46 ≒ 1.05 × 1.60 · 440 × 0.68 ≒ 300
  primary: { kind: 'killBoss', enemyId: 'molelord' },
  bonus: [{ kind: 'noSell' }, { kind: 'makeCombo', comboId: 'monochrome' }],
  intro: [
    { who: 'earwig', text: '다친 애들은 내가 고쳐. 계속.', side: 'right' },
    { who: 'tuxedo', text: '그럼 너부터.' },
    { who: 'black', text: '표적을 바꿔라. 앞줄이 아니라 뒷줄.' },
  ],
  outro: [{ who: 'tuxedo', text: '고치는 놈이 없으니 다들 금방 무너지더군.' }],
  rewards: { catnip: 35 },
})

registerChapter({
  id: 'ch17', order: 17, act: 2, title: '짧은 길',
  mapId: 'basement', waveSet: 'basement30', waveLimit: 25,
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.83 },                      // 0.95 × 1.83 = 1.74 = 1.20 × 1.45
  primary: { kind: 'survive' },
  bonus: [{ kind: 'goldLeft', n: 300 }, { kind: 'livesAbove', n: 8 }],
  intro: [
    { who: 'mole', text: '길이 짧지. 놓치면 바로 집이다.', side: 'right' },
    { who: 'mackerel', text: '짧으면 오래 아프게 하면 돼.' },
  ],
  outro: [
    { who: 'chonk', text: '…쓰레기통 뒤에서 누가 나왔어. 줄무늬 꼬리.' },
    { who: 'cheese', text: '데려가자. 쓸모가 있어 보여.' },
  ],
  rewards: { catnip: 40, pet: 'raccoon' },
})

registerChapter({
  id: 'ch18', order: 18, act: 2, title: '왕들의 밤',
  mapId: 'attic', waveSet: 'nightmare20',
  // N — 12장과 같은 모양(19웨이브를 살아남고 20웨이브에서만 죽는다). 같은 값을 준다.
  // **`bossCountMul` 로 12장과 가르려다 못 했다**: 마왕 쥐가 목숨을 12 가져가는데 다락방 목숨이 15 라
  // 한 마리만 더 나와도 즉사다 — 1.3·1.6 전부 0% 였다. 12장과 맵·웨이브셋·로스터가 같아서
  // 봇 눈에는 두 장이 같은 난이도다. 사람에게 다른 것은 목표(별)와 이야기다.
  rules: { hpMul: 0.95, startGoldMul: 0.875 },   // 0.60 × 0.95 = 0.57 · 골드 420
  primary: { kind: 'killBoss', enemyId: 'demonking' },
  bonus: [{ kind: 'noLeak' }, { kind: 'clearWithin', sec: 1500 }],
  intro: [
    { who: 'demonking', text: '아홉이라. 지난번엔 다섯이었지.', side: 'right' },
    { who: 'cheese', text: '세는 건 우리가 한다.' },
    { who: 'sphynx', text: '왕이 몇이든 줄만 서라.' },
  ],
  outro: [
    { who: 'cheese', text: '두 번째 밤도 지켰다.' },
    { who: 'calico', text: '세 번째가 있겠지. 그때도 우리가 있고.' },
  ],
  rewards: { catnip: 120 },
})
