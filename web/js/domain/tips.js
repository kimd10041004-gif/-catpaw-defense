/**
 * 로딩 팁 — 레지스트리와 도메인 상수에서 조립한다. DOM 을 모른다.
 *
 * 왜 하드코딩하지 않나: "6웨이브부터 엘리트" 를 글자로 박아 두면 ELITE_FROM_WAVE 를
 * 바꾸는 순간 팁이 거짓말이 된다. 상수를 보간하면 수치와 문장이 같이 움직인다.
 * 캐릭터 팁은 desc 를 그대로 쓰므로 고양이를 추가하면 팁도 는다.
 *
 * 이 게임에는 튜토리얼이 없고, 설명이라곤 터치에서 안 뜨는 title= 툴팁뿐이었다.
 * 로딩 화면이 실제로 보이는 첫 번째 설명 자리다.
 */
import { listTowers, listEnemies, listSpecials, listPets, listCombos } from '../content/registry.js'
import { MANA_START, MANA_PER_KILL, MANA_PER_BOSS, MANA_PER_WAVE_CLEAR } from './mana.js'
import { ELITE_FROM_WAVE, ELITE_HP_MUL, ELITE_ARMOR_ADD, ELITE_GOLD_MUL } from './elite.js'
import { MIN_DAMAGE } from './balance.js'
import { TARGET_MODE_LABELS } from './targeting.js'
import { DEFAULT_REFUND_RATE } from './economy.js'
import { MAP_UNLOCK_WAVE } from './save.js'

/**
 * 규칙 팁. 상수를 보간한다.
 *
 * @param {{crystalLife?:number}} [o] game.js 의 CRYSTAL_LIFE_SEC — 여기서 직접
 *   import 하면 tips → game → … 순환이 생길 수 있어 값으로 받는다
 */
export function ruleTips(o = {}) {
  const crystalLife = o.crystalLife ?? 11
  const modes = Object.values(TARGET_MODE_LABELS).join(' · ')
  return [
    `자유 모드의 다음 맵은 앞 맵을 ${MAP_UNLOCK_WAVE}웨이브까지 버티거나 깨면 열립니다. 시나리오에서 그 맵의 장을 깨도 열립니다.`,
    `밀크 마나는 처치마다 ${MANA_PER_KILL}, 보스는 ${MANA_PER_BOSS}, 웨이브를 깨면 ${MANA_PER_WAVE_CLEAR} 찹니다. 시작은 ${MANA_START}.`,
    `지도에 떨어진 밀크 크리스탈은 ${crystalLife}초 뒤 사라집니다. 탭해서 주우세요.`,
    `${ELITE_FROM_WAVE}웨이브부터 왕관 쓴 적이 섞입니다 — 체력 ${ELITE_HP_MUL}배, 장갑 +${ELITE_ARMOR_ADD}, 골드 ${ELITE_GOLD_MUL}배.`,
    `장갑은 공격력을 그만큼 깎습니다. 그래도 최소 ${MIN_DAMAGE}은 들어갑니다 — 두꺼운 적엔 한 방이 큰 고양이를.`,
    `타워 패널의 '표적'을 누르면 ${modes} 중에 고릅니다.`,
    `고양이를 팔면 투자한 금액의 ${Math.round(DEFAULT_REFUND_RATE * 100)}%를 돌려받습니다.`,
    '옆에 선 고양이의 버프·조합·황금 발바닥은 타워 패널 숫자에 민트색으로 나타납니다.',
    '필살기를 이어 쓰면 연계가 걸려 피해가 커집니다. 버튼이 빛나면 지금이 그때입니다.',
    '보스는 체력만 많은 게 아닙니다 — 보호막·재생·소환·광폭화·전투함성이 붙어 있습니다.',
    "판을 나가도 최고 웨이브는 남습니다. 일시정지 메뉴의 '나가기'로 나가세요.",
  ]
}

/** 캐릭터 팁 — desc 를 그대로. 콘텐츠를 추가하면 팁도 는다. */
export function contentTips() {
  const line = (prefix, name, desc) => (name && desc ? `${prefix}${name}: ${desc}` : null)
  return [
    ...listTowers().map((t) => line('', t.name, t.desc)),
    ...listEnemies().map((e) => line('', e.name, e.desc)),
    ...listSpecials().map((s) => line('필살기 ', s.name, s.desc)),
    ...listPets().map((p) => line('펫 ', p.name, p.desc)),
    ...listCombos().map((c) => line('조합 ', c.name, c.desc)),
  ].filter(Boolean)
}

/**
 * 전부 섞어서 돌려준다.
 * @param {() => number} [random] 검사에서 재현 가능하게 주입한다
 */
export function buildTips(random = Math.random, o = {}) {
  const all = [...ruleTips(o), ...contentTips()]
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all
}
