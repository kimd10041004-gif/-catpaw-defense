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
