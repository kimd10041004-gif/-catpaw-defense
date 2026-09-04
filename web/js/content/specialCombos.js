/**
 * 필살기 연계 — 정해진 순서로 이어 쓰면 이름이 붙는다.
 *
 * 필살기 넷이 지금까지 서로를 몰랐다. 순서와 시간을 보게 만드는 것이 목적이다.
 *
 * ▶ 새 연계를 추가하려면: 아래 블록 하나를 복사하면 된다.
 *   **specials.js 는 손대지 않는다.** 보너스가 damageMul / manaRefund 두 가지뿐이라
 *   game.js 의 한 자리(_specialCtx 의 applyDamage 래퍼)에서 전부 걸리기 때문이다.
 *   반경·지속시간 보너스를 넣고 싶어지면 그때는 필살기마다 손봐야 한다 —
 *   그래서 일부러 안 받는다.
 */

import { registerSpecialCombo } from './registry.js'

registerSpecialCombo({
  id: 'frozen-feast',
  name: '얼린 만찬',
  desc: '잠든 적 위에 츄르가 떨어지면 두 배로 아프다.',
  from: 'nap', to: 'churu', window: 4,
  bonus: { damageMul: 2 },
})

registerSpecialCombo({
  id: 'thunder-flood',
  name: '번개 폭풍',
  desc: '츄르가 터진 자리에 우유가 쏟아진다.',
  from: 'churu', to: 'milk', window: 4,
  bonus: { damageMul: 1.8 },
})

registerSpecialCombo({
  id: 'golden-rain',
  name: '황금 비',
  desc: '젖은 발바닥이 금을 더 잘 문다. 쓴 마나를 일부 돌려받는다.',
  from: 'milk', to: 'goldenpaw', window: 5,
  bonus: { manaRefund: 30 },
})
