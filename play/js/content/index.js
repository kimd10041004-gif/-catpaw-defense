/**
 * 콘텐츠 로딩 진입점.
 * import 순서가 곧 등록 순서다 — 스프라이트와 효과가 먼저 등록돼야
 * validateAll()이 타워/적의 참조를 확인할 수 있다.
 *
 * ▶ 새 콘텐츠 파일을 만들었다면 여기에 import 한 줄을 추가한다.
 *
 * `// demo:strip` 이 붙은 줄은 **유료 콘텐츠**다. `tools/demo-build.mjs` 가 데모 웹 빌드를 구울 때
 * 그 줄과 그 파일을 통째로 뺀다 — 데모에는 유료 콘텐츠가 잠긴 채로도 들어 있지 않다.
 * 새 유료 콘텐츠는 따로 파일을 만들고 여기에 표시를 붙인다(무료 파일에 섞지 않는다).
 */

import '../sprites.js'   // 스프라이트 (cat, rodent, roach, bat, mole)
import '../framesets.js'  // 프레임 아트 스트립 (art/cat-*.png) — 없으면 스프라이트로 폴백
import '../mapart.js'     // 지도 길 질감·소품 (art/path-*, art/prop-*) — 없으면 단색
import './effects.js'          // 타워 능력 (splash, slow, aura)
import './enemyAbilities.js'   // 보스 능력 (regen, shield, summon, enrage, split, warcry)
import './specials.js'         // 플레이어 필살기
import './combos.js'           // 고양이 조합 (배치 퍼즐)
import './pets.js'             // 펫 (판 시작 전 한 마리)
import './specialCombos.js'    // 필살기 연계 (순서와 시간)
import './achievements.js'     // 업적 (도감 탭 + 캣닢 보상)
import './challenges.js'       // 도전 (자유 모드 맵에 규칙 하나)
import './enemies.js'
import './towers.js'
import './towers-cards.js'   // 뽑기로만 얻는 고양이 6종 — 무료(티켓)
import './skins.js'            // 고양이 스킨 — 캣닢으로 사는 3종
import './waveSets.js'
import './maps.js'
import './objectives.js'   // 시나리오 목표 종류 (survive, noLeak, maxTowers ...)
import './scenario.js'     // 시나리오 1~2막(18장) — 맵·웨이브셋·목표를 다 참조하므로 마지막
import './expeditions.js'  // 속성 원정 — 무료(맵·웨이브셋을 참조하므로 뒤)

export { validateAll } from './registry.js'
