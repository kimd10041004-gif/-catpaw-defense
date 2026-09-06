/**
 * 스킨 (유료분) — IAP 팩 스킨 일곱 + 3막 24장 보상 하나. **유료 콘텐츠다.**
 *
 * 왜 파일이 따로인가: 데모 웹 빌드가 이 파일을 빼고 굽는다 — `content/scenario-act3.js` 와 같은 이유.
 * 자정의 검은냥은 값이 없지만 3막 24장 보상이라 3막이 없는 데모에서는 영영 못 받는다. 그래서 같이 나간다.
 *
 * 능력치는 여기도 없다 — registry 가 mods 를 거부한다. 겉모습뿐이다.
 */
import { registerSkin } from './registry.js'

registerSkin({ id: 'cheese-golden', towerId: 'cheese', order: 1, name: '황금 치즈냥', desc: '털이 금빛으로 반짝인다. 스타터 팩.',
  look: { filter: 'sepia(0.6) saturate(1.7) brightness(1.08)' }, sku: 'starter_pack' })

registerSkin({ id: 'calico-blossom', towerId: 'calico', order: 3, name: '벚꽃 삼색냥', desc: '봄 색으로 물든 삼색냥. 스킨 팩 1.',
  look: { filter: 'hue-rotate(300deg) saturate(1.25)' }, sku: 'skin_pack_1' })

registerSkin({ id: 'siamese-snow', towerId: 'siamese', order: 5, name: '설원 샴냥', desc: '눈밭에서 온 새하얀 샴냥. 스킨 팩 1.',
  look: { filter: 'brightness(1.12) saturate(0.55) contrast(1.05)' }, sku: 'skin_pack_1' })

registerSkin({ id: 'chonk-mint', towerId: 'chonk', order: 6, name: '민트 뚱냥', desc: '민트 초코색 뚱냥. 스킨 팩 1.',
  look: { filter: 'hue-rotate(120deg) saturate(1.1)' }, sku: 'skin_pack_1' })

registerSkin({ id: 'black-midnight', towerId: 'black', order: 7, name: '자정의 검은냥', desc: '자정 하늘색 윤기. 시나리오 24장을 깨면.',
  look: { filter: 'hue-rotate(200deg) saturate(1.5) brightness(0.95)' } })

registerSkin({ id: 'mackerel-sunset', towerId: 'mackerel', order: 8, name: '노을 고등어냥', desc: '노을빛 줄무늬. 스킨 팩 2.',
  look: { filter: 'sepia(0.35) hue-rotate(-20deg) saturate(1.5)' }, sku: 'skin_pack_2' })

registerSkin({ id: 'bluerussian-violet', towerId: 'bluerussian', order: 9, name: '보랏빛 러시안블루냥', desc: '정전기가 보랏빛으로 튄다. 스킨 팩 2.',
  look: { filter: 'hue-rotate(60deg) saturate(1.35)' }, sku: 'skin_pack_2' })

registerSkin({ id: 'tuxedo-rust', towerId: 'tuxedo', order: 10, name: '적갈 턱시도냥', desc: '적갈색 정장을 입은 턱시도냥. 스킨 팩 2.',
  look: { filter: 'sepia(0.5) hue-rotate(-15deg) saturate(1.3)' }, sku: 'skin_pack_2' })
