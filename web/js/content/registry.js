/**
 * 콘텐츠 레지스트리 — 이 게임의 모든 콘텐츠(고양이/적/맵/웨이브/능력/스프라이트)가 모이는 곳.
 *
 * 왜 이렇게 하나:
 *   새 고양이 한 마리를 추가할 때 game.js / render.js / ui.js를 전혀 건드리지 않게 하려고.
 *   towers.js에 데이터 블록 하나만 넣으면 상점·도감·업그레이드 UI가 자동으로 따라온다.
 *
 * validateAll()이 부팅 때 한 번 돌면서 오타·누락·잘못된 참조를 전부 잡아낸다.
 * 그래서 잘못 추가한 콘텐츠는 "조용히 깨지는" 대신 즉시 한국어 에러로 드러난다.
 */

import { buildPath, PathError } from '../domain/path.js'
import { isElement, ELEMENTS } from '../domain/elements.js'

export class ContentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ContentError'
  }
}

const towers = new Map()
const enemies = new Map()
const maps = new Map()
const waveSets = new Map()
const effects = new Map()
const sprites = new Map()
const enemyAbilities = new Map()
const specials = new Map()
const poses = new Map()
const frameSets = new Map()
const objectives = new Map()
const chapters = new Map()
const mapArt = new Map()
const props = new Map()
const combos = new Map()
const pets = new Map()
const specialCombos = new Map()
const achievements = new Map()
const challenges = new Map()
const skins = new Map()
const expeditions = new Map()

/** 테스트에서 레지스트리를 격리하기 위한 초기화 */
export function resetRegistry() {
  towers.clear(); enemies.clear(); maps.clear()
  waveSets.clear(); effects.clear(); sprites.clear()
  enemyAbilities.clear(); specials.clear(); poses.clear()
  frameSets.clear(); objectives.clear(); chapters.clear()
  mapArt.clear(); props.clear(); combos.clear(); pets.clear(); specialCombos.clear(); achievements.clear(); challenges.clear()
  skins.clear(); expeditions.clear()
}

// ---------------------------------------------------------------- 등록 시 형식 검사

function requireString(obj, field, where) {
  const v = obj[field]
  if (typeof v !== 'string' || v.length === 0) {
    throw new ContentError(`${where}: '${field}'은(는) 비어 있지 않은 문자열이어야 합니다 (받은 값: ${JSON.stringify(v)})`)
  }
}

function requireNumber(obj, field, where, { min = -Infinity, max = Infinity } = {}) {
  const v = obj[field]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ContentError(`${where}: '${field}'은(는) ${min}~${max} 범위의 숫자여야 합니다 (받은 값: ${JSON.stringify(v)})`)
  }
}

function requireUnique(map, id, kind) {
  if (map.has(id)) throw new ContentError(`${kind} '${id}'이(가) 이미 등록되어 있습니다 (id 중복)`)
}

const VALID_TARGETS = ['all', 'ground', 'air']

/**
 * 속성 검증 — 타워와 적이 같이 쓴다. 속성은 **없어도 된다**(null): 상성이 꺼진 판이 기본이고,
 * 속성 없는 콘텐츠가 섞여도 elementMul 이 1.0 을 준다. 다만 **오타는 잡는다** —
 * 'fier' 라고 적으면 조용히 무속성이 돼 상성이 영영 안 걸린다.
 */
function checkElement(def, where) {
  if (def.element === undefined || def.element === null) return
  if (!isElement(def.element)) {
    throw new ContentError(`${where}: 'element'는 ${ELEMENTS.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(def.element)})`)
  }
}

/** 뽑기에서 나올 수 있는 등급. `gacha.js` 의 GACHA_TABLE 이 쓰는 이름과 같아야 한다. */
export const CARD_RARITIES = ['legend', 'epic']

/**
 * 뽑기 등급 — **없으면 뽑기에 안 나온다**(기존 고양이 9마리가 그렇다).
 * 시나리오 보상으로 무료로 얻는 고양이가 뽑기 풀에 섞이면 "이미 가진 것이 또 나온다"가 되고,
 * 무엇보다 무료로 주기로 한 것을 파는 셈이 된다. 그래서 카드 전용 고양이만 등급을 갖는다.
 */
/**
 * 맵이 어느 목록에 뜨나. 'free' = 자유 모드 사다리(기본), 'expedition' = 원정 칸 전용.
 * 원정 맵은 `listMaps()` 에서 빠지므로 해금 사슬·주간 로테이션·업적 수를 안 건드린다.
 */
export const MAP_MODES = ['free', 'expedition']

function checkRarity(def, where) {
  if (def.rarity === undefined || def.rarity === null) return
  if (!CARD_RARITIES.includes(def.rarity)) {
    throw new ContentError(`${where}: 'rarity'는 ${CARD_RARITIES.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(def.rarity)})`)
  }
}

/**
 * 고양이 타워를 등록한다.
 * levels[0].cost = 건설비, levels[n>0].cost = 그 레벨로 올리는 업그레이드비.
 * range 단위 = 타일, fireRate 단위 = 발/초.
 */
export function registerTower(def) {
  const where = `타워 '${def && def.id}'`
  if (!def || typeof def !== 'object') throw new ContentError('타워 정의는 객체여야 합니다')
  requireString(def, 'id', where)
  requireUnique(towers, def.id, '타워')
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireString(def, 'sprite', where)
  requireNumber(def, 'order', where, { min: 0 })
  if (def.pose !== undefined && (typeof def.pose !== 'string' || def.pose.length === 0)) {
    throw new ContentError(`${where}: 'pose'는 비어 있지 않은 문자열이어야 합니다`)
  }
  if (def.frames !== undefined && (typeof def.frames !== 'string' || def.frames.length === 0)) {
    throw new ContentError(`${where}: 'frames'는 비어 있지 않은 문자열이어야 합니다`)
  }

  checkElement(def, where)
  checkRarity(def, where)

  if (!VALID_TARGETS.includes(def.targets)) {
    throw new ContentError(`${where}: 'targets'는 ${VALID_TARGETS.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(def.targets)})`)
  }
  if (!def.palette || typeof def.palette !== 'object') {
    throw new ContentError(`${where}: 'palette' 객체가 필요합니다`)
  }
  if (!Array.isArray(def.levels) || def.levels.length === 0) {
    throw new ContentError(`${where}: 'levels'는 1개 이상의 배열이어야 합니다`)
  }

  def.levels.forEach((lv, i) => {
    const lw = `${where} 레벨 ${i + 1}`
    requireNumber(lv, 'cost', lw, { min: 0 })
    requireNumber(lv, 'damage', lw, { min: 0 })
    requireNumber(lv, 'range', lw, { min: 0.1 })
    requireNumber(lv, 'fireRate', lw, { min: 0.01 })
    const fx = lv.effects
    if (fx !== undefined && !Array.isArray(fx)) {
      throw new ContentError(`${lw}: 'effects'는 배열이어야 합니다`)
    }
    for (const e of fx || []) {
      if (!e || typeof e.kind !== 'string') {
        throw new ContentError(`${lw}: 각 효과는 { kind: '...' } 형태여야 합니다`)
      }
    }
  })

  towers.set(def.id, def)
  return def
}

/** 적을 등록한다. speed 단위 = 타일/초. */
export function registerEnemy(def) {
  const where = `적 '${def && def.id}'`
  if (!def || typeof def !== 'object') throw new ContentError('적 정의는 객체여야 합니다')
  requireString(def, 'id', where)
  requireUnique(enemies, def.id, '적')
  requireString(def, 'name', where)
  requireString(def, 'sprite', where)
  if (def.frames !== undefined && (typeof def.frames !== 'string' || def.frames.length === 0)) {
    throw new ContentError(`${where}: 'frames'는 비어 있지 않은 문자열이어야 합니다`)
  }
  requireNumber(def, 'baseHp', where, { min: 1 })
  requireNumber(def, 'speed', where, { min: 0.01 })
  requireNumber(def, 'armor', where, { min: 0 })
  requireNumber(def, 'gold', where, { min: 0 })
  requireNumber(def, 'size', where, { min: 0.05, max: 2 })
  checkElement(def, where)
  if (!def.palette || typeof def.palette !== 'object') {
    throw new ContentError(`${where}: 'palette' 객체가 필요합니다`)
  }
  if (def.resist !== undefined && (typeof def.resist !== 'object' || def.resist === null)) {
    throw new ContentError(`${where}: 'resist'는 { slow: 0~1 } 형태의 객체여야 합니다`)
  }
  if (def.abilities !== undefined) {
    if (!Array.isArray(def.abilities)) {
      throw new ContentError(`${where}: 'abilities'는 배열이어야 합니다`)
    }
    for (const a of def.abilities) {
      if (!a || typeof a.kind !== 'string') {
        throw new ContentError(`${where}: 각 능력은 { kind: '...' } 형태여야 합니다`)
      }
    }
  }
  if (def.tier !== undefined) requireNumber(def, 'tier', where, { min: 0, max: 9 })
  enemies.set(def.id, def)
  return def
}

/** 맵을 등록한다. waypoints는 축 정렬(수평/수직)이어야 하며 격자 밖 지점도 허용된다. */
export function registerMap(def) {
  const where = `맵 '${def && def.id}'`
  if (!def || typeof def !== 'object') throw new ContentError('맵 정의는 객체여야 합니다')
  requireString(def, 'id', where)
  requireUnique(maps, def.id, '맵')
  requireString(def, 'name', where)
  requireString(def, 'waveSet', where)
  requireNumber(def, 'order', where, { min: 0 })
  requireNumber(def, 'cols', where, { min: 3, max: 40 })
  requireNumber(def, 'rows', where, { min: 3, max: 40 })
  if (def.mode !== undefined && !MAP_MODES.includes(def.mode)) {
    throw new ContentError(`${where}: 'mode'는 ${MAP_MODES.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(def.mode)})`)
  }
  // tier 는 플레이어에게 보이는 사다리, hpMul 은 웨이브셋의 무게를 상쇄하는
  // 조율값이다. 겸하게 뒀더니 난이도가 두 번 곱해졌다 (maps.js 머리말 참고).
  requireNumber(def, 'tier', where, { min: 1, max: 10 })
  requireNumber(def, 'hpMul', where, { min: 0.1 })
  requireNumber(def, 'startGold', where, { min: 0 })
  requireNumber(def, 'startLives', where, { min: 1 })
  if (!def.theme || typeof def.theme !== 'object') {
    throw new ContentError(`${where}: 'theme' 객체가 필요합니다`)
  }
  if (def.art !== undefined && (typeof def.art !== 'string' || def.art.length === 0)) {
    throw new ContentError(`${where}: 'art'는 비어 있지 않은 문자열이어야 합니다`)
  }
  if (def.props !== undefined && !Array.isArray(def.props)) {
    throw new ContentError(`${where}: 'props'는 배열이어야 합니다`)
  }
  maps.set(def.id, def)
  return def
}

/** 웨이브 셋을 등록한다. 각 줄 = 그 웨이브의 그룹 배열, 그룹 = [적id, 마리수, 간격, 지연]. */
export function registerWaveSet(id, table) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new ContentError('웨이브셋 id는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(waveSets, id, '웨이브셋')
  if (!Array.isArray(table) || table.length === 0) {
    throw new ContentError(`웨이브셋 '${id}': 1개 이상의 웨이브가 담긴 배열이어야 합니다`)
  }
  waveSets.set(id, table)
  return table
}

/**
 * 타워 능력을 등록한다. 새 능력을 추가하는 유일한 지점.
 * handler = { onHit?(ctx, effect, target), onFire?(ctx, effect, target) }
 *   ctx = { world, tower, now, applyDamage, addStatus, spawnParticle, playSfx }
 */
export function registerEffect(kind, handler) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new ContentError('효과 kind는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(effects, kind, '효과')
  if (!handler || typeof handler !== 'object') {
    throw new ContentError(`효과 '${kind}': 핸들러 객체가 필요합니다`)
  }
  // passive 는 발사와 무관한 효과다 (예: buff — domain/mods.js 가 파라미터를 직접 읽는다).
  // 등록은 해야 한다 — 타워의 effects[].kind 가 등록된 것인지 여기서 검사하기 때문이다.
  if (handler.passive !== true
      && typeof handler.onHit !== 'function' && typeof handler.onFire !== 'function') {
    throw new ContentError(
      `효과 '${kind}': onHit 또는 onFire 중 최소 하나는 함수여야 합니다`
      + ` (발사와 무관한 효과라면 { passive: true } 를 주세요)`)
  }
  requireDisplayText(handler, `효과 '${kind}'`)
  effects.set(kind, handler)
  return handler
}

/**
 * 효과·적 능력은 화면에 설명될 수 있어야 등록된다.
 *
 * 전에는 타워 패널이 slow·splash·aura 세 가지만 알아서, 나중에 붙은 dot·chain·pierce·buff
 * 는 **패널에 아무것도 안 나왔다** — 고양이 9종 중 4종이 설명 없이 팔렸다. 설명을
 * 핸들러에 붙여 두면 새 효과를 만들 때 문구를 빠뜨릴 수 없다.
 */
function requireDisplayText(handler, where) {
  if (typeof handler.name !== 'string' || handler.name.length === 0) {
    throw new ContentError(`${where}: 'name'(화면에 보일 이름)이 필요합니다 — 타워 패널·도감이 이걸로 설명합니다`)
  }
  if (typeof handler.describe !== 'function') {
    throw new ContentError(`${where}: 'describe(spec)' 함수가 필요합니다 — 파라미터를 문장으로 만듭니다`)
  }
}

/** 타워 정의의 effects[] 항목 하나를 { name, text } 로. 등록되지 않은 kind 면 null. */
export function describeEffect(fx) {
  const h = fx && effects.get(fx.kind)
  if (!h) return null
  return { name: h.name, text: String(h.describe(fx)) }
}

/** 적 정의의 abilities[] 항목 하나를 { name, text } 로. 등록되지 않은 kind 면 null. */
export function describeAbility(ab) {
  const h = ab && enemyAbilities.get(ab.kind)
  if (!h) return null
  return { name: h.name, text: String(h.describe(ab)) }
}

/**
 * 적(보스)의 능력을 등록한다. 새 보스 패턴을 추가하는 유일한 지점.
 * handler = {
 *   onSpawn?(ctx, ability, enemy),      등장 순간
 *   onTick?(ctx, ability, enemy, dt),   매 스텝
 *   onDamaged?(ctx, ability, enemy, amount) → 숫자를 반환하면 그 값으로 피해를 대체한다(보호막)
 *   onDeath?(ctx, ability, enemy),      사망 순간 (분열 등)
 * }
 */
export function registerEnemyAbility(kind, handler) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new ContentError('적 능력 kind는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(enemyAbilities, kind, '적 능력')
  if (!handler || typeof handler !== 'object') {
    throw new ContentError(`적 능력 '${kind}': 핸들러 객체가 필요합니다`)
  }
  const hooks = ['onSpawn', 'onTick', 'onDamaged', 'onDeath']
  if (!hooks.some((h) => typeof handler[h] === 'function')) {
    throw new ContentError(`적 능력 '${kind}': ${hooks.join(' / ')} 중 최소 하나는 함수여야 합니다`)
  }
  requireDisplayText(handler, `적 능력 '${kind}'`)
  enemyAbilities.set(kind, handler)
  return handler
}

/**
 * 플레이어 필살기를 등록한다.
 * def = { id, name, order, desc, icon, cooldown(초), catnip(즉시충전 비용), run(ctx) }
 */
export function registerSpecial(def) {
  const where = `필살기 '${def && def.id}'`
  if (!def || typeof def !== 'object') throw new ContentError('필살기 정의는 객체여야 합니다')
  requireString(def, 'id', where)
  requireUnique(specials, def.id, '필살기')
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireString(def, 'icon', where)
  requireNumber(def, 'order', where, { min: 0 })
  requireNumber(def, 'cooldown', where, { min: 1 })
  requireNumber(def, 'mana', where, { min: 0 })
  requireNumber(def, 'catnip', where, { min: 0 })
  if (typeof def.run !== 'function') {
    throw new ContentError(`${where}: 'run(ctx)' 함수가 필요합니다`)
  }
  specials.set(def.id, def)
  return def
}

/**
 * 공격 모션을 등록한다. 고양이가 쏘는 순간의 몸짓·무기·이펙트를 그린다.
 *
 * 왜 레지스트리인가: 모션을 sprites.js 의 if문으로 쌓으면 고양이를 추가할 때마다
 * 그림 코드를 고쳐야 한다. 등록제로 두면 towers.js 에 `pose: '이름'` 한 줄이면 끝이고,
 * 오타는 부팅 때 validateAll() 이 잡는다.
 *
 * drawFn(ctx, o) — ctx 는 이미 고양이 중심(0,0)으로 옮겨져 있다. 스스로 save/restore 한다.
 *   o = { r, phase, angle, palette, t, hy }
 *     r     픽셀 반지름
 *     phase 발사 직후 1 → 0 으로 감쇠 (모션 진행도)
 *     angle 바라보는 방향(라디안)
 *     hy    머리 중심의 y (몸 기준 위쪽 음수)
 */
export function registerPose(name, drawFn) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new ContentError('공격 모션 이름은 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(poses, name, '공격 모션')
  if (typeof drawFn !== 'function') {
    throw new ContentError(`공격 모션 '${name}': 드로잉 함수가 필요합니다`)
  }
  poses.set(name, drawFn)
  return drawFn
}

/**
 * 프레임 아트 스트립을 등록한다. 캔버스 스프라이트를 그림으로 대체하는 통로다.
 *
 *   registerFrameSet('cat-cheese', {
 *     src: 'art/cat-cheese.png',      // index.html 기준 상대 경로
 *     frames: 5, w: 169, h: 169,      // 가로로 붙은 프레임 수와 한 칸 크기
 *     body: { cx: 82, cy: 73, h: 107 } // 대기 프레임에서 고양이가 차지하는 영역
 *   })
 *
 * body 를 왜 받는가: 그림 안에서 고양이가 프레임을 꽉 채우지 않는다. 이 값이
 * 없으면 벡터에서 그림으로 바꿀 때 고양이 크기와 바닥 위치가 어긋난다.
 * 실측값은 tools/slice-sheet.mjs 가 슬라이스할 때 표로 출력한다.
 */
export function registerFrameSet(key, def) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new ContentError('프레임셋 key는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(frameSets, key, '프레임셋')
  const where = `프레임셋 '${key}'`
  if (!def || typeof def !== 'object') throw new ContentError(`${where}: 정의는 객체여야 합니다`)
  requireString(def, 'src', where)
  requireNumber(def, 'frames', where, { min: 1 })
  requireNumber(def, 'w', where, { min: 1 })
  requireNumber(def, 'h', where, { min: 1 })
  const body = def.body
  if (!body || typeof body !== 'object') {
    throw new ContentError(`${where}: 'body' 객체가 필요합니다 ({ cx, cy, h })`)
  }
  for (const f of ['cx', 'cy', 'h']) requireNumber(body, f, `${where} body`, { min: 0 })
  if (body.h > def.h) {
    throw new ContentError(`${where}: body.h(${body.h})가 프레임 높이(${def.h})보다 큽니다`)
  }
  // 선택 항목 — 캐릭터마다 벡터에서 쓰던 크기가 다르다
  if (def.hPerR !== undefined) requireNumber(def, 'hPerR', where, { min: 0.1 })
  if (def.cyPerR !== undefined) requireNumber(def, 'cyPerR', where, { min: -5, max: 5 })
  // 그림에 바닥 그림자가 없으면 코드가 그린다 ({ cy, rx, ry, alpha }, 전부 r 배수)
  if (def.shadow !== undefined) {
    const sh = def.shadow
    if (!sh || typeof sh !== 'object') {
      throw new ContentError(`${where}: 'shadow'는 { cy, rx, ry, alpha } 객체여야 합니다`)
    }
    for (const f of ['cy', 'rx', 'ry', 'alpha']) requireNumber(sh, f, `${where} shadow`, { min: -5 })
  }
  const entry = { key, ...def, body: { ...body } }
  frameSets.set(key, entry)
  return entry
}

/**
 * 시나리오 목표 종류를 등록한다. 새 목표 = 블록 하나, game.js 에 if 문을 쌓지 않는다.
 *
 *   registerObjective('livesAbove', {
 *     requires: ['n'],                       // 챕터가 반드시 채워야 할 항목
 *     label: (spec) => `목숨 ${spec.n} 이상 남기기`,
 *     check: (summary, spec) => summary.livesLeft >= spec.n,
 *   })
 */
export function registerObjective(kind, def) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new ContentError('목표 kind는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(objectives, kind, '목표')
  const where = `목표 '${kind}'`
  if (!def || typeof def !== 'object') throw new ContentError(`${where}: 정의는 객체여야 합니다`)
  if (typeof def.label !== 'function') throw new ContentError(`${where}: 'label' 함수가 필요합니다`)
  if (typeof def.check !== 'function') throw new ContentError(`${where}: 'check' 함수가 필요합니다`)
  const requires = def.requires || []
  if (!Array.isArray(requires)) throw new ContentError(`${where}: 'requires'는 배열이어야 합니다`)
  const entry = { kind, ...def, requires }
  objectives.set(kind, entry)
  return entry
}

/** 시나리오 챕터를 등록한다. 자세한 항목은 content/scenario.js 참고. */
export function registerChapter(def) {
  if (!def || typeof def !== 'object') throw new ContentError('챕터 정의는 객체여야 합니다')
  const where = `챕터 '${def && def.id}'`
  requireString(def, 'id', where)
  requireUnique(chapters, def.id, '챕터')
  requireString(def, 'title', where)
  requireString(def, 'mapId', where)
  requireString(def, 'waveSet', where)
  requireNumber(def, 'order', where, { min: 1 })
  if (def.waveLimit !== undefined) requireNumber(def, 'waveLimit', where, { min: 1 })
  if (!def.primary || typeof def.primary.kind !== 'string') {
    throw new ContentError(`${where}: 'primary' 목표({ kind: ... })가 필요합니다`)
  }
  const bonus = def.bonus || []
  if (!Array.isArray(bonus) || bonus.length > 2) {
    throw new ContentError(`${where}: 'bonus'는 0~2개의 배열이어야 합니다 (별이 최대 3개다)`)
  }
  const entry = {
    ...def,
    bonus,
    intro: def.intro || [],
    outro: def.outro || [],
    rewards: def.rewards || {},
  }
  chapters.set(def.id, entry)
  return entry
}

/**
 * 지도 아트를 등록한다. 지금은 길 질감 한 장이고, 나중에 바닥 질감이 여기 붙는다.
 *
 *   registerMapArt('alley', { path: 'art/path-alley.png' })
 *
 * 그림은 이어붙여 쓰는 질감이다. 길 모양은 코드가 웨이포인트에서 계산하고
 * 이 그림은 그 안을 채우기만 하므로, 그림과 경로가 어긋날 수가 없다.
 */
export function registerMapArt(id, def) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new ContentError('지도 아트 id는 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(mapArt, id, '지도 아트')
  const where = `지도 아트 '${id}'`
  if (!def || typeof def !== 'object') throw new ContentError(`${where}: 정의는 객체여야 합니다`)
  for (const f of ['path', 'floor']) {
    if (def[f] !== undefined && (typeof def[f] !== 'string' || def[f].length === 0)) {
      throw new ContentError(`${where}: '${f}'는 비어 있지 않은 문자열이어야 합니다`)
    }
  }
  if (!def.path && !def.floor) {
    throw new ContentError(`${where}: 'path' 나 'floor' 중 적어도 하나는 있어야 합니다`)
  }
  const entry = { id, ...def }
  mapArt.set(id, entry)
  return entry
}

/** 막힌 칸에 놓을 소품. registerProp('crate', { src: 'art/prop-crate.png' }) */
export function registerProp(name, def) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new ContentError('소품 이름은 비어 있지 않은 문자열이어야 합니다')
  }
  requireUnique(props, name, '소품')
  const where = `소품 '${name}'`
  if (!def || typeof def !== 'object') throw new ContentError(`${where}: 정의는 객체여야 합니다`)
  requireString(def, 'src', where)
  const entry = { name, ...def }
  props.set(name, entry)
  return entry
}

/**
 * 고양이 조합. 특정 고양이들을 특정 모양으로 놓으면 이름이 붙고 배수가 얹힌다.
 *
 *   registerCombo({ id, name, towers: ['cheese','cheese','cheese'],
 *                   shape: 'line', mods: { fireRateMul: 1.25 }, desc })
 *
 * 같은 id 를 여러 번 적으면 그만큼 서로 다른 고양이가 필요하다.
 * 모양 판정은 domain/mods.js 의 shapeHolds 가 한다 — 여기서는 형식만 본다.
 */
export function registerCombo(def) {
  if (!def || typeof def !== 'object') throw new ContentError('조합 정의는 객체여야 합니다')
  requireString(def, 'id', '조합')
  requireUnique(combos, def.id, '조합')
  const where = `조합 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  if (!Array.isArray(def.towers) || def.towers.length < 2) {
    throw new ContentError(`${where}: towers 는 고양이 id 2개 이상의 배열이어야 합니다`)
  }
  if (!SHAPES.includes(def.shape)) {
    throw new ContentError(`${where}: shape 는 ${SHAPES.join(' / ')} 중 하나여야 합니다 (받은 값: ${def.shape})`)
  }
  if (def.shape === 'diagonal' && def.towers.length !== 2) {
    throw new ContentError(`${where}: diagonal 은 두 마리짜리 조합에만 쓸 수 있습니다`)
  }
  if (!def.mods || typeof def.mods !== 'object') {
    throw new ContentError(`${where}: mods 객체가 필요합니다 (예: { fireRateMul: 1.25 })`)
  }
  combos.set(def.id, { ...def })
  return def
}

/**
 * 펫 — 판 시작 전에 하나만 고른다. 판 안에서 바꾸지 않는다.
 *
 *   registerPet({ id, name, desc, price, mods, startGold, startLives, hook })
 *
 * mods 는 판 전체에 걸리는 배수(goldMul·manaMul)이고, startGold/startLives 는
 * 판 시작값에 더한다. hook 은 코드가 따로 처리해야 하는 펫만 쓰는 문자열이다
 * (지금은 'autoCollect' 하나뿐 — 임의의 함수를 받게 하면 두 번째 필살기 시스템이 된다).
 */
export function registerPet(def) {
  if (!def || typeof def !== 'object') throw new ContentError('펫 정의는 객체여야 합니다')
  requireString(def, 'id', '펫')
  requireUnique(pets, def.id, '펫')
  const where = `펫 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  if (!Number.isFinite(def.price) || def.price < 0) {
    throw new ContentError(`${where}: price 는 0 이상의 숫자여야 합니다 (캣닢 가격)`)
  }
  if (def.hook !== undefined && !PET_HOOKS.includes(def.hook)) {
    throw new ContentError(
      `${where}: hook 은 ${PET_HOOKS.join(' / ')} 중 하나여야 합니다 (받은 값: ${def.hook})`)
  }
  pets.set(def.id, { ...def })
  return def
}

/**
 * 필살기 연계 — 정해진 순서로 창 안에 이어 쓰면 이름이 붙고 보너스가 붙는다.
 *
 *   registerSpecialCombo({ id, name, desc, from, to, window, bonus })
 *
 * bonus 는 두 가지만 받는다:
 *   damageMul    필살기가 주는 피해에 곱한다 (_specialCtx 의 래퍼에서 한 번에 걸린다)
 *   manaRefund   시전 뒤 마나를 돌려준다
 * 반경·지속시간 보너스는 필살기마다 따로 손봐야 하므로 일부러 받지 않는다.
 * 이 제한 덕에 specials.js 를 한 글자도 안 고치고 연계를 붙일 수 있다.
 */
export function registerSpecialCombo(def) {
  if (!def || typeof def !== 'object') throw new ContentError('필살기 연계 정의는 객체여야 합니다')
  requireString(def, 'id', '필살기 연계')
  requireUnique(specialCombos, def.id, '필살기 연계')
  const where = `필살기 연계 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireString(def, 'from', where)
  requireString(def, 'to', where)
  if (def.from === def.to) {
    throw new ContentError(`${where}: 같은 필살기를 두 번 쓰는 건 연계가 아닙니다`)
  }
  if (!Number.isFinite(def.window) || def.window <= 0) {
    throw new ContentError(`${where}: window 는 0보다 큰 초 단위 숫자여야 합니다`)
  }
  if (!def.bonus || typeof def.bonus !== 'object') {
    throw new ContentError(`${where}: bonus 객체가 필요합니다 (damageMul 또는 manaRefund)`)
  }
  const keys = Object.keys(def.bonus)
  const bad = keys.filter((k) => !SPECIAL_BONUS_KEYS.includes(k))
  if (keys.length === 0 || bad.length > 0) {
    throw new ContentError(
      `${where}: bonus 는 ${SPECIAL_BONUS_KEYS.join(' / ')} 만 받습니다`
      + (bad.length ? ` (모르는 항목: ${bad.join(', ')})` : ''))
  }
  specialCombos.set(def.id, { ...def })
  return def
}

/**
 * 업적 — 도감의 업적 탭은 이 목록을 순회한다.
 *
 *   registerAchievement({ id, order, name, desc, catnip, check(ctx) })
 *
 * check 는 domain/achievements.js 가 { stats, progress, summary, counts } 를 넣어 부른다.
 * summary 는 부팅 때 null 이므로 check 가 반드시 null 을 견뎌야 한다 (던지면 false 로 본다).
 */
export function registerAchievement(def) {
  if (!def || typeof def !== 'object') throw new ContentError('업적 정의는 객체여야 합니다')
  requireString(def, 'id', '업적')
  requireUnique(achievements, def.id, '업적')
  const where = `업적 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireNumber(def, 'order', where, { min: 0 })
  if (!Number.isFinite(def.catnip) || def.catnip < 0) {
    throw new ContentError(`${where}: catnip 은 0 이상의 숫자여야 합니다 (보상 캣닢)`)
  }
  if (typeof def.check !== 'function') throw new ContentError(`${where}: 'check(ctx)' 함수가 필요합니다`)
  achievements.set(def.id, { ...def })
  return def
}

/** 연계가 줄 수 있는 보너스. 늘리려면 game.js 에서 그 자리를 만들어야 한다. */
const SPECIAL_BONUS_KEYS = ['damageMul', 'manaRefund']

/** 코드가 따로 처리하는 펫 훅. 새 훅이 필요하면 여기에 이름을 하나 늘린다. */
const PET_HOOKS = ['autoCollect', 'refund80']

/**
 * 도전 — 자유 모드 맵에 규칙 하나를 얹는다. 규칙은 화이트리스트(RULE_KEYS)만 받는다:
 * 임의의 함수를 받으면 곧 "도전이 뭐든 할 수 있는" 두 번째 필살기 시스템이 된다.
 *
 *   registerChallenge({ id, order, name, badge, desc, rules, reward })
 *   rules = { goldMul, startGoldMul, livesMul, hpMul, bossCountMul, maxTowers, replace:{적id:적id}, bannedTowers:[], noSpecials }
 */
export const RULE_KEYS = ['goldMul', 'startGoldMul', 'livesMul', 'hpMul', 'bossCountMul', 'maxTowers', 'replace', 'bannedTowers', 'noSpecials',
  'noSell', 'speedMul', 'armorAdd', 'manaMul',
  // 속성 상성을 켠다(domain/elements.js). 원정 모드가 이걸로 켜고, 자유·시나리오는 안 켠다 —
  // 맵을 깨고 나가는 길이 속성 수집에 걸리면 안 된다.
  'elemental',
  // 이 판의 적을 전부 한 속성으로 덮는다(원정 칸의 '지배 속성'). elemental 과 같이 써야 뜻이 있다.
  'enemyElement']
export function registerChallenge(def) {
  if (!def || typeof def !== 'object') throw new ContentError('도전 정의는 객체여야 합니다')
  requireString(def, 'id', '도전')
  requireUnique(challenges, def.id, '도전')
  const where = `도전 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'badge', where)
  requireString(def, 'desc', where)
  requireNumber(def, 'order', where, { min: 0 })
  if (!Number.isFinite(def.reward) || def.reward < 0) throw new ContentError(`${where}: reward 는 0 이상의 숫자여야 합니다 (첫 클리어 캣닢)`)
  if (!def.rules || typeof def.rules !== 'object') throw new ContentError(`${where}: rules 객체가 필요합니다`)
  const keys = Object.keys(def.rules)
  const bad = keys.filter((k) => !RULE_KEYS.includes(k))
  if (keys.length === 0 || bad.length > 0) {
    throw new ContentError(`${where}: rules 는 ${RULE_KEYS.join(' / ')} 만 받습니다`
      + (bad.length ? ` (모르는 항목: ${bad.join(', ')})` : ''))
  }
  if (def.rules.enemyElement !== undefined && !isElement(def.rules.enemyElement)) {
    throw new ContentError(`${where}: rules.enemyElement 는 ${ELEMENTS.join(' | ')} 중 하나여야 합니다`)
  }
  for (const k of ['goldMul', 'startGoldMul', 'livesMul', 'hpMul', 'bossCountMul', 'speedMul', 'manaMul']) {
    if (def.rules[k] !== undefined && !(Number.isFinite(def.rules[k]) && def.rules[k] > 0)) {
      throw new ContentError(`${where}: rules.${k} 는 0보다 큰 숫자여야 합니다`)
    }
  }
  if (def.rules.armorAdd !== undefined && !(Number.isFinite(def.rules.armorAdd) && def.rules.armorAdd >= 0)) {
    throw new ContentError(`${where}: rules.armorAdd 는 0 이상의 숫자여야 합니다`)
  }
  for (const k of ['noSpecials', 'noSell']) {
    if (def.rules[k] !== undefined && def.rules[k] !== true) throw new ContentError(`${where}: rules.${k} 는 true 만 받습니다`)
  }
  // pack: 유료 팩 id (없으면 무료 팩 1). 어느 상품이 파는지는 content.test 가 shop.js 와 대조한다.
  if (def.pack !== undefined && (typeof def.pack !== 'string' || def.pack.length === 0)) {
    throw new ContentError(`${where}: pack 은 비어 있지 않은 문자열이어야 합니다 (유료 팩 id)`)
  }
  if (def.rules.maxTowers !== undefined && !(Number.isInteger(def.rules.maxTowers) && def.rules.maxTowers >= 1)) {
    throw new ContentError(`${where}: rules.maxTowers 는 1 이상의 정수여야 합니다`)
  }
  if (def.rules.replace !== undefined && (typeof def.rules.replace !== 'object' || Array.isArray(def.rules.replace))) {
    throw new ContentError(`${where}: rules.replace 는 { 적id: 적id } 객체여야 합니다`)
  }
  if (def.rules.bannedTowers !== undefined && !Array.isArray(def.rules.bannedTowers)) {
    throw new ContentError(`${where}: rules.bannedTowers 는 고양이 id 배열이어야 합니다`)
  }
  challenges.set(def.id, { ...def })
  return def
}

/**
 * 스킨 — 고양이 겉모습만 바꾼다. 능력치는 없다(mods 를 주면 등록 때 던진다 — 약속이다).
 *
 *   registerSkin({ id, towerId, name, desc, order, look, price?, sku? })
 *   look = { filter: 'hue-rotate(35deg) saturate(1.3)' }   프레임 스트립을 CSS 필터로 한 번 구워 쓴다 (그림 없이)
 *        | { frames: 'cat-cheese-armor' }                  그림 스킨 — 원본과 같은 격자(frames·w·h)의 프레임셋
 *   price 는 캣닢 가격, sku 는 그것을 파는 IAP 상품(shop.js) — 둘 중 하나만, 둘 다 없으면 보상 전용.
 */
export function registerSkin(def) {
  if (!def || typeof def !== 'object') throw new ContentError('스킨 정의는 객체여야 합니다')
  requireString(def, 'id', '스킨')
  requireUnique(skins, def.id, '스킨')
  const where = `스킨 '${def.id}'`
  requireString(def, 'towerId', where)
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireNumber(def, 'order', where, { min: 0 })
  if (def.mods !== undefined) throw new ContentError(`${where}: 스킨은 능력치(mods)를 가질 수 없습니다 — 겉모습만 바꿉니다`)
  const look = def.look
  if (!look || typeof look !== 'object') throw new ContentError(`${where}: look 객체가 필요합니다 ({ filter } 또는 { frames })`)
  const hasFilter = typeof look.filter === 'string' && look.filter.length > 0
  const hasFrames = typeof look.frames === 'string' && look.frames.length > 0
  if (hasFilter === hasFrames) throw new ContentError(`${where}: look 은 filter 와 frames 중 정확히 하나여야 합니다`)
  if (def.price !== undefined && !(Number.isFinite(def.price) && def.price >= 1)) {
    throw new ContentError(`${where}: price 는 1 이상의 숫자여야 합니다 (캣닢 가격)`)
  }
  if (def.sku !== undefined && (typeof def.sku !== 'string' || def.sku.length === 0)) {
    throw new ContentError(`${where}: sku 는 비어 있지 않은 문자열이어야 합니다`)
  }
  if (def.price !== undefined && def.sku !== undefined) throw new ContentError(`${where}: price 와 sku 는 함께 쓸 수 없습니다`)
  skins.set(def.id, { ...def })
  return def
}
/**
 * 속성 원정 — 칸을 이어 도는 사다리 하나.
 *
 *   registerExpedition({ id, name, desc, order, stages: [{ mapId, waveSet, waveLimit, element, reward }, …] })
 *
 * 칸의 `element` 는 **그 칸 적 전부의 속성**이다(game.js `_enemyElement` 가 덮어쓴다).
 * `reward` 는 그 칸을 **처음 깼을 때 한 번만** 준다 — { tickets, catnip, shards, rune? }.
 *
 * 검증을 여기서 빡빡하게 하는 이유: 원정은 `rules` 를 Game 에 직접 넣는 길을 쓰므로
 * `registerChallenge` 의 화이트리스트를 안 지난다. 그 대신 이 함수가 같은 자리에서 막는다.
 */
export function registerExpedition(def) {
  if (!def || typeof def !== 'object') throw new ContentError('원정 정의는 객체여야 합니다')
  requireString(def, 'id', '원정')
  requireUnique(expeditions, def.id, '원정')
  const where = `원정 '${def.id}'`
  requireString(def, 'name', where)
  requireString(def, 'desc', where)
  requireNumber(def, 'order', where, { min: 0 })
  if (!Array.isArray(def.stages) || def.stages.length === 0) {
    throw new ContentError(`${where}: stages 는 1칸 이상의 배열이어야 합니다`)
  }
  if (def.stages.length > 12) {
    // 한 원정이 길어지면 도중에 앱을 닫았을 때 잃는 시간이 커진다(진행 중 상태는 저장하지 않는다).
    throw new ContentError(`${where}: stages 는 12칸을 넘을 수 없습니다 (받은 값: ${def.stages.length})`)
  }
  def.stages.forEach((st, i) => {
    const sw = `${where} ${i + 1}칸`
    if (!st || typeof st !== 'object') throw new ContentError(`${sw}: 객체여야 합니다`)
    requireString(st, 'mapId', sw)
    requireString(st, 'waveSet', sw)
    requireNumber(st, 'waveLimit', sw, { min: 1 })
    if (!isElement(st.element)) {
      throw new ContentError(`${sw}: element 는 ${ELEMENTS.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(st.element)})`)
    }
    if (st.hpMul !== undefined && !(Number.isFinite(st.hpMul) && st.hpMul > 0)) {
      throw new ContentError(`${sw}: hpMul 은 0보다 큰 수여야 합니다 (받은 값: ${JSON.stringify(st.hpMul)})`)
    }
    const rw = st.reward
    if (!rw || typeof rw !== 'object') throw new ContentError(`${sw}: reward 객체가 필요합니다`)
    for (const k of ['tickets', 'catnip', 'shards']) {
      const v = rw[k]
      if (v !== undefined && !(Number.isInteger(v) && v >= 0)) {
        throw new ContentError(`${sw}: reward.${k} 는 0 이상의 정수여야 합니다 (받은 값: ${JSON.stringify(v)})`)
      }
    }
    if (rw.rune !== undefined && !isElement(rw.rune)) {
      throw new ContentError(`${sw}: reward.rune 은 ${ELEMENTS.join(' | ')} 중 하나여야 합니다`)
    }
  })
  expeditions.set(def.id, def)
  return def
}
export function getExpedition(id) { return (id && expeditions.get(id)) || null }
export function listExpeditions() { return [...expeditions.values()].sort(byOrder) }

export function getSkin(id) { return (id && skins.get(id)) || null }
/** 전부, 또는 한 고양이의 스킨만 (order 순) */
export function listSkins(towerId) {
  const all = [...skins.values()].sort(byOrder)
  return towerId ? all.filter((s) => s.towerId === towerId) : all
}

/** registerCombo 가 받는 모양. domain/mods.js 의 shapeHolds 와 짝을 이룬다. */
const SHAPES = ['adjacent', 'diagonal', 'line', 'near']

/** 캔버스 드로잉 함수를 등록한다. drawFn(ctx, opts) */
/**
 * 사용자에게 보이는 문구(name · desc · badge · 챕터 title · 컷신 text — 효과·적 능력의 name 포함)에 fn 을 적용해 제자리에서 바꾼다 — 부팅 때 번역용.
 * 레지스트리는 언어를 모른다: main.js 가 i18n 의 tr 을 넘긴다. 바꾼 개수를 돌려준다.
 * 두 번 불러도 안전하다 — 이미 번역된 문구는 사전에 없어 그대로 남는다(fn 이 원문을 돌려준다).
 */
export function localizeAll(fn) {
  let n = 0
  const apply = (obj, keys) => {
    for (const k of keys) {
      if (typeof obj[k] !== 'string' || !obj[k]) continue
      const v = fn(obj[k])
      if (v !== obj[k]) { obj[k] = v; n += 1 }
    }
  }
  for (const m of [towers, enemies, maps, specials, combos, pets, specialCombos, achievements, challenges, skins, effects, enemyAbilities, expeditions]) {
    for (const def of m.values()) apply(def, ['name', 'desc', 'badge'])
  }
  for (const ch of chapters.values()) {
    apply(ch, ['title', 'desc'])
    for (const card of [...(ch.intro || []), ...(ch.outro || [])]) apply(card, ['text'])
  }
  return n
}

export function registerSprite(key, drawFn) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new ContentError('스프라이트 key는 비어 있지 않은 문자열이어야 합니다')
  }
  if (typeof drawFn !== 'function') {
    throw new ContentError(`스프라이트 '${key}': 드로잉 함수가 필요합니다`)
  }
  sprites.set(key, drawFn)
  return drawFn
}

// ---------------------------------------------------------------- 조회

const byOrder = (a, b) => a.order - b.order

export function getTower(id) { return towers.get(id) || null }
export function listTowers() { return [...towers.values()].sort(byOrder) }
/**
 * 뽑기 없이 얻을 수 있는 고양이 — 등급(`rarity`)이 없는 것들.
 * 업적이 이걸 센다: **안 사면(또는 운이 없으면) 영영 못 푸는 업적을 만들지 않는다**는 약속
 * (3막 업적을 1~2막으로 제한한 것과 같은 규칙). 카드 고양이는 무료로도 닿지만 **운에 걸린다** —
 * 업적을 운에 거는 것과 결제에 거는 것은 사람에게 똑같이 나쁘다.
 */
export function listFreeTowers() { return listTowers().filter((t) => !t.rarity) }
/**
 * 뽑기 풀 — 등급이 붙은 고양이만. `gacha.js` 의 `draw(rng, pools)` 가 받는 모양 그대로다.
 *
 * **등급이 없으면 안 나온다.** 기존 9마리는 시나리오 보상으로 무료라 등급이 없고, 그래서
 * 지금은 두 풀이 다 비어 있다 — `gacha.js` 가 그때 조각으로 바꿔 준다(빈손이 없다는 약속).
 * 카드 전용 고양이가 생기면 `rarity` 한 줄로 여기 들어온다.
 */
export function cardPools() {
  const cats = { legend: [], epic: [] }
  for (const t of towers.values()) {
    if (t.rarity && cats[t.rarity]) cats[t.rarity].push(t.id)
  }
  for (const k of Object.keys(cats)) cats[k].sort()
  return { cats }
}
export function getEnemy(id) { return enemies.get(id) || null }
export function listEnemies() { return [...enemies.values()] }
export function getMap(id) { return maps.get(id) || null }
/**
 * 맵 목록 — **기본은 자유 모드 맵만** 준다.
 *
 * 원정 전용 맵(`mode: 'expedition'`)을 이 목록에 섞으면 조용히 여섯 곳이 깨진다:
 * 해금 사슬(`nextMapId`) · 주간 로테이션(`weeklyPick`) · '온 집' 업적의 맵 수 ·
 * 밸런스 검사의 맵×난이도 표 · `content.test` 의 tier 순증 · 그리고 맵 카드의 `'☆'.repeat(6 - tier)`.
 * 그래서 부르는 쪽 20곳을 안 고치고 여기서 한 번 거른다. `mode: 'all'` 이면 전부 준다(검증·기하 검사용).
 */
export function listMaps({ mode = 'free' } = {}) {
  const all = [...maps.values()].sort(byOrder)
  return mode === 'all' ? all : all.filter((m) => (m.mode || 'free') === mode)
}
export function getWaveSet(id) { return waveSets.get(id) || null }
/** 등록된 웨이브셋 전부. 밸런스 검사가 하나하나 하드코딩하지 않게 한다. */
export function listWaveSets() { return [...waveSets.entries()].map(([id, table]) => ({ id, table })) }
export function getEffect(kind) { return effects.get(kind) || null }
export function getEnemyAbility(kind) { return enemyAbilities.get(kind) || null }
export function getSpecial(id) { return specials.get(id) || null }
export function listSpecials() { return [...specials.values()].sort(byOrder) }
export function getSprite(key) { return sprites.get(key) || null }
export function getPose(name) { return poses.get(name) || null }
export function listPoses() { return [...poses.keys()] }
export function getFrameSet(key) { return frameSets.get(key) || null }
export function listFrameSets() { return [...frameSets.values()] }
export function getObjective(kind) { return objectives.get(kind) || null }
export function listObjectives() { return [...objectives.keys()] }
export function getChapter(id) { return chapters.get(id) || null }
export function listChapters() { return [...chapters.values()].sort(byOrder) }
export function getMapArt(id) { return mapArt.get(id) || null }
export function listMapArt() { return [...mapArt.values()] }
export function getProp(name) { return props.get(name) || null }
export function listProps() { return [...props.values()] }
export function getCombo(id) { return combos.get(id) || null }
export function listCombos() { return [...combos.values()] }
export function getPet(id) { return pets.get(id) || null }
export function listPets() { return [...pets.values()] }
export function listSpecialCombos() { return [...specialCombos.values()] }
export function listAchievements() { return [...achievements.values()].sort(byOrder) }
export function getChallenge(id) { return challenges.get(id) || null }
export function listChallenges() { return [...challenges.values()].sort(byOrder) }

/** 정렬된 맵 목록에서 다음 맵의 id (마지막 맵이면 null) — 클리어 시 해금에 쓴다. */
export function nextMapId(mapId) {
  const list = listMaps()
  const i = list.findIndex((m) => m.id === mapId)
  if (i < 0 || i === list.length - 1) return null
  return list[i + 1].id
}

// ---------------------------------------------------------------- 참조 무결성 검사

/**
 * 등록된 콘텐츠 전체의 참조 무결성을 검사한다. 부팅 시 1회 호출.
 * 잡아내는 것: 미등록 스프라이트/효과/웨이브셋/적 참조, 경로가 성립하지 않는 맵.
 * @returns {{towers:number, enemies:number, maps:number, waveSets:number, effects:number, sprites:number}}
 */
export function validateAll() {
  if (towers.size === 0) throw new ContentError('등록된 타워가 하나도 없습니다')
  if (enemies.size === 0) throw new ContentError('등록된 적이 하나도 없습니다')
  if (maps.size === 0) throw new ContentError('등록된 맵이 하나도 없습니다')

  for (const t of towers.values()) {
    if (!sprites.has(t.sprite)) {
      throw new ContentError(`타워 '${t.id}'이(가) 등록되지 않은 스프라이트 '${t.sprite}'을(를) 참조합니다`)
    }
    if (t.pose !== undefined && !poses.has(t.pose)) {
      throw new ContentError(
        `타워 '${t.id}'이(가) 등록되지 않은 공격 모션 '${t.pose}'을(를) 참조합니다. ` +
        `sprites.js에 registerPose('${t.pose}', ...)를 추가하세요. ` +
        `쓸 수 있는 모션: ${[...poses.keys()].join(', ') || '(없음)'}`,
      )
    }
    if (t.frames !== undefined && !frameSets.has(t.frames)) {
      throw new ContentError(
        `타워 '${t.id}'이(가) 등록되지 않은 프레임셋 '${t.frames}'을(를) 참조합니다. ` +
        `framesets.js에 registerFrameSet('${t.frames}', ...)를 추가하세요. ` +
        `쓸 수 있는 프레임셋: ${[...frameSets.keys()].join(', ') || '(없음)'}`,
      )
    }
    t.levels.forEach((lv, i) => {
      for (const fx of lv.effects || []) {
        if (!effects.has(fx.kind)) {
          throw new ContentError(
            `타워 '${t.id}' 레벨 ${i + 1}이(가) 등록되지 않은 효과 '${fx.kind}'을(를) 참조합니다. ` +
            `content/effects.js에 registerEffect('${fx.kind}', ...)를 추가하세요.`,
          )
        }
      }
    })
  }

  for (const e of enemies.values()) {
    if (!sprites.has(e.sprite)) {
      throw new ContentError(`적 '${e.id}'이(가) 등록되지 않은 스프라이트 '${e.sprite}'을(를) 참조합니다`)
    }
    if (e.frames !== undefined && !frameSets.has(e.frames)) {
      throw new ContentError(
        `적 '${e.id}'이(가) 등록되지 않은 프레임셋 '${e.frames}'을(를) 참조합니다. ` +
        `framesets.js에 registerFrameSet('${e.frames}', ...)를 추가하세요. ` +
        `쓸 수 있는 프레임셋: ${[...frameSets.keys()].join(', ') || '(없음)'}`,
      )
    }
    for (const ab of e.abilities || []) {
      if (!enemyAbilities.has(ab.kind)) {
        throw new ContentError(
          `적 '${e.id}'이(가) 등록되지 않은 능력 '${ab.kind}'을(를) 참조합니다. ` +
          `content/enemyAbilities.js에 registerEnemyAbility('${ab.kind}', ...)를 추가하세요.`,
        )
      }
      // 소환 능력은 실제로 존재하는 적을 불러야 한다
      if (ab.kind === 'summon' && ab.enemyId && !enemies.has(ab.enemyId)) {
        throw new ContentError(`적 '${e.id}'의 소환 능력이 등록되지 않은 적 '${ab.enemyId}'을(를) 부릅니다`)
      }
    }
  }

  for (const m of maps.values()) {
    if (m.art !== undefined && !mapArt.has(m.art)) {
      throw new ContentError(
        `맵 '${m.id}'이(가) 등록되지 않은 지도 아트 '${m.art}'을(를) 참조합니다. ` +
        `mapart.js에 registerMapArt('${m.art}', ...)를 추가하세요. ` +
        `쓸 수 있는 지도 아트: ${[...mapArt.keys()].join(', ') || '(없음)'}`,
      )
    }
    for (const name of m.props || []) {
      if (!props.has(name)) {
        throw new ContentError(
          `맵 '${m.id}'이(가) 등록되지 않은 소품 '${name}'을(를) 참조합니다. ` +
          `mapart.js에 registerProp('${name}', ...)를 추가하세요. ` +
          `쓸 수 있는 소품: ${[...props.keys()].join(', ') || '(없음)'}`,
        )
      }
    }
    if (!waveSets.has(m.waveSet)) {
      throw new ContentError(`맵 '${m.id}'이(가) 등록되지 않은 웨이브셋 '${m.waveSet}'을(를) 참조합니다`)
    }
    try {
      const path = buildPath(m)
      if (path.tiles.length === 0) {
        throw new ContentError(`맵 '${m.id}'의 경로가 격자 안을 전혀 지나가지 않습니다`)
      }
    } catch (err) {
      if (err instanceof PathError) {
        throw new ContentError(`맵 '${m.id}'의 경로가 잘못됐습니다 — ${err.message}`)
      }
      throw err
    }
  }

  for (const ex of expeditions.values()) {
    ex.stages.forEach((st, i) => {
      const sw = `원정 '${ex.id}' ${i + 1}칸`
      if (!maps.has(st.mapId)) throw new ContentError(`${sw}: 등록되지 않은 맵 '${st.mapId}'`)
      const table = waveSets.get(st.waveSet)
      if (!table) throw new ContentError(`${sw}: 등록되지 않은 웨이브셋 '${st.waveSet}'`)
      if (st.waveLimit > table.length) {
        throw new ContentError(`${sw}: waveLimit ${st.waveLimit} 이(가) 웨이브셋 '${st.waveSet}' 의 ${table.length}웨이브보다 깁니다`)
      }
    })
  }

  for (const ch of chapters.values()) {
    if (ch.rewards && ch.rewards.pet !== undefined && !pets.has(ch.rewards.pet)) {
      throw new ContentError(`챕터 '${ch.id}'의 보상 펫 '${ch.rewards.pet}'이(가) 등록돼 있지 않습니다`)
    }
    if (ch.rewards && ch.rewards.skin !== undefined && !skins.has(ch.rewards.skin)) {
      throw new ContentError(`챕터 '${ch.id}'의 보상 스킨 '${ch.rewards.skin}'이(가) 등록돼 있지 않습니다`)
    }
  }

  // ── 도전 ──────────────────────────────────────────────────
  for (const [id, c] of challenges) {
    for (const [from, to] of Object.entries(c.rules.replace || {})) {
      if (!enemies.has(from) || !enemies.has(to)) {
        throw new ContentError(`도전 '${id}'의 치환 '${from} → ${to}'이(가) 등록되지 않은 적을 가리킵니다`)
      }
    }
    for (const tid of c.rules.bannedTowers || []) {
      if (!towers.has(tid)) throw new ContentError(`도전 '${id}'이(가) 등록되지 않은 고양이 '${tid}'을(를) 금지합니다`)
    }
  }

  for (const [id, sc] of specialCombos) {
    for (const sid of [sc.from, sc.to]) {
      if (!specials.has(sid)) {
        throw new ContentError(
          `필살기 연계 '${id}'이(가) 등록되지 않은 필살기 '${sid}'을(를) 참조합니다. `
          + `content/specials.js 의 id 를 확인하세요.`)
      }
    }
  }

  for (const [id, combo] of combos) {
    for (const tid of combo.towers) {
      if (!towers.has(tid)) {
        throw new ContentError(
          `조합 '${id}'이(가) 등록되지 않은 고양이 '${tid}'을(를) 참조합니다. `
          + `content/towers.js 의 id 를 확인하세요.`)
      }
    }
  }

  for (const [id, table] of waveSets) {
    table.forEach((groups, wi) => {
      if (!Array.isArray(groups) || groups.length === 0) {
        throw new ContentError(`웨이브셋 '${id}'의 ${wi + 1}번째 웨이브가 비어 있습니다`)
      }
      for (const g of groups) {
        if (!Array.isArray(g) || g.length !== 4) {
          throw new ContentError(
            `웨이브셋 '${id}' 웨이브 ${wi + 1}: 그룹은 [적id, 마리수, 간격, 지연] 4개 항목이어야 합니다 (받은 값: ${JSON.stringify(g)})`,
          )
        }
        if (!enemies.has(g[0])) {
          throw new ContentError(`웨이브셋 '${id}' 웨이브 ${wi + 1}이(가) 등록되지 않은 적 '${g[0]}'을(를) 참조합니다`)
        }
      }
    })
  }

  // ── 시나리오 챕터 ──────────────────────────────────────────
  // 챕터는 맵·웨이브셋·목표·보상 타워·컷신 화자를 전부 id 로 가리킨다.
  // 하나라도 어긋나면 그 챕터를 눌렀을 때 게임이 죽으므로 부팅 때 전부 확인한다.
  const seenOrder = new Map()
  for (const ch of chapters.values()) {
    const where = `챕터 '${ch.id}'`
    if (!maps.has(ch.mapId)) {
      throw new ContentError(`${where}이(가) 등록되지 않은 맵 '${ch.mapId}'을(를) 참조합니다`)
    }
    if (!waveSets.has(ch.waveSet)) {
      throw new ContentError(`${where}이(가) 등록되지 않은 웨이브셋 '${ch.waveSet}'을(를) 참조합니다`)
    }
    if (ch.waveLimit && ch.waveLimit > waveSets.get(ch.waveSet).length) {
      throw new ContentError(
        `${where}의 waveLimit ${ch.waveLimit}이(가) 웨이브셋 '${ch.waveSet}'의 ` +
        `${waveSets.get(ch.waveSet).length}웨이브보다 큽니다`,
      )
    }
    if (seenOrder.has(ch.order)) {
      throw new ContentError(`${where}의 order ${ch.order}이(가) 챕터 '${seenOrder.get(ch.order)}'와 겹칩니다`)
    }
    seenOrder.set(ch.order, ch.id)

    for (const spec of [ch.primary, ...ch.bonus]) {
      const obj = objectives.get(spec.kind)
      if (!obj) {
        throw new ContentError(
          `${where}이(가) 등록되지 않은 목표 '${spec.kind}'을(를) 참조합니다. ` +
          `content/objectives.js에 registerObjective('${spec.kind}', ...)를 추가하세요. ` +
          `쓸 수 있는 목표: ${[...objectives.keys()].join(', ') || '(없음)'}`,
        )
      }
      for (const field of obj.requires) {
        if (spec[field] === undefined) {
          throw new ContentError(`${where}의 목표 '${spec.kind}'에 '${field}'이(가) 빠졌습니다`)
        }
      }
      // 타워 id 를 담는 목표는 그 id 들도 실제로 있어야 한다
      for (const id of spec.ids || []) {
        if (!towers.has(id)) {
          throw new ContentError(`${where}의 목표 '${spec.kind}'이(가) 등록되지 않은 타워 '${id}'을(를) 가리킵니다`)
        }
      }
      if (spec.enemyId !== undefined && !enemies.has(spec.enemyId)) {
        throw new ContentError(`${where}의 목표 '${spec.kind}'이(가) 등록되지 않은 적 '${spec.enemyId}'을(를) 가리킵니다`)
      }
      if (spec.comboId !== undefined && !combos.has(spec.comboId)) {
        throw new ContentError(`${where}의 목표 '${spec.kind}'이(가) 등록되지 않은 조합 '${spec.comboId}'을(를) 가리킵니다`)
      }
    }

    if (ch.rewards.tower !== undefined && !towers.has(ch.rewards.tower)) {
      throw new ContentError(`${where}의 보상이 등록되지 않은 타워 '${ch.rewards.tower}'을(를) 줍니다`)
    }
    // 컷신은 화자의 그림을 그린다. 없는 id 면 빈 칸이 뜬다.
    for (const card of [...ch.intro, ...ch.outro]) {
      if (!towers.has(card.who) && !enemies.has(card.who)) {
        throw new ContentError(
          `${where}의 컷신 화자 '${card.who}'이(가) 타워도 적도 아닙니다 (그림을 그릴 수 없습니다)`,
        )
      }
    }
  }

  // 스킨: 고양이가 있어야 하고, 그림 스킨은 원본 프레임셋과 같은 격자여야 한다(그리는 쪽이 원본 격자로 자른다)
  for (const sk of skins.values()) {
    const tower = towers.get(sk.towerId)
    if (!tower) throw new ContentError(`스킨 '${sk.id}'이(가) 등록되지 않은 고양이 '${sk.towerId}'을(를) 가리킵니다`)
    if (sk.look.frames) {
      const alt = frameSets.get(sk.look.frames)
      if (!alt) throw new ContentError(`스킨 '${sk.id}'의 프레임셋 '${sk.look.frames}'이(가) 등록돼 있지 않습니다`)
      const base = tower.frames ? frameSets.get(tower.frames) : null
      if (!base) throw new ContentError(`스킨 '${sk.id}': 고양이 '${sk.towerId}'에 원본 프레임셋이 없어 그림 스킨을 붙일 수 없습니다`)
      if (alt.frames !== base.frames || alt.w !== base.w || alt.h !== base.h) {
        throw new ContentError(`스킨 '${sk.id}'의 프레임셋 격자(${alt.frames}×${alt.w}×${alt.h})가 원본(${base.frames}×${base.w}×${base.h})과 다릅니다`)
      }
    }
  }

  return {
    towers: towers.size,
    enemies: enemies.size,
    maps: maps.size,
    waveSets: waveSets.size,
    effects: effects.size,
    sprites: sprites.size,
    enemyAbilities: enemyAbilities.size,
    specials: specials.size,
    poses: poses.size,
    frameSets: frameSets.size,
    objectives: objectives.size,
    chapters: chapters.size,
    mapArt: mapArt.size,
    props: props.size,
    combos: combos.size,
    pets: pets.size,
    specialCombos: specialCombos.size,
    achievements: achievements.size,
    challenges: challenges.size,
    skins: skins.size,
    expeditions: expeditions.size,
  }
}
