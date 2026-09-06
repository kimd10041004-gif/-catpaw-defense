/**
 * 도전 팩 2 — 다섯 종. **유료 콘텐츠다** (shop.js 의 `challenge_pack2`).
 *
 * 왜 파일이 따로인가: 데모 웹 빌드가 이 파일을 빼고 굽는다 — `content/scenario-act3.js` 와 같은 이유.
 *
 * pack 이 있는 도전은 progress.unlocks.packs 에 그 id 가 있어야 시작할 수 있다. 팩 1(challenges.js)은 무료다.
 */
import { registerChallenge } from './registry.js'

registerChallenge({
  id: 'no-sell', order: 8, name: '판매 금지', badge: '⊘', pack: 'challenges2',
  desc: '한 번 놓은 고양이는 못 판다. 자리를 잘못 잡으면 그대로 간다.',
  rules: { noSell: true },
  reward: 20,
})

registerChallenge({
  id: 'sprint', order: 9, name: '질주', badge: '»', pack: 'challenges2',
  desc: '해충이 1.3배 빨리 달린다. 둔화가 값을 한다.',
  rules: { speedMul: 1.3 },
  reward: 25,
})

registerChallenge({
  id: 'iron', order: 10, name: '철갑', badge: '▣', pack: 'challenges2',
  desc: '모든 해충 방어 +2. 속사가 힘을 잃고 저격이 산다.',
  rules: { armorAdd: 2 },
  reward: 25,
})

registerChallenge({
  id: 'drought', order: 11, name: '마나 가뭄', badge: '☽', pack: 'challenges2',
  desc: '밀크 마나가 절반만 찬다. 필살기를 아껴야 한다.',
  rules: { manaMul: 0.5 },
  reward: 20,
})

registerChallenge({
  id: 'one-life', order: 12, name: '외줄', badge: '1', pack: 'challenges2',
  desc: '목숨 하나. 한 마리라도 새면 끝.',
  rules: { livesMul: 0.05 },
  reward: 30,
})
