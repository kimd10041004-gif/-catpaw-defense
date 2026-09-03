/**
 * 콘텐츠 로딩 진입점.
 * import 순서가 곧 등록 순서다 — 스프라이트와 효과가 먼저 등록돼야
 * validateAll()이 타워/적의 참조를 확인할 수 있다.
 *
 * ▶ 새 콘텐츠 파일을 만들었다면 여기에 import 한 줄을 추가한다.
 */

import '../sprites.js'   // 스프라이트 (cat, rodent, roach, bat, mole)
import '../framesets.js'  // 프레임 아트 스트립 (art/cat-*.png) — 없으면 스프라이트로 폴백
import './effects.js'          // 타워 능력 (splash, slow, aura)
import './enemyAbilities.js'   // 보스 능력 (regen, shield, summon, enrage, split, warcry)
import './specials.js'         // 플레이어 필살기
import './enemies.js'
import './towers.js'
import './waveSets.js'
import './maps.js'

export { validateAll } from './registry.js'
