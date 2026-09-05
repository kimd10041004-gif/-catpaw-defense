/**
 * 진행도 저장/불러오기 — 버전과 마이그레이션을 처음부터 넣어둔다.
 * 나중에 맵이나 기능을 추가해도 기존 저장 데이터가 깨지지 않게 하는 것이 목적이다.
 */

import { normalizeSettings } from './settings.js'

/** 현재 저장 포맷 버전. 구조를 바꿀 때마다 올리고 migrate에 단계를 추가한다. */
export const SAVE_VERSION = 5

/** localStorage 키 */
export const SAVE_KEY = 'catpaw.progress'
/** 읽을 수 없는 저장 데이터를 버리지 않고 옮겨두는 백업 키 (사용자 데이터 무손실) */
export const BACKUP_KEY = 'catpaw.progress.backup'

/**
 * 자유 모드에서 다음 맵이 열리는 도달 웨이브. 클리어(30웨이브 전부)만 인정하던 때는
 * 치즈냥만 쓰는 자동 플레이어가 첫 맵 클리어율 0% 였다 — 두 번째 맵을 영영 못 보는
 * 사람이 대부분이라는 뜻이고, 그건 잠금이 아니라 함정이다.
 */
export const MAP_UNLOCK_WAVE = 20

/** 평생 누적 기록의 빈 값. 모든 모드(자유·시나리오·무한·도전)의 판이 여기에 더해진다. */
export function defaultStats() {
  return {
    runs: 0, wins: 0, wavesReached: 0, killed: 0, leaked: 0, goldEarned: 0, damageDealt: 0,
    bossesKilled: 0, crits: 0, specialsUsed: 0, towersBuilt: 0, towersSold: 0, upgradesBought: 0,
    playSec: 0, catnipEarned: 0, revives: 0, endlessWaves: 0,
    bossKills: {},        // { 보스id: 처치 수 }
    towerUse: {},         // { 고양이id: 데려간 판 수 }
    firstPlayedAt: 0, lastPlayedAt: 0,
  }
}

/** 처음 시작할 때의 진행도. 첫 맵만 열려 있고 캣닢은 조금 준다. */
export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    unlockedMaps: ['alley'],
    bestWave: {},
    clears: {},
    catnip: 30,          // 필살기 한 번은 눌러볼 수 있게 주고 시작한다
    purchases: [],       // 결제 영수증 기록 (중복 적용 방지용 token 포함)
    premium: false,      // 프리미엄 팩 구매 여부
    scenario: { stars: {} },              // { 챕터id: 별 0~3 }
    unlockedTowers: [...STARTING_TOWERS], // 나머지는 시나리오 보상으로 풀린다
    pets: { owned: [...STARTING_PETS], equipped: STARTING_PETS[0] },
    combosSeen: [],                       // 만들어 본 고양이 조합 (도감 해금)
    hintsSeen: [],                        // 한 번 보여준 첫 판 안내 id
    stats: defaultStats(),                // 평생 기록
    achievements: { unlocked: {} },       // { 업적id: 달성 시각(ms) }
    daily: { lastClaim: null, streak: 0 }, // 출석 ('YYYY-MM-DD', 연속 0~7)
    endless: { best: {} },                // { 맵id: 표 밖에서 버틴 웨이브 수 }
    challenge: { best: {}, clears: {} },  // 키 `${맵id}:${도전id}`
    settings: normalizeSettings(null),
  }
}

/**
 * 처음부터 쓸 수 있는 고양이. 나머지 3마리는 시나리오 보상이다.
 *
 * 자유 모드만 하던 사람에게서 쓰던 고양이를 빼앗으면 안 되므로, v2 → v3
 * 마이그레이션은 진행 기록이 있으면 전부 열어준 채로 올린다.
 */
export const STARTING_TOWERS = ['cheese', 'calico']

/**
 * 처음부터 데리고 있는 펫. 하나는 공짜로 줘야 펫이라는 게 있다는 걸 안다.
 * 나머지는 캣닢으로 산다.
 */
export const STARTING_PETS = ['hamster']

/**
 * 어떤 형태로 저장돼 있든 현재 버전의 진행도로 끌어올린다.
 * @param {any} raw 파싱된 저장 객체 (없으면 null)
 * @returns {{progress:object, migrated:boolean, reason:string|null}}
 */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { progress: defaultProgress(), migrated: false, reason: '저장 데이터 없음' }
  }

  const version = Number.isInteger(raw.version) ? raw.version : 0

  // 미래 버전은 이 코드가 해석할 수 없다. 덮어쓰지 말고 기본값으로 시작한다.
  if (version > SAVE_VERSION) {
    return {
      progress: defaultProgress(),
      migrated: false,
      reason: `저장 데이터가 더 최신 버전입니다 (v${version} > v${SAVE_VERSION})`,
    }
  }

  let cur = { ...raw }
  let migrated = false

  // --- v0 → v1 : 버전 필드가 없던 초기 데이터 ---
  if (version < 1) {
    cur = {
      version: 1,
      unlockedMaps: Array.isArray(cur.unlockedMaps) ? cur.unlockedMaps : ['alley'],
      bestWave: cur.bestWave && typeof cur.bestWave === 'object' ? cur.bestWave : {},
      clears: cur.clears && typeof cur.clears === 'object' ? cur.clears : {},
      settings: cur.settings,
    }
    migrated = true
  }

  // --- v1 → v2 : 캣닢/결제 필드 추가 ---
  if (version < 2) {
    cur = {
      ...cur,
      version: 2,
      catnip: typeof cur.catnip === 'number' ? cur.catnip : 30,
      purchases: Array.isArray(cur.purchases) ? cur.purchases : [],
      premium: cur.premium === true,
    }
    migrated = true
  }

  // --- v2 → v3 : 시나리오 별 기록 + 고양이 해금 목록 추가 ---
  // 다음 버전을 추가할 때는 아래에 `if (version < 4) { ... }` 블록을 이어 붙이고,
  // ★ 마지막 정규화 단계(아래 progress 객체)에도 새 필드를 반드시 넣는다.
  //   안 넣으면 마이그레이션은 통과하는데 값이 조용히 사라진다.
  if (version < 3) {
    // 이미 자유 모드를 하고 있었다면 다섯 마리를 다 쓰고 있었다. 되돌리면 안 된다.
    const hadProgress = cur.bestWave && Object.keys(cur.bestWave).length > 0
    cur = {
      ...cur,
      version: 3,
      scenario: { stars: {} },
      unlockedTowers: hadProgress ? null : [...STARTING_TOWERS],
      // null = '전부 열림'. 아래 sanitizeTowerList 가 등록된 타워 전체로 채운다.
    }
    migrated = true
  }

  // --- v3 → v4 : 펫과 조합 도감 추가 ---
  if (version < 4) {
    cur = {
      ...cur,
      version: 4,
      pets: { owned: [...STARTING_PETS], equipped: STARTING_PETS[0] },
      combosSeen: [],
    }
    migrated = true
  }

  // --- v4 → v5 : 첫 판 안내 · 평생 기록 · 업적 · 출석 · 무한 · 도전 ---
  // 전부 비어 있어도 게임이 돈다. 값은 각 기능이 판이 끝날 때마다 채운다.
  if (version < 5) {
    cur = {
      ...cur,
      version: 5,
      hintsSeen: [],
      stats: defaultStats(),
      achievements: { unlocked: {} },
      daily: { lastClaim: null, streak: 0 },
      endless: { best: {} },
      challenge: { best: {}, clears: {} },
    }
    migrated = true
  }

  const base = defaultProgress()
  const progress = {
    version: SAVE_VERSION,
    unlockedMaps: sanitizeMapList(cur.unlockedMaps, base.unlockedMaps),
    bestWave: sanitizeNumberMap(cur.bestWave),
    clears: sanitizeNumberMap(cur.clears),
    catnip: sanitizeCount(cur.catnip, base.catnip),
    purchases: sanitizePurchases(cur.purchases),
    premium: cur.premium === true,
    scenario: sanitizeScenario(cur.scenario),
    unlockedTowers: sanitizeTowerList(cur.unlockedTowers, base.unlockedTowers),
    // 새 필드를 여기 안 넣으면 마이그레이션이 만들어 준 값이 저장 한 번에 사라진다.
    // v3 때 실제로 그렇게 날린 적이 있다.
    pets: sanitizePets(cur.pets, base.pets),
    combosSeen: sanitizeIdList(cur.combosSeen),
    hintsSeen: sanitizeIdList(cur.hintsSeen),
    stats: sanitizeStats(cur.stats),
    achievements: sanitizeAchievements(cur.achievements),
    daily: sanitizeDaily(cur.daily),
    endless: { best: sanitizeNumberMap(cur.endless && cur.endless.best) },
    challenge: {
      best: sanitizeNumberMap(cur.challenge && cur.challenge.best),
      clears: sanitizeNumberMap(cur.challenge && cur.challenge.clears),
    },
    settings: normalizeSettings(cur.settings),
  }
  return { progress, migrated, reason: null }
}

/** 문자열 id 만 남기고 중복을 없앤다. */
function sanitizeIdList(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((v) => typeof v === 'string' && v.length > 0))]
}

/**
 * 펫 보유/장착 상태.
 *
 * equipped 가 owned 에 없으면 owned 의 첫 마리로 되돌린다 — 펫을 콘텐츠에서 빼거나
 * 저장이 손상되면 "없는 펫을 낀 상태"가 되어 판이 시작될 때마다 조용히 아무 효과도
 * 안 난다. 그러면 사용자는 원인을 알 방법이 없다.
 */
function sanitizePets(value, fallback) {
  const owned = sanitizeIdList(value && value.owned)
  const list = owned.length > 0 ? owned : [...fallback.owned]
  const wanted = value && typeof value.equipped === 'string' ? value.equipped : null
  return { owned: list, equipped: list.includes(wanted) ? wanted : list[0] }
}

/** 음수·NaN·문자열을 막고 0 이상의 정수로 만든다. */
function sanitizeCount(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/** 영수증 배열에서 형식이 맞는 것만 남긴다 (중복 적용 방지의 근거가 되므로 token은 필수). */
function sanitizePurchases(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && typeof p === 'object' && typeof p.sku === 'string' && typeof p.token === 'string')
    .map((p) => ({
      productId: String(p.productId || ''),
      sku: p.sku,
      token: p.token,
      mock: p.mock === true,
      at: Number.isFinite(Number(p.at)) ? Number(p.at) : 0,
    }))
}

/**
 * 해금된 고양이 목록. sanitizeMapList 와 같은 패턴이되 null 을 특별히 다룬다.
 *
 * null 은 v2 → v3 마이그레이션이 남기는 '전부 열림' 표시다. 자유 모드에서 이미
 * 다섯 마리를 쓰던 사람에게서 고양이를 빼앗지 않기 위한 것이라, 여기서 ALL_TOWERS
 * 대신 빈 배열이나 기본값으로 떨어지면 그 사람은 고양이 세 마리를 잃는다.
 */
function sanitizeTowerList(list, fallback) {
  if (list === null) return [...ALL_TOWERS]
  if (!Array.isArray(list)) return [...fallback]
  const out = list.filter((v) => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? Array.from(new Set(out)) : [...fallback]
}

/**
 * '전부 열림'이 가리키는 목록. 레지스트리를 import 하면 domain 이 content 에
 * 의존하게 되므로, main.js 가 부팅 때 등록된 타워 id 를 넣어준다.
 * 넣지 않으면 다섯 마리를 하드코딩한 기본값이 쓰인다.
 */
let ALL_TOWERS = ['cheese', 'calico', 'siamese', 'black', 'chonk']
export function setAllTowerIds(ids) {
  if (Array.isArray(ids) && ids.length > 0) ALL_TOWERS = [...ids]
}

/** { 챕터id: 별 0~3 } 만 남긴다. */
function sanitizeScenario(obj) {
  const stars = {}
  const src = obj && typeof obj === 'object' ? obj.stars : null
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      // Number(null) 은 0 이다. 그냥 Number() 로 받으면 null 이 '0별 기록'으로
      // 둔갑해서 없는 챕터가 목록에 생긴다.
      const n = typeof v === 'number' ? v
        : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN)
      if (typeof k === 'string' && Number.isFinite(n) && n >= 0) stars[k] = Math.min(3, Math.floor(n))
    }
  }
  return { stars }
}

/** 문자열 맵 id만 남긴다. 비면 기본값. */
function sanitizeMapList(list, fallback) {
  if (!Array.isArray(list)) return [...fallback]
  const out = list.filter((v) => typeof v === 'string' && v.length > 0)
  return out.length > 0 ? Array.from(new Set(out)) : [...fallback]
}

/** { 맵id: 숫자 } 형태만 남긴다 (음수·NaN·문자열 방어). */
function sanitizeNumberMap(obj) {
  const out = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(v)
    if (typeof k === 'string' && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n)
  }
  return out
}

/** 평생 기록. 아는 키만 남기고 음수·NaN·모르는 키는 버린다. */
function sanitizeStats(raw) {
  const base = defaultStats()
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = { ...base }
  for (const k of Object.keys(base)) {
    out[k] = (k === 'bossKills' || k === 'towerUse')
      ? sanitizeNumberMap(src[k])
      : sanitizeCount(src[k], base[k])
  }
  return out
}

/** { 업적id: 달성 시각 } — 문자열 id 와 0 이상의 유한한 시각만 남긴다. */
function sanitizeAchievements(raw) {
  const src = raw && typeof raw === 'object' ? raw.unlocked : null
  return { unlocked: sanitizeNumberMap(src) }
}

/** 출석. 날짜는 'YYYY-MM-DD' 꼴만, 연속 일수는 0~7 정수만. */
export const DAILY_STREAK_MAX = 7
function sanitizeDaily(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const lastClaim = typeof src.lastClaim === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.lastClaim)
    ? src.lastClaim : null
  return { lastClaim, streak: Math.min(DAILY_STREAK_MAX, sanitizeCount(src.streak, 0)) }
}

/**
 * 저장소에서 진행도를 읽는다. 손상됐으면 원본을 백업 키로 옮기고 기본값으로 시작한다.
 * @param {{getItem:Function, setItem:Function}} storage localStorage 호환 객체
 */
export function loadProgress(storage) {
  if (!storage) return defaultProgress()
  let text = null
  try {
    text = storage.getItem(SAVE_KEY)
  } catch {
    return defaultProgress() // 사생활 보호 모드 등으로 접근이 막힌 경우
  }
  if (!text) return defaultProgress()

  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    backup(storage, text)
    return defaultProgress()
  }

  const { progress, reason } = migrate(parsed)
  if (reason) backup(storage, text)
  return progress
}

/** 해석할 수 없는 원본을 백업해둔다 (덮어쓰기 전에 반드시 호출). */
function backup(storage, text) {
  try {
    storage.setItem(BACKUP_KEY, text)
  } catch { /* 백업 실패는 치명적이지 않으므로 무시한다 */ }
}

/** 진행도를 저장한다. 실패해도 게임은 계속 돌아가야 하므로 예외를 밖으로 던지지 않는다. */
export function saveProgress(storage, progress) {
  if (!storage) return false
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...progress, version: SAVE_VERSION }))
    return true
  } catch {
    return false
  }
}

/**
 * 한 판이 끝났을 때 진행도를 갱신한다 (제자리 변경 없이 새 객체 반환).
 * @param {object} progress 현재 진행도
 * @param {string} mapId 방금 플레이한 맵
 * @param {number} reachedWave 도달한 웨이브
 * @param {boolean} cleared 클리어 여부
 * @param {string|null} nextMapId 클리어 시 해금할 다음 맵 (없으면 null)
 */
export function recordResult(progress, mapId, reachedWave, cleared, nextMapId = null) {
  const bestWave = { ...progress.bestWave }
  bestWave[mapId] = Math.max(bestWave[mapId] || 0, reachedWave)

  const clears = { ...progress.clears }
  if (cleared) clears[mapId] = (clears[mapId] || 0) + 1

  const unlockedMaps = [...progress.unlockedMaps]
  // 클리어하거나 MAP_UNLOCK_WAVE 까지 버티면 다음 맵이 열린다 (상수의 주석 참고)
  const opened = cleared || reachedWave >= MAP_UNLOCK_WAVE
  if (opened && nextMapId && !unlockedMaps.includes(nextMapId)) unlockedMaps.push(nextMapId)

  return { ...progress, bestWave, clears, unlockedMaps }
}

/**
 * 캣닢을 더한다 (음수면 차감). 0 아래로는 내려가지 않는다.
 * @returns {object} 새 진행도
 */
export function addCatnip(progress, amount) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n === 0) return progress
  return { ...progress, catnip: Math.max(0, (progress.catnip || 0) + Math.round(n)) }
}

/**
 * 시나리오 챕터 결과를 기록한다 (제자리 변경 없이 새 객체 반환).
 *
 * recordResult 를 부르지 않는다는 점이 중요하다. waveLimit 6짜리 챕터가 그 맵의
 * bestWave 를 6으로 써버리면 자유 모드 기록이 부정확해지고, unlockedMaps 도
 * 시나리오가 건드리면 자유 모드 해금 순서가 뒤엉킨다.
 *
 * @param {object} progress 현재 진행도
 * @param {string} chapterId 방금 끝낸 챕터
 * @param {number} stars 0~3
 * @param {{catnip?:number, tower?:string}} rewards 챕터 보상
 * @param {string|null} mapId 그 장의 맵. 별을 하나라도 땄으면 자유 모드에서도 이 맵이 열린다 —
 *   시나리오가 이미 그 맵을 가르쳤는데 자유 모드에서 앞 맵부터 다시 깨라는 건 이중 잠금이다.
 *   **다음 맵은 건드리지 않는다.** 그래야 자유 모드 해금 순서가 안 뒤엉킨다.
 * @returns {{progress:object, gained:{catnip:number, tower:string|null}}}
 *          이미 받은 보상은 다시 주지 않으므로 gained 로 실제 지급분을 알려준다.
 */
export function recordChapter(progress, chapterId, stars, rewards = {}, mapId = null) {
  const prev = (progress.scenario && progress.scenario.stars[chapterId]) || 0
  const best = Math.max(prev, Math.min(3, Math.max(0, Math.floor(stars) || 0)))
  const scenario = { stars: { ...(progress.scenario || {}).stars, [chapterId]: best } }

  // 보상은 처음 깼을 때 한 번만. 별을 더 따려고 다시 도는 것을 캣닢 농사로 만들면 안 된다.
  const first = prev === 0 && best > 0
  const gained = { catnip: 0, tower: null }
  let next = { ...progress, scenario }

  if (first && rewards.catnip) {
    gained.catnip = rewards.catnip
    next = addCatnip(next, rewards.catnip)
  }
  if (first && rewards.tower && !(progress.unlockedTowers || []).includes(rewards.tower)) {
    gained.tower = rewards.tower
    next = { ...next, unlockedTowers: [...(progress.unlockedTowers || []), rewards.tower] }
  }
  if (best > 0 && typeof mapId === 'string' && !(progress.unlockedMaps || []).includes(mapId)) {
    next = { ...next, unlockedMaps: [...(progress.unlockedMaps || []), mapId] }
  }
  return { progress: next, gained }
}

/** accountRun 이 summary 에서 그대로 더하는 숫자들 (delta 로) */
const RUN_SUM_KEYS = [
  'killed', 'leaked', 'goldEarned', 'damageDealt', 'bossesKilled', 'crits', 'specialsUsed',
  'towersBuilt', 'towersSold', 'upgradesBought', 'catnipEarned', 'revives',
]
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/**
 * 한 판의 summary 를 평생 기록에 더한다 (제자리 변경 없이 새 객체 반환).
 *
 * **같은 판을 두 번 반영해도 두 번 세지 않는다.** 승리하면 _endRun 이 저장하고,
 * 결과 시트의 '맵 선택으로' 가 또 저장한다 — 실제로 clears 가 판마다 두 번 오르고
 * 있었다. 그래서 '이미 반영한 summary(prev)' 를 받아 **그 뒤로 늘어난 만큼만** 더한다.
 * 이어하기로 판이 계속된 경우도 같은 규칙으로 차분만 들어간다.
 *
 * @param {object} progress
 * @param {object} summary  Game.summary()
 * @param {object|null} prev 이 판에서 직전에 반영한 summary (없으면 null = 새 판)
 * @param {number} now 시각(ms)
 * @returns {{progress:object}}
 */
export function accountRun(progress, summary, prev = null, now = Date.now()) {
  if (!summary || typeof summary !== 'object') return { progress }
  const before = progress.stats || defaultStats()
  const stats = { ...defaultStats(), ...before, bossKills: { ...before.bossKills }, towerUse: { ...before.towerUse } }
  const d = (k) => Math.max(0, num(summary[k]) - (prev ? num(prev[k]) : 0))

  if (!prev) stats.runs += 1
  if (summary.cleared && !(prev && prev.cleared)) stats.wins += 1
  stats.wavesReached += d('reachedWave')
  for (const k of RUN_SUM_KEYS) stats[k] += d(k)
  stats.playSec += d('elapsed')
  stats.endlessWaves += d('endlessWaves')

  const cur = summary.bossKillCounts || {}
  const was = (prev && prev.bossKillCounts) || {}
  for (const [id, n] of Object.entries(cur)) {
    const delta = num(n) - num(was[id])
    if (delta > 0) stats.bossKills[id] = (stats.bossKills[id] || 0) + delta
  }
  // 데려간 고양이는 판당 한 번만 센다
  const usedBefore = new Set((prev && prev.towerIdsUsed) || [])
  for (const id of summary.towerIdsUsed || []) {
    if (typeof id === 'string' && !usedBefore.has(id)) stats.towerUse[id] = (stats.towerUse[id] || 0) + 1
  }
  for (const k of RUN_SUM_KEYS) stats[k] = Math.round(stats[k])
  stats.wavesReached = Math.round(stats.wavesReached)
  stats.playSec = Math.round(stats.playSec)
  stats.endlessWaves = Math.round(stats.endlessWaves)
  if (!stats.firstPlayedAt) stats.firstPlayedAt = now
  stats.lastPlayedAt = now
  return { progress: { ...progress, stats } }
}

/** 무한 모드에서 표 밖으로 버틴 웨이브 수의 최고 기록. */
export function recordEndless(progress, mapId, waves) {
  const n = Math.max(0, Math.floor(num(waves)))
  const best = { ...((progress.endless && progress.endless.best) || {}) }
  best[mapId] = Math.max(best[mapId] || 0, n)
  return { ...progress, endless: { best } }
}

/** 챕터를 열 수 있는가 — 1장은 항상 열려 있고, 그 다음은 앞 장을 깨야 한다. */
export function isChapterUnlocked(progress, chapter, chapters) {
  if (chapter.order <= 1) return true
  const prev = chapters.find((c) => c.order === chapter.order - 1)
  if (!prev) return true
  return ((progress.scenario || { stars: {} }).stars[prev.id] || 0) > 0
}
