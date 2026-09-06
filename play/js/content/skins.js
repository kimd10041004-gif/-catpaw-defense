/**
 * 스킨 (무료분) — 고양이 겉모습. 능력치는 없다 (registry 가 mods 를 거부한다).
 *
 * 캣닢으로 사는 세 종만 여기 있다. **팩·보상 스킨은 `skins-paid.js`** 로 나가 있다 —
 * 데모 웹 빌드가 그 파일을 빼고 굽기 때문이다(`content/scenario-act3.js` 머리말 참고).
 *
 * v1 은 전부 색 필터다: framesets.js 가 프레임 스트립을 CSS 필터로 한 번 구워 캐시한다 — 새 그림 없이 판다.
 * 그림 스킨(look.frames)은 발주서(docs/발주서-스킨.md)대로 그림이 오면 registerFrameSet 한 줄 + look 한 줄이다.
 *
 * 파는 길 (약속: 캣닢으로도 사는 스킨이 3개 이상 — content.test):
 *   price  캣닢 — 잉걸 치즈냥 · 먹 삼색냥 · 흑요석 스핑크스냥 (이 파일)
 *   sku    IAP 팩 — starter_pack · skin_pack_1 · skin_pack_2 (skins-paid.js)
 *   없음   보상 전용 — 자정의 검은냥, 시나리오 24장 (skins-paid.js: 3막 보상이라 데모에 없다)
 */
import { registerSkin } from './registry.js'

registerSkin({ id: 'cheese-ember', towerId: 'cheese', order: 2, name: '잉걸 치즈냥', desc: '불씨 색으로 달아오른 치즈냥.',
  look: { filter: 'hue-rotate(-18deg) saturate(1.6) contrast(1.05)' }, price: 120 })

registerSkin({ id: 'calico-ink', towerId: 'calico', order: 4, name: '먹 삼색냥', desc: '수묵으로 그린 듯한 삼색냥.',
  look: { filter: 'grayscale(0.85) contrast(1.15)' }, price: 120 })

registerSkin({ id: 'sphynx-obsidian', towerId: 'sphynx', order: 11, name: '흑요석 스핑크스냥', desc: '검은 유리처럼 매끈한 스핑크스냥.',
  look: { filter: 'brightness(0.7) contrast(1.3) saturate(0.7)' }, price: 120 })
