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

/** 테스트에서 레지스트리를 격리하기 위한 초기화 */
export function resetRegistry() {
  towers.clear(); enemies.clear(); maps.clear()
  waveSets.clear(); effects.clear(); sprites.clear()
  enemyAbilities.clear(); specials.clear()
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
  requireNumber(def, 'baseHp', where, { min: 1 })
  requireNumber(def, 'speed', where, { min: 0.01 })
  requireNumber(def, 'armor', where, { min: 0 })
  requireNumber(def, 'gold', where, { min: 0 })
  requireNumber(def, 'size', where, { min: 0.05, max: 2 })
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
  requireNumber(def, 'difficulty', where, { min: 0.1 })
  requireNumber(def, 'startGold', where, { min: 0 })
  requireNumber(def, 'startLives', where, { min: 1 })
  if (!def.theme || typeof def.theme !== 'object') {
    throw new ContentError(`${where}: 'theme' 객체가 필요합니다`)
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
  if (typeof handler.onHit !== 'function' && typeof handler.onFire !== 'function') {
    throw new ContentError(`효과 '${kind}': onHit 또는 onFire 중 최소 하나는 함수여야 합니다`)
  }
  effects.set(kind, handler)
  return handler
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
  requireNumber(def, 'catnip', where, { min: 0 })
  if (typeof def.run !== 'function') {
    throw new ContentError(`${where}: 'run(ctx)' 함수가 필요합니다`)
  }
  specials.set(def.id, def)
  return def
}

/** 캔버스 드로잉 함수를 등록한다. drawFn(ctx, opts) */
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
export function getEnemy(id) { return enemies.get(id) || null }
export function listEnemies() { return [...enemies.values()] }
export function getMap(id) { return maps.get(id) || null }
export function listMaps() { return [...maps.values()].sort(byOrder) }
export function getWaveSet(id) { return waveSets.get(id) || null }
export function getEffect(kind) { return effects.get(kind) || null }
export function getEnemyAbility(kind) { return enemyAbilities.get(kind) || null }
export function getSpecial(id) { return specials.get(id) || null }
export function listSpecials() { return [...specials.values()].sort(byOrder) }
export function getSprite(key) { return sprites.get(key) || null }

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

  return {
    towers: towers.size,
    enemies: enemies.size,
    maps: maps.size,
    waveSets: waveSets.size,
    effects: effects.size,
    sprites: sprites.size,
    enemyAbilities: enemyAbilities.size,
    specials: specials.size,
  }
}
