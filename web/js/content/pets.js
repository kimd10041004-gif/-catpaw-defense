/**
 * 펫 — 판 밖에서 고르는 한 번의 선택.
 *
 * 고양이는 판 안에서 고르고, 펫은 판 시작 전에 고른다. **한 번에 하나만 장착한다.**
 * 다 끼울 수 있으면 고르는 의미가 없고, 곧 '최적 조합' 하나가 정해져 나머지가 죽는다.
 *
 * ▶ 새 펫을 추가하려면: 아래 블록을 복사하면 된다. 선택 화면은 레지스트리를
 *   순회하므로 UI 코드는 손대지 않는다.
 *
 * 세 가지 방식이 있다:
 *   mods        판 전체에 걸리는 배수 (goldMul · manaMul) — domain/mods.js 가 합친다
 *   startGold   판 시작 골드/목숨에 더한다
 *   startLives
 *   hook        코드가 따로 처리해야 하는 것. 지금은 'autoCollect' 하나뿐이다.
 *               훅을 문자열로 제한한 이유: 펫마다 임의의 함수를 실행하게 하면
 *               곧 "펫이 뭐든 할 수 있는" 두 번째 필살기 시스템이 된다.
 */

import { registerPet } from './registry.js'

registerPet({
  id: 'hamster',
  name: '햄스터',
  desc: '볼주머니에서 동전을 꺼낸다. 시작 골드가 80 늘어난다.',
  // 첫 펫은 공짜로 준다 — 시스템이 있다는 걸 알려야 고를 마음이 생긴다.
  price: 0,
  startGold: 80,
})

registerPet({
  id: 'turtle',
  name: '거북이',
  desc: '느리지만 단단하다. 시작 목숨이 3 늘어난다.',
  price: 80,
  startLives: 3,
})

registerPet({
  id: 'magpie',
  name: '까치',
  desc: '반짝이는 걸 물어 온다. 처치 골드가 12% 늘어난다.',
  price: 120,
  mods: { goldMul: 1.12 },
})

registerPet({
  id: 'firefly',
  name: '반딧불이',
  desc: '밤에 빛을 모은다. 밀크 마나가 20% 더 찬다.',
  price: 150,
  mods: { manaMul: 1.2 },
})

registerPet({
  id: 'sparrow',
  name: '참새',
  // 편의 기능이기도 하다 — 전투가 바쁠 때 크리스탈을 손으로 집는 게 번거롭다.
  desc: '떨어진 밀크 크리스탈을 혼자 주워 온다.',
  price: 200,
  hook: 'autoCollect',
})
