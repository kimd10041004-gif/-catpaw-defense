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
 *   결과 (`deck` 봇 · 보통 · 시드 7/23/11 × 3판 · 그때의 로스터 · 벽 셋 제외):
 *     3~8장 93% · 9~16장 79% · 17~24장 41%   (전부 100% 였다)
 *   벽을 넣은 구간 평균(scenario-curve.test 가 보는 값)은 83% / 69% / 36% 다.
 *
 *   안 건드린 것: **1·2장**(첫 두 판은 막히면 안 된다)과 **벽 셋 7·12·18장**.
 *   그 셋은 지금도 봇 0% 인데 **봇의 한계일 수 있다** — 12장 마왕 쥐는 장갑 14 라 이 봇이
 *   원래 못 잡는다. 사람이 깨는지 확인하기 전엔 안 낮춘다.
 *
 *   `goldMul` 은 손잡이가 **아니다**: ×0.5 로 깎아도 열 장 중 아홉이 완주율 100% 였다.
 *   봇은 돈을 다 안 쓴다. 시나리오에서 골드는 빡빡한 자원이 아니라는 뜻이다.
 *   난이도 프리셋의 `hpMul` 과는 **곱해진다** (game.js: `difficulty.hpMul * rules.hpMul`).
 *
 * ▶ **맵 값이 바뀌면 장 값을 되돌린다 (L-1).** 장의 실효 체력은 `맵.hpMul × 장.hpMul` 이라, 자유 맵 사다리를 고치며
 *   지하실(1.20 → 0.95)·다락방(0.72/420 → 0.60/480)을 움직이니 그 맵을 쓰는 일곱 장(10·11·12·17·18·23·24)이 조용히
 *   쉬워졌다 — `scenario-curve.test` 가 잡았다(9~16장 평균 79 → 88%). 그래서 그 일곱 장의 `hpMul` 을 되돌리고
 *   다락방 장에는 `startGoldMul: 0.875`(480 → 420)를 얹어 **실효값이 K 때와 같게** 했다. 벽 셋(7·12·18장)도 그대로다 —
 *   사람이 해 본 뒤에 정한다. 자유 맵의 값을 다시 바꾸면 이 일곱 줄도 다시 계산한다(각 줄 옆 주석에 식이 있다).
 *
 *   **M 에서 한 번 더 했다.** 창고(1.05/300 → 1.15/440)를 움직이며 그 맵을 쓰는 네 장(8·9·16·21장)에
 *   같은 보정을 얹었다 — `hpMul × 1.05/1.15` · `startGoldMul: 0.68`. 이제 보정된 장이 열하나다.
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
  rules: { hpMul: 1.96 },                      // 0.95 × 1.96 = 1.86 = 1.20 × 1.55
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
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.20, startGoldMul: 0.875 },   // 벽은 그대로다 — 0.60 × 1.20 = 0.72 · 골드 420. 장 자체는 K 와 같다
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
  // L-1 에서 맵 hpMul 이 바뀌어(다락방 0.72/420 → 0.60/480 · 지하실 1.20 → 0.95) 장 값을 되돌렸다 — 실효 체력(맵 × 장)과 시작 골드가 K 때와 같다
  rules: { hpMul: 1.20, startGoldMul: 0.875 },   // 벽은 그대로다 — 0.60 × 1.20 = 0.72 · 골드 420
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
