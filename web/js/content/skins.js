/**
 * 스킨 — 고양이 겉모습. 능력치는 없다 (registry 가 mods 를 거부한다).
 *
 * v1 은 전부 색 필터다: framesets.js 가 프레임 스트립을 CSS 필터로 한 번 구워 캐시한다 — 새 그림 없이 판다.
 * 그림 스킨(look.frames)은 발주서(docs/발주서-스킨.md)대로 그림이 오면 registerFrameSet 한 줄 + look 한 줄이다.
 *
 * 파는 길 (약속: 캣닢으로도 사는 스킨이 3개 이상 — content.test):
 *   price  캣닢 (잉걸 치즈냥 · 먹 삼색냥 · 흑요석 스핑크스냥)
 *   sku    IAP 팩 (shop.js: starter_pack · skin_pack_1 · skin_pack_2)
 *   없음   보상 전용 (자정의 검은냥 — 시나리오 24장)
 */
import { registerSkin } from './registry.js'

registerSkin({ id: 'cheese-golden', towerId: 'cheese', order: 1, name: '황금 치즈냥', desc: '털이 금빛으로 반짝인다. 스타터 팩.',
  look: { filter: 'sepia(0.6) saturate(1.7) brightness(1.08)' }, sku: 'starter_pack' })
registerSkin({ id: 'cheese-ember', towerId: 'cheese', order: 2, name: '잉걸 치즈냥', desc: '불씨 색으로 달아오른 치즈냥.',
  look: { filter: 'hue-rotate(-18deg) saturate(1.6) contrast(1.05)' }, price: 120 })
registerSkin({ id: 'calico-blossom', towerId: 'calico', order: 3, name: '벚꽃 삼색냥', desc: '봄 색으로 물든 삼색냥. 스킨 팩 1.',
  look: { filter: 'hue-rotate(300deg) saturate(1.25)' }, sku: 'skin_pack_1' })
registerSkin({ id: 'calico-ink', towerId: 'calico', order: 4, name: '먹 삼색냥', desc: '수묵으로 그린 듯한 삼색냥.',
  look: { filter: 'grayscale(0.85) contrast(1.15)' }, price: 120 })
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
registerSkin({ id: 'sphynx-obsidian', towerId: 'sphynx', order: 11, name: '흑요석 스핑크스냥', desc: '검은 유리처럼 매끈한 스핑크스냥.',
  look: { filter: 'brightness(0.7) contrast(1.3) saturate(0.7)' }, price: 120 })
