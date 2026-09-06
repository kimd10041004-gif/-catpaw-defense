/**
 * DOM UI — 화면 전환, HUD, 상점, 타워 패널, 설정, 도감, 결과.
 *
 * 설정 화면과 도감은 손으로 쓰지 않고 데이터에서 생성한다:
 *   설정 = SETTINGS_SCHEMA 순회 / 도감 = 레지스트리 순회
 * 그래서 콘텐츠나 설정을 추가해도 이 파일은 그대로 둬도 된다.
 */

import {
  listTowers, listEnemies, listMaps, listChapters, listCombos, listPets,
  listSpecials, listSpecialCombos, listAchievements, listChallenges,
  getObjective, getTower, getEnemy, getMap, getWaveSet, getChallenge, describeEffect, describeAbility,
  getSkin, listSkins, listExpeditions, getExpedition,
} from './content/registry.js'
import { achievementProgress } from './domain/achievements.js'
import { drawUnit, getFrameImage, onFrameSetsReady } from './framesets.js'
import { SETTINGS_SCHEMA, settingsGroups } from './domain/settings.js'
import { buildPath } from './domain/path.js'
import { TARGET_MODE_LABELS } from './domain/targeting.js'
import { buildCost } from './domain/economy.js'
import { availableItems, IAP_PRODUCTS, catnipItem } from './domain/shop.js'
import { isChapterUnlocked, MAP_UNLOCK_WAVE } from './domain/save.js'
import { summarizeWave, waveCount } from './domain/waves.js'
import { growthRank, canTrain, GROWTH_MAX, GROWTH_DAMAGE_PER_RANK, totalRanks } from './domain/growth.js'
import { weekKey, weeklyPick, daysLeft, WEEKLY_REWARD } from './domain/weekly.js'
import { hasPack, hasAct, ownsGrants } from './domain/entitlements.js'
import { productForPack, productForAct, productForSkin } from './domain/shop.js'
import { evaluateObjectives, MAX_STARS } from './domain/objectives.js'
import { tr, locale } from './i18n/index.js'
import { DEMO, FULL_APP_URL } from './build.js'
import { ELEMENTS, ELEMENT_NAMES, ELEMENT_LOOK, beats, beatenBy } from './domain/elements.js'
import { disclosureRows, PITY_AT, SHARDS_PER_CARD } from './domain/gacha.js'
import {
  cardCount, runeCount, shardCount, ticketCount, canDraw, canExchange, canEquipRune,
} from './domain/cards.js'
import {
  DECK_SIZE, ownedCats, canEnter, towerElement, deckMatch, matchElement, stageBossIds, reachedStage, isCleared, savedDeck,
  currentExpedition,
} from './domain/expedition.js'

const $ = (id) => document.getElementById(id)

/** 타워의 표적 종류 문구. 상점 카드·타워 패널·도감이 같은 말을 쓴다. */
/** 훈련 단계 핍 — 도감·상점 카드가 같은 모양을 쓴다 */
function rankPips(rank) {
  const wrap = el('span', 'rank-pips')
  wrap.title = tr('훈련 {rank}단계', { rank: rank })
  for (let i = 0; i < GROWTH_MAX; i += 1) wrap.appendChild(el('i', `pip${i < rank ? ' on' : ''}`))
  return wrap
}

const targetsLabel = (def) => (
  def.targets === 'ground' ? tr('지상 전용') : def.targets === 'air' ? tr('공중 전용') : tr('지상+공중')
)

/**
 * 속성 배지. 상성은 원정에서만 걸리지만 배지는 늘 보인다 — 어느 고양이가 무슨 속성인지
 * 미리 알아야 원정 덱을 짤 수 있고, 도감이 그걸 보는 곳이다.
 */
/** 칸이 들고 있는 도전 규칙을 사람 말로. 들어가기 전에 보여 줘야 하는 것이다. */
const stageRuleText = (stage) => {
  const r = (stage && stage.rules) || {}
  const parts = []
  if (r.armorAdd) parts.push(tr('장갑 +{n}', { n: r.armorAdd }))
  if (r.noSell) parts.push(tr('판매 금지'))
  if (r.noSpecials) parts.push(tr('필살기 없이'))
  if (r.maxTowers) parts.push(tr('{n}마리까지', { n: r.maxTowers }))
  if (r.speedMul) parts.push(tr('적 이동 ×{v}', { v: r.speedMul }))
  if (r.bossCountMul) parts.push(tr('보스 ×{v}', { v: r.bossCountMul }))
  return parts.join(' · ')
}

const elementBadge = (element) => {
  const look = ELEMENT_LOOK[element]
  if (!look) return null
  const n = el('span', 'element-badge')
  n.textContent = `${look.glyph} ${tr(ELEMENT_NAMES[element])}`
  n.style.color = look.color
  n.title = tr('속성 — 원정에서 상성이 걸린다')
  return n
}

/**
 * 인라인 SVG 아이콘. 이모지를 쓰면 기기마다 모양·크기·색이 달라져 UI가 들쭉날쭉해진다.
 * index.html 의 <symbol id="ic-..."> 를 참조하고 색은 currentColor 를 따른다.
 */
const icon = (name, cls = 'i') => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#ic-${name}`)
  svg.appendChild(use)
  return svg
}

/**
 * 콘텐츠가 준 icon 값을 노드로. 'svg:이름'이면 인라인 SVG, 아니면 이모지 문자열.
 * 기본 콘텐츠는 전부 SVG를 쓴다 — 이모지는 기기·폰트에 따라 흑백으로 뜨거나
 * 크기가 제각각이라 화면이 들쭉날쭉해진다.
 */
const iconOf = (value) => (
  typeof value === 'string' && value.startsWith('svg:')
    ? icon(value.slice(4))
    : document.createTextNode(String(value ?? ''))
)

/** 캣닢 표기 */
const catnipTag = (amount, cls = 'cost') => {
  const n = el('span', cls)
  n.appendChild(icon('leaf'))
  n.appendChild(el('b', 'num', String(amount)))
  return n
}

/** 골드 표기 — 아이콘 + 숫자를 한 덩어리로 */
const goldTag = (amount, cls = 'cost') => {
  const n = el('span', cls)
  n.appendChild(icon('coin'))
  n.appendChild(el('b', 'num', String(amount)))
  return n
}
/** 소수점 첫째 자리까지만. 버프가 걸리면 12 가 13.44 가 되는데 그대로 쓰면 안 읽힌다. */
const round1 = (v) => String(Math.round(v * 10) / 10)

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

/** 타워/적 하나를 그린 작은 캔버스 (상점 카드·도감 썸네일) */
/**
 * 정의(def)를 작은 캔버스에 그려 돌려준다. 상점 카드·도감·타워 패널이 쓴다.
 *
 * def 를 통째로 받는 이유: 프레임 아트가 있으면 그림으로, 없으면 벡터로 그리는
 * 판단을 framesets.js 의 drawUnit 하나에 맡긴다. 전장은 그림인데 상점 카드만
 * 벡터로 남는 사고를 막는다.
 */
/** 진행도에서 이 고양이의 장착 스킨 (없으면 null) */
function equippedSkin(progress, towerId) {
  const eq = progress && progress.skins && progress.skins.equipped
  return getSkin(eq ? eq[towerId] : null)
}

function spriteCanvas(def, cssSize, skin = null) {
  const cv = document.createElement('canvas')
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  cv.width = cssSize * dpr
  cv.height = cssSize * dpr
  cv.style.width = `${cssSize}px`
  cv.style.height = `${cssSize}px`
  const ctx = cv.getContext('2d')
  ctx.scale(dpr, dpr)
  const paint = () => {
    ctx.clearRect(0, 0, cssSize, cssSize)
    drawUnit(ctx, def, { x: cssSize / 2, y: cssSize / 2, r: cssSize * 0.34, skin })
  }
  paint()
  // 그림은 비동기로 도착한다. 부팅 직후 만들어진 카드는 이때 벡터로 그려지므로,
  // 로드가 끝나면 한 번 다시 그린다. 안 하면 그 카드만 영원히 벡터로 남는다.
  if (def.frames && !getFrameImage(def.frames)) onFrameSetsReady(paint)
  return cv
}

/** 맵 경로 미리보기 썸네일 */
function mapThumb(mapDef, cssSize) {
  const cv = document.createElement('canvas')
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  cv.width = cssSize * dpr; cv.height = cssSize * dpr
  cv.style.width = `${cssSize}px`; cv.style.height = `${cssSize}px`
  const ctx = cv.getContext('2d')
  ctx.scale(dpr, dpr)

  const t = cssSize / Math.max(mapDef.cols, mapDef.rows)
  const ox = (cssSize - t * mapDef.cols) / 2
  const oy = (cssSize - t * mapDef.rows) / 2

  ctx.fillStyle = mapDef.theme.ground
  ctx.fillRect(0, 0, cssSize, cssSize)

  const path = buildPath(mapDef)
  ctx.strokeStyle = mapDef.theme.path
  ctx.lineWidth = t * 0.8
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath()
  path.points.forEach((p, i) => {
    const x = ox + p.x * t
    const y = oy + p.y * t
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  })
  ctx.stroke()
  return cv
}

export class UI {
  constructor(handlers) {
    this.h = handlers
    this.overlay = $('overlay')
    this.sheet = $('overlay-sheet')
    this._toastTimer = null
    this._bindStatic()
  }

  _bindStatic() {
    $('btn-play').addEventListener('click', () => this.h.onPlay())
    $('btn-scenario').addEventListener('click', () => this.h.onScenario())
    $('btn-codex').addEventListener('click', () => this.openCodex())
    $('btn-pets').addEventListener('click', () => this.h.onPets())
    $('btn-gacha').addEventListener('click', () => this.h.onGacha())
    $('btn-settings').addEventListener('click', () => this.h.onOpenSettings())
    $('btn-wave').addEventListener('click', () => this.h.onStartWave())
    $('btn-speed').addEventListener('click', () => this.h.onSpeed())
    $('btn-pause').addEventListener('click', () => this.h.onPause())
    // 캣닢 상점은 일시정지 화면에서 연다. 전투 HUD는 목숨·골드·마나만 둔다
    // (시트의 헤더 구성과 같다). 예전 버튼이 남아 있는 경우에만 연결한다.
    const shopBtn = $('btn-shop')
    if (shopBtn) shopBtn.addEventListener('click', () => this.h.onOpenStore('ingame'))
    $('btn-store').addEventListener('click', () => this.h.onOpenStore('title'))
    for (const n of document.querySelectorAll('[data-action="back-title"]')) {
      n.addEventListener('click', () => this.showScreen('title'))
    }
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay && this._dismissible) this.closeOverlay()
    })
  }

  // ---------------------------------------------------------- 화면

  /**
   * 화면 전환. 검정 막(#fade)을 90ms 켜고 그 순간 바꾼 뒤 90ms 끈다.
   * .screen 이 display:none 토글이라 요소 자체엔 트랜지션을 못 건다.
   * 움직임 줄이기면 그냥 바꾼다.
   */
  showScreen(name) {
    const swap = () => {
      for (const s of document.querySelectorAll('.screen')) s.hidden = true
      $(`screen-${name}`).hidden = false
      this.screen = name
      document.body.dataset.screen = name   // CSS 가 화면별로 토스트 위치를 잡는 데 쓴다
    }
    const fade = $('fade')
    if (!fade || document.body.classList.contains('reduced-motion')) { swap(); return }
    fade.classList.add('on')
    setTimeout(() => { swap(); fade.classList.remove('on') }, 90)
  }

  setBootStatus(text) { $('boot-status').textContent = text }

  // ---------------------------------------------------------- 로딩 화면

  setLoadingProgress({ done, total, ratio }) {
    $('loading-fill').style.width = `${Math.round(ratio * 100)}%`
    $('loading-status').textContent = total ? tr('불러오는 중 {done}/{total}', { done: done, total: total }) : tr('불러오는 중…')
  }

  setLoadingTip(text) {
    const node = $('loading-tip')
    node.classList.add('swap')
    setTimeout(() => { node.textContent = text; node.classList.remove('swap') }, 250)
  }

  setLoadingVersion(v) {
    $('loading-version').textContent = `v${v}`
    const t = $('title-version')
    if (t) t.textContent = `v${v}`
  }

  /** 다 받았다(또는 포기했다). 탭을 기다린다. */
  loadingReady(note) {
    $('loading-fill').style.width = '100%'
    $('loading-status').textContent = note || tr('준비 완료')
    $('loading-tap').hidden = false
  }

  /**
   * 탭 뒤 — 로딩이 걷히고 타이틀이 올라온다.
   * [hidden]{display:none!important} 가 전역이라 .out 만으로는 안 사라지고
   * 트랜지션 뒤 hidden 으로 확실히 치운다. 안 그러면 투명한 막이 탭을 삼킨다.
   */
  hideLoading() {
    const node = $('loading')
    node.classList.add('out')
    $('screen-title').classList.add('reveal')
    setTimeout(() => { node.hidden = true }, 380)
  }

  /**
   * 출석 보상 시트. 7칸 중 오늘 칸을 강조한다. 로딩이 걷힌 직후 하루 한 번.
   * @param {{ day:number, reward:number, table:number[] }} o
   */
  openDaily({ day, reward, table, tickets = 0 }) {
    const sheet = this._openSheet(true)
    sheet.appendChild(el('h2', null, tr('오늘의 출석')))
    sheet.appendChild(el('p', 'sub', tickets > 0
      ? tr('{day}일째 — 캣닢 {reward}과(와) 뽑기 티켓 {tickets}장을 받았다', { day: day, reward: reward, tickets: tickets })
      : tr('{day}일째 — 캣닢 {reward}을 받았다', { day: day, reward: reward })))
    const grid = el('div', 'daily-grid')
    table.forEach((amount, i) => {
      const d = i + 1
      const c = el('div', `daily-cell${d < day ? ' done' : d === day ? ' today' : ''}`)
      c.appendChild(el('div', 'k', tr('{d}일', { d: d })))
      const v = el('div', 'v')
      v.appendChild(icon('leaf'))
      v.appendChild(el('b', 'num', String(amount)))
      c.appendChild(v)
      grid.appendChild(c)
    })
    sheet.appendChild(grid)
    sheet.appendChild(el('p', 'hint', tr('매일 이어서 오면 더 준다. 하루를 건너뛰면 1일째로 돌아간다.')))
    const actions = el('div', 'sheet-actions')
    const ok = el('button', 'btn primary daily-close', tr('받았다'))
    ok.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(ok)
    sheet.appendChild(actions)
  }

  toast(message, ms = 1600) {
    const node = $('toast')
    node.classList.remove('action')
    node.textContent = message
    node.hidden = false
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { node.hidden = true; this._nextToast() }, ms)
  }

  /** 여러 개를 차례로 (업적 여럿이 한 번에 풀릴 때). 지금 뜬 것이 있으면 그 뒤에 잇는다. */
  toastQueue(messages, ms = 1600) {
    this._toastQ = (this._toastQ || []).concat(messages.map((m) => ({ m, ms })))
    if ($('toast').hidden) this._nextToast()
  }

  _nextToast() {
    const next = this._toastQ && this._toastQ.shift()
    if (next) this.toast(next.m, next.ms)
  }

  /**
   * 버튼 달린 지속형 — 새 버전 알림처럼 사용자가 눌러야 끝나는 것.
   * 다른 토스트와 달리 시간이 지나도 안 사라지고, 버튼을 누르면 fn 을 부르고 닫힌다.
   */
  toastAction(message, label, fn) {
    const node = $('toast')
    clearTimeout(this._toastTimer)
    node.textContent = ''
    node.classList.add('action')
    node.append(message)
    const b = el('button', 'btn', label)
    b.addEventListener('click', () => { node.hidden = true; node.classList.remove('action'); fn() })
    node.appendChild(b)
    node.hidden = false
  }

  // ---------------------------------------------------------- 맵 선택

  renderMapList(progress) {
    const list = $('map-list')
    list.textContent = ''
    const maps = listMaps()
    this._renderWeeklyCard(list, progress, maps)
    this._renderExpeditionCard(list, progress)
    /** 잠긴 맵에 '어떻게 여는지'를 적는다. 전에는 '앞 맵을 깨야 열린다'가 전부였다. */
    const lockedText = (m) => {
      const prev = maps[maps.indexOf(m) - 1]
      if (!prev) return tr('아직 열리지 않았다')
      const best = progress.bestWave[prev.id] || 0
      const ch = listChapters().find((c) => c.mapId === m.id)
      return tr('{prevName}을(를) {MAP_UNLOCK_WAVE}웨이브까지 버티거나 깨면 (지금 최고 {best})', { prevName: prev.name, MAP_UNLOCK_WAVE: MAP_UNLOCK_WAVE, best: best })
        + (ch ? tr(' · 시나리오 {order}장을 깨도 열린다', { order: ch.order }) : '')
    }
    for (const m of maps) {
      const unlocked = progress.unlockedMaps.includes(m.id)
      // 카드는 <button> 이라 안에 버튼을 못 넣는다 — 도전 칩은 형제로 두고 겹쳐 그린다
      const entry = el('div', 'map-entry')
      const card = el('button', 'map-card')
      card.disabled = !unlocked
      card.appendChild(mapThumb(m, 68)).className = 'map-thumb'

      const body = el('div', 'map-body')
      body.appendChild(el('h3', null, m.name))
      body.appendChild(el('p', null, m.desc))
      const best = progress.bestWave[m.id] || 0
      const clears = progress.clears[m.id] || 0
      const endlessBest = (progress.endless && progress.endless.best && progress.endless.best[m.id]) || 0
      const meta = el('div', `map-meta${unlocked ? '' : ' locked'}`)
      meta.textContent = unlocked
        ? tr('난이도 {v}{v2} · 최고 {best}웨이브{v3}', { v: '★'.repeat(m.tier), v2: '☆'.repeat(Math.max(0, 6 - m.tier)), best: best, v3: clears ? tr(' · 클리어 {clears}회', { clears: clears }) : '' })
          + (endlessBest ? tr(' · 무한 +{endlessBest}', { endlessBest: endlessBest }) : '')
        : lockedText(m)
      body.appendChild(meta)
      card.appendChild(body)

      if (!unlocked) card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
      else card.addEventListener('click', () => this.h.onSelectMap(m.id))
      entry.appendChild(card)

      // 한 번이라도 깬 맵에만 도전이 열린다 — 규칙을 얹어 다시 묻는 것이라 먼저 깨야 뜻이 있다
      if (unlocked && clears > 0 && listChallenges().length > 0 && this.h.onOpenChallenges) {
        const done = listChallenges().filter((c) => progress.challenge && progress.challenge.clears[`${m.id}:${c.id}`] > 0).length
        const chip = el('button', 'chip map-chip', tr('도전 {done}/{v}', { done: done, v: listChallenges().length }))
        chip.setAttribute('aria-label', tr('{mName} 도전', { mName: m.name }))
        chip.addEventListener('click', (e) => { e.stopPropagation(); this.h.onOpenChallenges(m.id) })
        entry.appendChild(chip)
      }
      list.appendChild(entry)
    }
  }

  /** 맵 목록 맨 위의 '이번 주 도전' 카드 — 주 키에서 맵·규칙이 정해지고 기록은 progress.weekly 에서 읽는다 */
  _renderWeeklyCard(list, progress, maps) {
    if (!this.h.onWeekly) return
    const key = weekKey()
    const pick = weeklyPick(key, maps, listChallenges().filter((c) => !c.pack))
    if (!pick) return
    const map = getMap(pick.mapId)
    const ch = pick.challengeId ? getChallenge(pick.challengeId) : null
    const w = progress.weekly || { best: {}, cleared: {} }
    const best = w.best[key] || 0
    const done = !!w.cleared[key]
    const entry = el('div', 'weekly-entry')
    const card = el('button', `weekly-card${done ? ' done' : ''}`)
    card.appendChild(mapThumb(map, 68)).className = 'map-thumb'
    const body = el('div', 'map-body')
    const h = el('h3', null, tr('이번 주 도전'))
    h.appendChild(el('span', 'weekly-badge', ch ? ch.badge : '★'))
    body.appendChild(h)
    body.appendChild(el('p', null, tr('{mapName}{v} · {v2}일 남음 · 모두 같은 판', { mapName: map.name, v: ch ? ` · ${ch.name}` : '', v2: daysLeft(key) })))
    body.appendChild(el('div', 'map-meta',
      (best ? tr('최고 {best}웨이브', { best: best }) : tr('아직 안 해 봤다'))
      + (done ? tr(' · 클리어') : tr(' · 첫 클리어 캣닢 +{WEEKLY_REWARD}{v}', { WEEKLY_REWARD: WEEKLY_REWARD, v: progress.premium ? ' ×2' : '' }))))
    card.appendChild(body)
    card.addEventListener('click', () => this.h.onWeekly())
    entry.appendChild(card)
    list.appendChild(entry)
  }

  /**
   * 맵 목록의 '속성 원정' 카드. 주간 카드와 같은 자리·같은 모양이다.
   * 고양이가 덱(4마리)을 못 채우면 잠긴 채로 **왜 잠겼는지**를 적는다 — 숨기면 있는 줄도 모른다.
   */
  _renderExpeditionCard(list, progress) {
    if (!this.h.onOpenExpedition) return
    // 사다리가 여럿이면 **지금 할 것 하나**만 카드로 보인다 — 맵 목록은 이미 길다
    const exp = currentExpedition(progress, listExpeditions())
    if (!exp) return
    const all = listTowers().map((t) => t.id)
    const gate = canEnter(progress, all, exp)
    const reached = reachedStage(progress, exp.id)
    const done = isCleared(progress, exp.id)
    const entry = el('div', 'weekly-entry')
    const card = el('button', `weekly-card expedition-card${done ? ' done' : ''}`)
    card.appendChild(mapThumb(getMap(exp.stages[0].mapId), 68)).className = 'map-thumb'
    const body = el('div', 'map-body')
    const h = el('h3', null, tr('속성 원정 · {expName}', { expName: exp.name }))
    h.appendChild(el('span', 'weekly-badge', '⚔'))
    body.appendChild(h)
    body.appendChild(el('p', null, exp.desc))
    const chain = el('div', 'stage-chain')
    for (let i = 0; i < exp.stages.length; i += 1) {
      const st = exp.stages[i]
      const look = ELEMENT_LOOK[st.element]
      const dot = el('span', `stage-dot${i < reached ? ' done' : ''}`, look ? look.glyph : '?')
      if (look) dot.style.color = look.color
      dot.title = tr('{n}칸 · {v}', { n: i + 1, v: tr(ELEMENT_NAMES[st.element]) })
      chain.appendChild(dot)
    }
    body.appendChild(chain)
    const lockedWhy = gate.reason === 'requires'
      ? tr('{prevName}을(를) 완주하면 열린다', { prevName: (getExpedition(gate.requires) || { name: gate.requires }).name })
      : tr('고양이 {need}마리를 모으면 열린다 (지금 {have}마리)', { need: gate.need, have: gate.have })
    body.appendChild(el('div', `map-meta${gate.ok ? '' : ' locked'}`, gate.ok
      ? (done ? tr('완주 · 덱을 바꿔 다시') : tr('{reached}/{total}칸 · 목숨이 이어진다', { reached: reached, total: exp.stages.length }))
      : lockedWhy))
    card.appendChild(body)
    if (!gate.ok) card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
    card.disabled = !gate.ok
    if (gate.ok) card.addEventListener('click', () => this.h.onOpenExpedition(exp.id))
    entry.appendChild(card)
    list.appendChild(entry)
  }

  /**
   * 원정 시트 — 사다리와 덱 편성이 **한 화면에** 있다.
   *
   * 나누지 않은 이유: 고르는 것이 "이 사다리에 맞는 네 마리"라서, 사다리를 안 보면서 덱을 짜면
   * 아무 뜻이 없다. 그래서 칸마다 **지금 덱이 몇 마리 유리한지**를 바로 옆에 적는다.
   * 가리면 뽑기 운 게임이 되고, 보이면 무엇을 포기할지 고르는 놀이가 된다.
   */
  openExpedition(exp, progress, allTowerIds) {
    const sheet = this._openSheet()
    const owned = ownedCats(progress, allTowerIds)
    /* 마지막 덱을 기억해 두되 **가진 고양이만** 남긴다 — 콘텐츠에서 고양이를 빼거나
     * 진행도를 바꿔 열어도 없는 id 가 덱에 남아 '시작' 이 영영 안 켜지는 일이 없게. */
    const ownedSet = new Set(owned)
    const pick = new Set((this._expDeck || savedDeck(progress, allTowerIds)).filter((id) => ownedSet.has(id)))
    const elementOf = (id) => towerElement(progress, getTower(id))

    const draw = () => {
      sheet.textContent = ''
      sheet.appendChild(el('h2', null, tr('속성 원정 · {expName}', { expName: exp.name })))
      sheet.appendChild(el('p', 'sub', tr('{n}마리만 데려간다 · 목숨이 칸 사이로 이어진다 · 지면 처음부터', { n: DECK_SIZE })))
      // 사다리가 둘 이상이면 칩으로 고른다. 잠긴 것도 보인다 — 다음에 뭐가 오는지 알아야 한다.
      const ladders = listExpeditions()
      if (ladders.length > 1) {
        const tabs = el('div', 'codex-tabs')
        for (const e of ladders) {
          const g = canEnter(progress, allTowerIds, e)
          const b = el('button', `chip${e.id === exp.id ? ' on' : ''}${g.ok ? '' : ' locked'}`, e.name)
          b.disabled = !g.ok
          if (!g.ok) b.title = tr('{prevName}을(를) 완주하면 열린다', { prevName: (getExpedition(e.requires) || { name: '' }).name })
          b.addEventListener('click', () => { this._expDeck = [...pick]; this.openExpedition(e, progress, allTowerIds) })
          tabs.appendChild(b)
        }
        sheet.appendChild(tabs)
      }

      const deck = [...pick]
      const reached = reachedStage(progress, exp.id)
      for (let i = 0; i < exp.stages.length; i += 1) {
        const st = exp.stages[i]
        const map = getMap(st.mapId)
        const row = el('div', `codex-item stage-row${i < reached ? ' done' : ''}`)
        const body = el('div', 'body')
        const h = el('h4', null, tr('{n}칸 · {mapName}', { n: i + 1, mapName: map ? map.name : st.mapId }))
        const eb = elementBadge(st.element)
        if (eb) h.appendChild(eb)
        if (i < reached) h.appendChild(el('span', 'pet-badge', tr('깼다')))
        body.appendChild(h)
        body.appendChild(el('p', null, tr('{waveLimit}웨이브 · 잡몹이 전부 {v} 속성이다', {
          waveLimit: st.waveLimit, v: tr(ELEMENT_NAMES[st.element]),
        })))
        // 칸이 규칙을 들고 있으면 **들어가기 전에** 보인다 — 가리면 뽑기 운 게임이 된다
        const extra = stageRuleText(st)
        if (extra) body.appendChild(el('div', 'stat-pill warn', extra))
        const m = deckMatch(deck, st, elementOf)
        body.appendChild(el('div', `stat-pill${m.strong > 0 ? ' good' : m.weak > 0 ? ' bad' : ''}`,
          tr('잡몹 — 덱 유리 {strong} · 불리 {weak}', { strong: m.strong, weak: m.weak })))
        /* 보스 줄 — 칸이 보스를 골랐으면 **그 보스는 지배 속성에 안 덮인다**(J-6). 그래서 칸이 묻는
         * 속성이 둘이 되고, 둘 다 들어가기 전에 보여야 한다. 안 고른 칸은 웨이브셋이 들고 있는
         * 보스가 그대로 나오고 속성은 지배 속성으로 덮이므로, 이름만 알려 주고 상성 줄은 안 낸다. */
        const bossIds = stageBossIds(st, getWaveSet(st.waveSet) || [], (id) => !!(getEnemy(id) || {}).boss)
        const bossName = (id) => (getEnemy(id) || {}).name || id
        if (st.boss && bossIds.length) {
          const bEl = (getEnemy(st.boss) || {}).element
          const bp = el('p', null, tr('보스 {bossName} — {v} 속성 그대로 나온다', {
            bossName: bossName(st.boss), v: tr(ELEMENT_NAMES[bEl]),
          }))
          const bb = elementBadge(bEl)
          if (bb) bp.appendChild(bb)
          body.appendChild(bp)
          const bm = matchElement(deck, bEl, elementOf)
          body.appendChild(el('div', `stat-pill${bm.strong > 0 ? ' good' : bm.weak > 0 ? ' bad' : ''}`,
            tr('보스 — 덱 유리 {strong} · 불리 {weak}', { strong: bm.strong, weak: bm.weak })))
        } else if (bossIds.length) {
          body.appendChild(el('p', null, tr('보스 {list} — 속성은 지배 속성을 따른다', {
            list: bossIds.map(bossName).join(' · '),
          })))
        }
        const rw = st.reward
        const parts = []
        if (rw.tickets) parts.push(tr('티켓 {n}', { n: rw.tickets }))
        if (rw.catnip) parts.push(tr('캣닢 {n}', { n: rw.catnip }))
        if (rw.shards) parts.push(tr('조각 {n}', { n: rw.shards }))
        if (rw.rune) parts.push(tr('{v} 룬', { v: tr(ELEMENT_NAMES[rw.rune]) }))
        body.appendChild(el('div', 'map-meta', tr('첫 클리어 보상 — {v}', { v: parts.join(' · ') })))
        row.appendChild(body)
        sheet.appendChild(row)
      }

      sheet.appendChild(el('h3', 'codex-sub', tr('덱 {have}/{size}', { have: pick.size, size: DECK_SIZE })))
      const grid = el('div', 'deck-grid')
      for (const id of owned) {
        const def = getTower(id)
        if (!def) continue
        const on = pick.has(id)
        const b = el('button', `deck-cat${on ? ' on' : ''}`)
        b.appendChild(spriteCanvas(def, 40, equippedSkin(progress, id)))
        b.appendChild(el('span', 'nm', def.name))
        const eb = elementBadge(elementOf(id))
        if (eb) b.appendChild(eb)
        b.addEventListener('click', () => {
          if (on) pick.delete(id)
          else if (pick.size < DECK_SIZE) pick.add(id)
          else { this.toast(tr('덱은 {n}마리까지다', { n: DECK_SIZE })); return }
          this._expDeck = [...pick]
          draw()
        })
        grid.appendChild(b)
      }
      sheet.appendChild(grid)
      sheet.appendChild(el('p', 'hint', tr('속성은 도감의 고양이 행에서 룬으로 바꾼다. 원정이 시작되면 덱과 속성은 굳는다.')))

      const actions = el('div', 'sheet-actions')
      const go = el('button', 'btn primary', tr('원정 시작'))
      go.disabled = pick.size !== DECK_SIZE
      go.addEventListener('click', () => this.h.onStartExpedition(exp.id, [...pick]))
      actions.appendChild(go)
      const close = el('button', 'btn ghost', tr('닫기'))
      close.addEventListener('click', () => this.closeOverlay())
      actions.appendChild(close)
      sheet.appendChild(actions)
    }
    draw()
  }

  /**
   * 도전 시트 — 맵 하나에 규칙 목록. 최고 웨이브·클리어 횟수는 progress.challenge 에서,
   * 규칙·보상은 레지스트리에서 읽는다. 표 길이는 그 맵의 웨이브셋에서 센다.
   */
  openChallenges(mapId, progress) {
    const map = getMap(mapId)
    if (!map) return
    const table = getWaveSet(map.waveSet)
    const total = table ? waveCount(table) : 0
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('{mapName} · 도전', { mapName: map.name })))
    sheet.appendChild(el('p', 'sub', tr('규칙 하나를 얹고 다시 지킨다 · 첫 클리어에 캣닢')))

    const rec = progress.challenge || { best: {}, clears: {} }
    for (const ch of listChallenges()) {
      const key = `${mapId}:${ch.id}`
      const best = rec.best[key] || 0
      const clears = rec.clears[key] || 0
      const row = el('div', `codex-item pet-row challenge-row${clears ? ' on' : ''}`)
      const badge = el('div', 'challenge-badge', ch.badge)
      row.appendChild(badge)
      const body = el('div')
      const h = el('h4', null, ch.name)
      if (clears) h.appendChild(el('span', 'pet-badge', tr('클리어 {clears}회', { clears: clears })))
      body.appendChild(h)
      body.appendChild(el('p', null, ch.desc))
      body.appendChild(el('div', 'map-meta',
        (best ? tr('최고 {best}/{total}웨이브', { best: best, total: total }) : tr('아직 안 해 봤다')) + (clears ? '' : tr(' · 첫 클리어 캣닢 +{reward}', { reward: ch.reward }))))
      row.appendChild(body)

      const act = el('div', 'pet-act')
      if (!hasPack(progress, ch.pack)) {
        // 유료 팩 — 잠그고 상점으로 보낸다. 무료 팩 1 다섯 개는 pack 이 없다.
        row.classList.add('locked')
        const product = productForPack(ch.pack)
        const b = el('button', 'btn', product ? tr('유료 · {priceLabel}', { priceLabel: product.priceLabel }) : tr('유료'))
        b.addEventListener('click', () => this.h.onOpenStore('title', product ? product.id : null))
        act.appendChild(b)
      } else {
        const b = el('button', `btn ${clears ? 'ghost' : 'primary'}`, tr('시작'))
        b.addEventListener('click', () => this.h.onSelectChallenge(mapId, ch.id))
        act.appendChild(b)
      }
      row.appendChild(act)
      sheet.appendChild(row)
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn ghost', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  // ---------------------------------------------------------- 시나리오

  /** 별 0~3 을 채운 별/빈 별로 그린다 */
  _stars(n) {
    const wrap = el('div', 'stars')
    for (let i = 0; i < MAX_STARS; i += 1) {
      const st = el('span', `star${i < n ? ' on' : ''}`)
      st.appendChild(icon('star'))
      wrap.appendChild(st)
    }
    return wrap
  }

  /** 챕터 카드. 맵 카드 스타일을 그대로 쓴다 — 같은 목록이라 같아 보여야 한다. */
  renderChapterList(progress) {
    const list = $('chapter-list')
    list.textContent = ''
    const all = listChapters()
    let lastAct = 0
    for (const ch of all) {
      // 막이 바뀌는 자리에 제목 한 줄. act 는 없으면 1막이다.
      const act = ch.act || 1
      if (act !== lastAct) {
        list.appendChild(el('div', 'act-head', tr('{act}막', { act: act })))
        lastAct = act
      }
      const unlocked = isChapterUnlocked(progress, ch, all)
      const paidLocked = !hasAct(progress, act)          // 안 산 유료 막 — 잠그되 상점으로 보낸다
      const stars = (progress.scenario && progress.scenario.stars[ch.id]) || 0
      const card = el('button', `map-card${paidLocked ? ' paid' : ''}`)
      card.disabled = !unlocked && !paidLocked

      const no = el('div', 'chapter-no', String(ch.order))
      card.appendChild(no)

      const body = el('div', 'map-body')
      body.appendChild(el('h3', null, ch.title))
      if (unlocked) {
        body.appendChild(this._stars(stars))
        const goals = el('div', 'chapter-goals')
        for (const spec of [ch.primary, ...ch.bonus]) {
          const o = getObjective(spec.kind)
          goals.appendChild(el('span', 'goal', o ? o.label(spec) : spec.kind))
        }
        body.appendChild(goals)
      } else if (paidLocked) {
        const product = productForAct(act)
        body.appendChild(el('div', 'map-meta locked', product ? tr('유료 · {productName} {priceLabel} · 눌러서 상점', { productName: tr(product.name), priceLabel: product.priceLabel }) : tr('유료')))
      } else {
        body.appendChild(el('div', 'map-meta locked', tr('앞 장을 깨야 열린다')))
      }
      card.appendChild(body)

      if (paidLocked) {
        card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
        const product = productForAct(act)
        card.addEventListener('click', () => this.h.onOpenStore('title', product ? product.id : null))
      } else if (!unlocked) card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
      else card.addEventListener('click', () => this.h.onSelectChapter(ch.id))
      list.appendChild(card)
    }
  }

  /**
   * 컷신 — 대사 카드를 한 장씩 넘긴다.
   *
   * 오버레이 안에만 그린다. 지도 위에 얹으면 그 칸을 못 누르게 되는데,
   * 타워 패널과 배치 안내로 같은 사고를 두 번 냈다.
   */
  openStoryCards(cards, onDone) {
    if (!cards || cards.length === 0) { onDone(); return }
    const sheet = this._openSheet(false)
    sheet.classList.add('story')
    // 오버레이에도 붙인다 — 장소 사진이 여기 깔린다(.overlay.story).
    // 일시정지·설정·도감·결과가 같은 오버레이를 쓰므로 컷신에만 붙어야 한다.
    this.overlay.classList.add('story')
    let i = 0

    const box = el('div', 'story-box')
    sheet.appendChild(box)
    const hint = el('div', 'story-hint', tr('탭해서 넘기기'))
    sheet.appendChild(hint)

    const paint = () => {
      const c = cards[i]
      box.textContent = ''
      const row = el('div', `story-row${c.side === 'right' ? ' right' : ''}`)
      const who = this._speaker(c.who)
      if (who) row.appendChild(who)
      const bubble = el('div', 'story-bubble')
      bubble.appendChild(el('div', 'nm', this._speakerName(c.who)))
      bubble.appendChild(el('p', null, c.text))
      row.appendChild(bubble)
      box.appendChild(row)
      hint.textContent = i === cards.length - 1 ? tr('탭해서 시작') : tr('탭해서 넘기기')
    }

    const next = () => {
      i += 1
      if (i >= cards.length) {
        sheet.removeEventListener('click', next)
        this._sheetTap = null
        this.closeOverlay()
        onDone()
        return
      }
      paint()
    }
    // 시트 어디를 눌러도 넘어간다. 작은 '다음' 버튼을 찾게 만들지 않는다.
    // 리스너는 _openSheet 가 다음 시트를 열 때 떼어낸다.
    this._sheetTap = next
    sheet.addEventListener('click', next)
    paint()
  }

  /** 컷신 화자의 그림 — 타워면 프레임 아트, 적이면 벡터 */
  _speaker(id) {
    const def = listTowers().find((t) => t.id === id) || listEnemies().find((e) => e.id === id)
    return def ? spriteCanvas(def, 64) : null
  }

  _speakerName(id) {
    const def = listTowers().find((t) => t.id === id) || listEnemies().find((e) => e.id === id)
    return def ? def.name : id
  }

  // ---------------------------------------------------------- 상점 / HUD

  /** 상점 카드는 등록된 타워를 그대로 순회한다 — 고양이를 추가하면 자동으로 늘어난다 */
  renderShop(game, selectedId) {
    const wrap = $('shop-cards')
    wrap.textContent = ''
    /* 이번 판에 못 데려가는 고양이는 **아예 안 그린다.**
     * 지금까지 상점은 game.rules 를 안 봤다 — 그래서 도전의 금지 고양이 카드가 살 수 있어 보이다가
     * 배치에서 PLACE_FAIL.BANNED 로 튕겼다. 원정은 덱 네 마리라 그게 기본 상태여서 판마다 다섯 번 튕긴다.
     * 잠긴 고양이(시나리오 보상)와 다르게 자물쇠도 안 보인다 — 저건 "곧 생긴다"지만 이건 "이번 판엔 없다"다. */
    const banned = Array.isArray(game.rules && game.rules.bannedTowers) ? game.rules.bannedTowers : []
    for (const def of listTowers()) {
      if (banned.includes(def.id)) continue
      const cost = buildCost(def)
      const card = el('button', 'shop-card')
      // 시나리오 보상으로 푸는 고양이. 목록에서 빼지 않고 자물쇠로 보여준다 —
      // 앞으로 뭐가 생기는지 보이는 편이 낫다.
      if (!game.isTowerUnlocked(def.id)) {
        card.classList.add('locked')
        card.disabled = true
        card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
        card.appendChild(spriteCanvas(def, 42))
        card.appendChild(el('div', 'nm', def.name))
        card.appendChild(el('div', 'tag', tr('시나리오 보상')))
        wrap.appendChild(card)
        continue
      }
      if (def.id === selectedId) {
        card.classList.add('selected')
        // 취소 표시는 카드 위에 둔다. 지도 위에 띄우면 그 칸에 못 짓게 된다.
        const x = el('span', 'x')
        x.appendChild(icon('close'))
        card.appendChild(x)
      }
      if (game.gold < cost) card.classList.add('poor')
      // 카드 위 액센트 띠를 고양이 털색으로 — 한눈에 구분된다
      if (def.palette && def.palette.fur) card.style.setProperty('--accent', def.palette.fur)
      card.appendChild(spriteCanvas(def, 42, equippedSkin(game.progress, def.id)))
      card.appendChild(el('div', 'nm', def.name))
      card.appendChild(goldTag(cost))
      const rank = growthRank(game.progress, def.id)
      if (rank > 0) card.appendChild(rankPips(rank))
      card.appendChild(el('div', 'tag', def.targets && def.targets !== 'all' ? targetsLabel(def) : ' '))
      card.addEventListener('click', () => this.h.onPickTower(def.id))
      wrap.appendChild(card)
    }
  }

  /**
   * 필살기 버튼 — 등록된 필살기를 그대로 순회하므로 새로 추가하면 자동으로 늘어난다.
   */
  renderSpecials(game) {
    const wrap = $('specials')
    wrap.textContent = ''
    this._specialNodes = []
    for (const st of game.specialStates()) {
      const btn = el('button', 'special')
      btn.title = `${st.def.name}: ${st.def.desc}`
      const ic = el('span', 'ic')
      ic.appendChild(iconOf(st.def.icon))
      btn.appendChild(ic)
      btn.appendChild(el('span', 'nm', st.def.name))

      // 마나 비용 — 얼마를 내는지 버튼에 적어둔다
      const cost = el('span', 'mana-cost')
      cost.appendChild(icon('milk'))
      cost.appendChild(el('b', 'num', String(st.cost)))
      btn.appendChild(cost)

      const fill = el('i', 'fill')
      btn.appendChild(fill)
      const cd = el('span', 'cd')
      btn.appendChild(cd)
      btn.addEventListener('click', () => this.h.onUseSpecial(st.def.id))
      wrap.appendChild(btn)
      this._specialNodes.push({ id: st.def.id, btn, fill, cd })
    }
  }

  /** 매 프레임 쿨다운만 갱신한다 (DOM을 다시 만들지 않는다) */
  updateSpecials(game) {
    if (!this._specialNodes) return
    const states = game.specialStates()
    // 지금 이어 쓰면 연계가 되는 필살기. 안 알려주면 아무도 못 찾는다.
    const hints = new Set(game.specialComboHints())
    this._specialNodes.forEach((node, i) => {
      const st = states[i]
      if (!st) return
      // 못 쓰는 이유를 구분해서 보여준다 — 쿨다운이면 남은 초, 마나가 모자라면 '마나'
      node.btn.classList.toggle('ready', st.ready)
      node.btn.classList.toggle('poor', st.cooled && !st.afford)
      node.btn.classList.toggle('linkable', st.ready && hints.has(st.def.id))
      node.fill.style.width = `${(st.cooled ? st.manaRatio : st.ratio) * 100}%`
      if (st.ready) {
        node.cd.hidden = true
        node.cd.textContent = ''
      } else {
        node.cd.hidden = false
        node.cd.textContent = st.cooled ? tr('{short} 부족', { short: st.short }) : String(Math.ceil(st.remaining))
      }
    })
  }

  /** 골드가 변하면 살 수 없는 카드가 흐려지도록 갱신 */
  refreshShopAffordability(game) {
    const cards = $('shop-cards').children
    listTowers().forEach((def, i) => {
      if (cards[i]) cards[i].classList.toggle('poor', game.gold < buildCost(def))
    })
  }

  updateHud(game) {
    const lives = $('hud-lives')
    lives.textContent = game.lives
    lives.classList.toggle('low', game.lives <= Math.max(3, game.maxLives * 0.25))
    // 값이 바뀐 순간에만 튕긴다 — 매 프레임 다시 걸면 애니메이션이 아예 재생되지 않는다
    this._pulse('stat-lives', game.lives, 'hurt')
    this._pulse('stat-gold', game.gold, 'bump')
    $('hud-gold').textContent = game.gold

    // 밀크 마나 — 캡슐 뒤에 채워지는 막대로 최대치 대비 얼마인지 보여준다
    this._pulse('stat-mana', game.mana, 'bump')
    $('hud-mana').textContent = game.mana
    $('mana-fill').style.width = `${(game.mana / game.manaMax) * 100}%`
    $('stat-mana').classList.toggle('full', game.mana >= game.manaMax)

    const alive = game.enemies ? game.enemies.length : 0
    $('wave-fill').style.width = `${game.waveProgress() * 100}%`
    const totalText = Number.isFinite(game.totalWaves) ? String(game.totalWaves) : '∞'
    // 원정은 '지금 어느 속성을 상대하나'가 HUD 에 늘 보여야 한다 — 그게 이 판의 규칙이라서다
    const enemyEl = game.rules && game.rules.enemyElement
    const modeText = enemyEl ? ` · ${tr(ELEMENT_NAMES[enemyEl])}${(ELEMENT_LOOK[enemyEl] || {}).glyph || ''}`
      : game.weekly ? tr(' · 주간') : game.endless ? tr(' · 무한') : (game.challenge ? ` · ${game.challenge.name}` : '')
    $('wave-label').textContent = game.phase === 'prep'
      ? tr('WAVE {nextWaveNo} / {totalText} · 준비{modeText}', { nextWaveNo: game.nextWaveNo, totalText: totalText, modeText: modeText })
      : tr('WAVE {waveNo} / {totalText} · 남은 해충 {alive}{modeText}', { waveNo: game.waveNo, totalText: totalText, alive: alive, modeText: modeText })
    $('wavebar').classList.toggle('danger', game.lives <= Math.max(3, game.maxLives * 0.25))

    const btn = $('btn-wave')
    const prep = game.phase === 'prep'
    btn.disabled = !prep || game.waveNo >= game.totalWaves
    btn.textContent = ''
    if (prep) {
      // 짧게 — 긴 문장을 버튼에 밀어 넣으면 한 줄에 안 들어가고 읽기 어렵다
      btn.append(tr('{nextWaveNo}웨이브 시작', { nextWaveNo: game.nextWaveNo }))
      const secs = Math.ceil(game.prepRemaining)
      if (secs > 0) btn.appendChild(el('span', 'sub', tr('자동 {secs}초', { secs: secs })))
    } else {
      btn.append(tr('{waveNo}웨이브 진행 중…', { waveNo: game.waveNo }))
    }

    const badge = $('prep-badge')
    if (prep && game.prepRemaining > 0) {
      badge.hidden = false
      badge.textContent = ''
      badge.appendChild(icon('clock'))
      badge.append(tr('{prepRemaining}초', { prepRemaining: Math.ceil(game.prepRemaining) }))
    } else {
      badge.hidden = true
    }

    // 다음 웨이브 미리보기 — 준비 단계에만. 번호가 바뀔 때만 다시 그린다.
    // 지도 위에 얹히지만 pointer-events:none 이라 아래 칸의 탭을 막지 않는다.
    const pv = $('wave-preview')
    if (prep && game.nextWave) {
      if (this._previewFor !== game.nextWaveNo) {
        this._previewFor = game.nextWaveNo
        pv.textContent = ''
        pv.appendChild(el('span', 'lbl', tr('다음')))
        for (const g of summarizeWave(game.nextWave, getEnemy)) {
          const item = el('span', `pv-item${g.boss ? ' boss' : ''}`)
          const def = getEnemy(g.enemyId)
          if (def) item.appendChild(spriteCanvas(def, 18))
          if (g.boss) item.appendChild(icon('crown', 'i mark boss'))
          if (g.flying) item.appendChild(icon('wing', 'i mark air'))
          if (g.armored && !g.boss) item.appendChild(icon('shield', 'i mark armor'))
          item.append(`×${g.count}`)
          pv.appendChild(item)
        }
      }
      pv.hidden = false
    } else {
      pv.hidden = true
      if (!prep) this._previewFor = null
    }
  }

  /** 값이 바뀐 순간에만 애니메이션 클래스를 다시 건다 */
  _pulse(nodeId, value, cls) {
    this._last = this._last || {}
    const prev = this._last[nodeId]
    this._last[nodeId] = value
    if (prev === undefined || prev === value) return
    // 목숨은 줄 때만, 골드는 늘 때만 반응하는 게 자연스럽다
    if (cls === 'hurt' && value > prev) return
    if (cls === 'bump' && value < prev) return
    const node = $(nodeId)
    if (!node) return
    node.classList.remove(cls)
    void node.offsetWidth          // 리플로우 강제 — 없으면 같은 클래스는 재생되지 않는다
    node.classList.add(cls)
  }


  setSpeedLabel(speed) { $('btn-speed').textContent = `${speed}×` }

  setCatnip(amount) {
    this._catnip = amount
    const node = $('hud-catnip')     // 전투 HUD에서는 뺐다 (일시정지 → 캣닢 상점)
    if (node) node.textContent = amount
  }

  // ---------------------------------------------------------- 타워 상세

  showTowerPanel(game, tower) {
    const panel = $('tower-panel')
    panel.hidden = false
    panel.textContent = ''

    const info = game.towerInfo(tower)
    const head = el('div', 'tp-head')
    head.appendChild(spriteCanvas(tower.def, 34, tower.skin || null))
    head.appendChild(el('h3', null, tower.def.name))
    head.appendChild(el('span', 'tp-lv', `Lv.${info.level}/${info.maxLevel}`))
    const close = el('button', 'icon-btn tp-close')
    close.appendChild(icon('close'))
    close.setAttribute('aria-label', tr('닫기'))
    close.addEventListener('click', () => this.h.onDeselect())
    head.appendChild(close)
    panel.appendChild(head)

    const stats = el('div', 'tp-stats')
    /* key 를 달아 두면 매 프레임 알약을 새로 만들지 않고 숫자만 덮어쓸 수 있다.
     * 통째로 다시 그리면 스프라이트 캔버스가 매번 새로 그려지고 열림 애니메이션이
     * 계속 재생된다. refreshTowerPanel() 이 이 key 로 찾아 쓴다. */
    const pill = (key, label, value, next) => {
      const p = el('span', 'stat-pill')
      p.append(label)
      const v = el('b', null, String(value))
      if (key) v.dataset.k = key
      p.appendChild(v)
      if (next !== undefined && next !== null && String(next) !== String(value)) {
        p.appendChild(el('b', 'up', `▲${next}`))
      }
      return p
    }
    const s = info.stats
    const n = info.next
    // 다음 레벨에도 같은 배수를 곱해야 사과 대 사과 비교가 된다
    const mulD = info.eff.damage / s.damage
    const mulF = info.eff.fireRate / s.fireRate
    const addR = info.eff.range - s.range
    stats.appendChild(pill('damage', tr('공격력'), round1(info.eff.damage), n && round1(n.damage * mulD)))
    stats.appendChild(pill('range', tr('사거리'), info.eff.range.toFixed(1), n && (n.range + addR).toFixed(1)))
    stats.appendChild(pill('fireRate', tr('연사'), tr('{v}/초', { v: info.eff.fireRate.toFixed(2) }),
      n && tr('{v}/초', { v: (n.fireRate * mulF).toFixed(2) })))
    stats.appendChild(pill('dps', tr('초당피해'), info.eff.dps,
      n && Math.round(n.damage * mulD * n.fireRate * mulF * 10) / 10))
    stats.classList.toggle('boosted', info.boosted)
    // 표적 알약은 제한이 있을 때만 — '지상+공중'이 기본이라 늘 적으면 짧은 화면에서 한 줄을 더 먹는다
    if (tower.def.targets && tower.def.targets !== 'all') stats.appendChild(pill(null, tr('표적'), targetsLabel(tower.def)))
    /* 놓을 때 굳은 속성(룬을 꼈으면 타고난 것과 다르다). **상성이 켜진 판에서만 보인다** —
     * 자유 모드에서는 속성이 아무 일도 안 하므로 알약 하나가 그냥 노이즈고, 짧은 화면에서는
     * 패널이 한 줄만큼 더 높아져 지도를 가린다(스모크의 '패널이 지도를 다 덮지 않는다'가 잡았다).
     * 어느 고양이가 무슨 속성인지는 도감 배지가 늘 보여 준다. */
    if (game.rules && game.rules.elemental && tower.element && ELEMENT_NAMES[tower.element]) {
      stats.appendChild(pill(null, tr('속성'), `${ELEMENT_LOOK[tower.element].glyph} ${tr(ELEMENT_NAMES[tower.element])}`))
    }
    const rank = growthRank(game.progress, tower.def.id)
    if (rank > 0) stats.appendChild(pill(null, tr('훈련'), tr('{rank}단계 · 공격 +{rank2}%', { rank: rank, rank2: Math.round(rank * GROWTH_DAMAGE_PER_RANK * 100) })))
    // 효과 설명은 레지스트리가 준다 — 전에는 세 가지만 여기 적혀 있어서 나중에 붙은
    // 상처·정전기·관통·강화는 패널에 아무것도 안 나왔다.
    for (const fx of s.effects || []) {
      const d = describeEffect(fx)
      if (d) stats.appendChild(pill(null, d.name, d.text))
    }
    panel.appendChild(stats)

    const actions = el('div', 'tp-actions')
    const upBtn = el('button', 'btn primary upgrade')
    if (info.upgradeCost === null) {
      upBtn.textContent = tr('최대 레벨')
      upBtn.disabled = true
    } else {
      // 버튼 안에서는 아이콘을 빼고 숫자만 — 작은 동전은 그냥 점으로 보인다
      upBtn.append(tr('업그레이드'))
      upBtn.appendChild(el('span', 'amt num', String(info.upgradeCost)))
      upBtn.disabled = game.gold < info.upgradeCost
      // 값을 버튼에 적어 둔다 — 매 프레임 doAgain 없이 잠금만 다시 칠하려면 필요하다
      upBtn.dataset.cost = String(info.upgradeCost)
      upBtn.addEventListener('click', () => this.h.onUpgrade(tower))
    }
    actions.appendChild(upBtn)

    const tgtBtn = el('button', 'btn ghost stack')
    tgtBtn.appendChild(el('span', 'lbl', tr('표적')))
    tgtBtn.appendChild(el('span', 'val', tr(TARGET_MODE_LABELS[tower.targetMode])))
    tgtBtn.title = tr('표적 우선순위 바꾸기')
    tgtBtn.addEventListener('click', () => this.h.onCycleTarget(tower))
    actions.appendChild(tgtBtn)

    const sellBtn = el('button', 'btn danger')
    sellBtn.append(tr('판매'))
    sellBtn.appendChild(el('span', 'amt num', String(info.sellValue)))
    sellBtn.addEventListener('click', () => this.h.onSell(tower))
    actions.appendChild(sellBtn)

    panel.appendChild(actions)
  }

  hideTowerPanel() { $('tower-panel').hidden = true }

  /**
   * 열려 있는 타워 패널을 실시간 값으로 다시 칠한다.
   *
   * 패널은 지도 위에 겹쳐 뜨는 비모달이라 열어 둔 채 전투가 계속 돈다.
   * 그래서 두 가지가 낡는다:
   *   · 업그레이드 잠금 — 열 때 game.gold 로 한 번 계산됐다. 적을 잡아 돈이
   *     모여도 잠긴 채로 남아 "돈이 있는데 안 눌린다"가 됐다.
   *   · 수치 — 옆에 턱시도냥을 놓거나 조합이 성립하거나 황금 발바닥을 쓰면
   *     실제 공격력이 오르는데 패널은 안 움직였다. 그 고양이가 일하고 있는지
   *     확인할 방법이 아예 없었다.
   *
   * 통째로 다시 그리지 않는다 — showTowerPanel 은 스프라이트 캔버스를 새로
   * 만들고 열림 애니메이션을 재생하므로 매 프레임 부르면 패널이 떨린다.
   * dataset.k 를 달아 둔 <b> 의 글자만 덮어쓴다.
   */
  refreshTowerPanel(game, tower) {
    const panel = $('tower-panel')
    if (panel.hidden) return

    const up = panel.querySelector('.btn.upgrade')
    // 최대 레벨이면 cost 를 안 적었다 — 그대로 잠겨 있어야 한다
    if (up && up.dataset.cost !== undefined) up.disabled = game.gold < Number(up.dataset.cost)

    if (!tower || !game.towers.includes(tower)) return
    const info = game.towerInfo(tower)
    const set = (k, text) => {
      const node = panel.querySelector(`.stat-pill b[data-k="${k}"]`)
      if (node && node.textContent !== text) node.textContent = text
    }
    set('damage', round1(info.eff.damage))
    set('range', info.eff.range.toFixed(1))
    set('fireRate', tr('{v}/초', { v: info.eff.fireRate.toFixed(2) }))
    set('dps', String(info.eff.dps))
    const stats = panel.querySelector('.tp-stats')
    if (stats) stats.classList.toggle('boosted', info.boosted)
  }

  // ---------------------------------------------------------- 오버레이

  _openSheet(dismissible = true) {
    // 컷신이 시트 전체에 탭 리스너를 건다. 안 떼면 다음에 열리는 결과 시트에서도
    // 아무 데나 누를 때마다 지난 컷신이 넘어간다 (버튼이 먹통으로 보인다).
    if (this._sheetTap) {
      this.sheet.removeEventListener('click', this._sheetTap)
      this._sheetTap = null
    }
    this.sheet.textContent = ''
    this.sheet.className = 'sheet'   // 'story' 같은 이전 시트의 클래스가 남지 않게
    // 오버레이도 같이 되돌린다. closeOverlay() 는 hidden 만 뒤집으므로, 이걸
    // 빠뜨리면 컷신 뒤에 뜨는 결과·일시정지 시트에도 장소 사진이 남는다.
    // hidden 은 속성 선택자(.overlay[hidden])라 className 을 덮어써도 안전하다.
    this.overlay.className = 'overlay'
    this.overlay.hidden = false
    this._dismissible = dismissible
    return this.sheet
  }

  closeOverlay() {
    this.overlay.hidden = true
    if (this.h.onOverlayClosed) this.h.onOverlayClosed()
  }

  /**
   * 게임 안 확인창.
   * window.confirm() 은 OS 기본 대화상자라 게임 화면에서 튀고, 안드로이드 WebView에서는
   * 전체화면이 잠깐 풀리기도 한다 — 조작이 '이질적'으로 느껴지는 대표적인 원인이라 직접 만든다.
   * @returns {Promise<boolean>}
   */
  confirm(title, message, okLabel = tr('확인'), okClass = 'danger') {
    return new Promise((resolve) => {
      // 이미 열린 시트가 있으면 내용을 '노드째' 떼어 뒀다가 되돌린다.
      // innerHTML 로 복원하면 버튼의 이벤트 리스너가 전부 사라져 먹통이 된다.
      const wasOpen = !this.overlay.hidden
      const wasDismissible = this._dismissible
      const keep = document.createDocumentFragment()
      if (wasOpen) while (this.sheet.firstChild) keep.appendChild(this.sheet.firstChild)

      const finish = (value) => {
        if (wasOpen) {
          this.sheet.textContent = ''
          this.sheet.appendChild(keep)
          this._dismissible = wasDismissible
        } else {
          this.closeOverlay()
        }
        resolve(value)
      }
      const sheet = this._openSheet(false)
      sheet.appendChild(el('h2', null, title))
      if (message) sheet.appendChild(el('p', 'sub', message))
      const actions = el('div', 'sheet-actions')
      const ok = el('button', `btn ${okClass}`, okLabel)
      ok.addEventListener('click', () => finish(true))
      const no = el('button', 'btn ghost', tr('취소'))
      no.addEventListener('click', () => finish(false))
      actions.appendChild(ok)
      actions.appendChild(no)
      sheet.appendChild(actions)
    })
  }

  /**
   * 설정 화면 — SETTINGS_SCHEMA를 순회해 만든다.
   * 설정을 추가하려면 스키마에 한 줄만 넣으면 되고 여기는 손대지 않는다.
   */
  openSettings(settings, onChange) {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('설정')))
    sheet.appendChild(el('p', 'sub', tr('바꾸면 바로 저장된다')))

    for (const group of settingsGroups()) {
      const box = el('div', 'set-group')
      box.appendChild(el('h3', null, tr(group)))
      const rows = el('div', 'set-rows')
      box.appendChild(rows)

      for (const item of SETTINGS_SCHEMA.filter((s) => s.group === group)) {
        const row = el('div', 'set-row')
        const label = el('div', 'set-label')
        label.appendChild(document.createTextNode(tr(item.label)))
        if (item.hint) label.appendChild(el('span', 'hint', tr(item.hint)))
        row.appendChild(label)

        if (item.type === 'toggle') {
          const sw = el('label', 'switch')
          const input = document.createElement('input')
          input.type = 'checkbox'
          input.checked = !!settings[item.id]
          input.addEventListener('change', () => onChange(item.id, input.checked))
          sw.appendChild(input)
          sw.appendChild(el('span'))
          row.appendChild(sw)
        } else if (item.type === 'range') {
          const input = document.createElement('input')
          input.type = 'range'
          input.min = item.min; input.max = item.max; input.step = item.step
          input.value = settings[item.id]
          input.addEventListener('input', () => onChange(item.id, Number(input.value)))
          row.appendChild(input)
        } else {
          const sel = document.createElement('select')
          item.options.forEach(([value, text], i) => {
            const o = document.createElement('option')
            o.value = String(i)          // 숫자/문자 값을 모두 안전하게 다루려고 인덱스로 넘긴다
            o.textContent = tr(text)
            if (value === settings[item.id]) o.selected = true
            sel.appendChild(o)
          })
          sel.addEventListener('change', () => onChange(item.id, item.options[Number(sel.value)][0]))
          row.appendChild(sel)
        }
        rows.appendChild(row)
      }
      sheet.appendChild(box)
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn primary', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  /**
   * 펫 고르기 — 판 시작 전에 한 마리만 고른다.
   *
   * 판 안에서 못 바꾸는 것이 규칙이라 타이틀 화면에만 둔다. 전투 중에 바꿀 수 있으면
   * "지금 필요한 펫으로 갈아 끼우기"가 되어 고르는 의미가 없어진다.
   */
  openPets(progress, onPick, onBuy) {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('펫')))
    sheet.appendChild(el('p', 'sub', tr('판마다 한 마리만 데려간다')))

    const owned = new Set(progress.pets.owned)
    for (const pet of listPets()) {
      const has = owned.has(pet.id)
      const on = progress.pets.equipped === pet.id
      const row = el('div', `codex-item pet-row${on ? ' on' : ''}${has ? '' : ' locked'}`)
      const body = el('div')
      const h = el('h4', null, pet.name)
      if (on) h.appendChild(el('span', 'pet-badge', tr('데려가는 중')))
      body.appendChild(h)
      body.appendChild(el('p', null, pet.desc))
      row.appendChild(body)

      const act = el('div', 'pet-act')
      if (has) {
        const b = el('button', `btn ${on ? 'ghost' : 'primary'}`, on ? tr('데려가는 중') : tr('데려가기'))
        b.disabled = on
        b.addEventListener('click', () => onPick(pet.id))
        act.appendChild(b)
      } else {
        const b = el('button', 'btn', tr('캣닢 {price}', { price: pet.price }))
        b.disabled = progress.catnip < pet.price
        b.addEventListener('click', () => onBuy(pet.id))
        act.appendChild(b)
      }
      row.appendChild(act)
      sheet.appendChild(row)
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn primary', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  /**
   * 스킨 시트 — 한 고양이의 스킨 목록. 미리보기는 실제 그리기 경로(구운 스트립)라 판에서 보는 것과 같다.
   * 파는 길이 셋이다: 캣닢(price) · IAP 팩(sku → 상점) · 보상 전용(둘 다 없음).
   */
  openSkins(towerId, progress) {
    const def = getTower(towerId)
    if (!def) return
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('{defName} · 스킨', { defName: def.name })))
    sheet.appendChild(el('p', 'sub', tr('겉모습만 바뀐다 · 능력치는 그대로')))
    const owned = new Set((progress.skins && progress.skins.owned) || [])
    const current = equippedSkin(progress, towerId)

    const rowOf = (skin) => {
      const on = skin ? (current && current.id === skin.id) : !current
      const row = el('div', `codex-item pet-row skin-row${on ? ' on' : ''}`)
      row.appendChild(spriteCanvas(def, 52, skin))
      const body = el('div')
      const h = el('h4', null, skin ? skin.name : tr('기본'))
      if (on) h.appendChild(el('span', 'pet-badge', tr('장착 중')))
      body.appendChild(h)
      body.appendChild(el('p', null, skin ? skin.desc : tr('원래 모습')))
      row.appendChild(body)
      const act = el('div', 'pet-act')
      if (!skin || owned.has(skin.id)) {
        const b = el('button', `btn ${on ? 'ghost' : 'primary'}`, on ? tr('장착 중') : tr('장착'))
        b.disabled = on
        b.addEventListener('click', () => this.h.onEquipSkin(towerId, skin ? skin.id : null))
        act.appendChild(b)
      } else if (skin.price) {
        const b = el('button', 'btn')
        b.appendChild(catnipTag(skin.price))
        b.disabled = (progress.catnip || 0) < skin.price
        b.addEventListener('click', () => this.h.onBuySkin(skin.id))
        act.appendChild(b)
      } else if (skin.sku) {
        const product = productForSkin(skin.id)
        const b = el('button', 'btn', product ? `${tr(product.name)} · ${product.priceLabel}` : tr('상점'))
        b.addEventListener('click', () => this.h.onOpenStore('title', product ? product.id : null))
        act.appendChild(b)
      } else {
        act.appendChild(el('span', 'pet-badge dim', tr('보상')))
      }
      row.appendChild(act)
      return row
    }
    sheet.appendChild(rowOf(null))
    for (const skin of listSkins(towerId)) sheet.appendChild(rowOf(skin))

    const actions = el('div', 'sheet-actions')
    const back = el('button', 'btn ghost', tr('도감으로'))
    back.addEventListener('click', () => this.openCodex('towers'))
    actions.appendChild(back)
    sheet.appendChild(actions)
  }

  /**
   * 뽑기 — **확률 표가 화면의 절반이다.**
   *
   * 표는 `disclosureRows()` 가 만든다. 손으로 적지 않는 이유가 법이다: 캣닢을 현금으로도 사므로
   * 이건 확률형 아이템이고, 게임산업법이 요구하는 건 "표를 띄워라"가 아니라 **"띄운 값이 실제 값이어야 한다"** 다.
   * 문구를 여기 따로 적는 순간 `gacha.js` 를 고칠 때 한쪽만 고쳐지고 공개한 확률이 거짓말이 된다
   * (`gacha.test` 가 이 함수의 결과와 표를 대조한다).
   *
   * @param {object} progress
   * @param {Array|null} gained 방금 뽑은 결과 — 있으면 표 위에 보여 준다
   */
  openGacha(progress, gained = null) {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('뽑기')))
    sheet.appendChild(el('p', 'sub', tr('고양이 카드와 속성 룬 · 확률을 공개한다')))

    const purse = el('div', 'gacha-purse')
    purse.appendChild(el('span', 'purse-item', tr('티켓 {n}', { n: ticketCount(progress) })))
    const cat = el('span', 'purse-item')
    cat.appendChild(icon('leaf'))
    cat.append(` ${progress.catnip || 0}`)
    purse.appendChild(cat)
    purse.appendChild(el('span', 'purse-item', tr('조각 {n}', { n: shardCount(progress) })))
    sheet.appendChild(purse)

    if (gained && gained.length) {
      const box = el('div', 'gacha-result')
      box.appendChild(el('h3', 'codex-sub', tr('나온 것 {n}개', { n: gained.length })))
      const grid = el('div', 'gacha-grid')
      for (const g of gained) grid.appendChild(this._gainedCard(g))
      box.appendChild(grid)
      sheet.appendChild(box)
    }

    const table = el('div', 'gacha-table')
    for (const row of disclosureRows()) {
      const r = el('div', 'gacha-row')
      const head = el('div', 'k')
      head.appendChild(el('b', null, tr(row.name)))
      head.appendChild(el('span', 'pct', row.percent))
      r.appendChild(head)
      r.appendChild(el('p', null, tr(row.desc)))
      table.appendChild(r)
    }
    sheet.appendChild(table)
    sheet.appendChild(el('p', 'hint',
      tr('{n}연에는 새 고양이가 최소 한 장 나온다. 중복은 조각이 되고, 조각 {shards}개로 원하는 카드를 산다.',
        { n: PITY_AT, shards: SHARDS_PER_CARD })))

    const actions = el('div', 'sheet-actions')
    const drawBtn = (ten) => {
      const check = canDraw(progress, { ten })
      const b = el('button', `btn ${ten ? 'primary' : ''}`)
      b.append(ten ? tr('{n}연 ', { n: PITY_AT }) : tr('한 장 '))
      if (check.pay === 'ticket') b.append(tr('· 티켓 {n}', { n: check.amount }))
      else b.appendChild(catnipTag(check.amount))
      b.disabled = !check.ok
      b.addEventListener('click', () => this.h.onDraw({ ten }))
      return b
    }
    if (this.h.onDraw) { actions.appendChild(drawBtn(false)); actions.appendChild(drawBtn(true)) }
    const done = el('button', 'btn ghost', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  /** 뽑은 것 하나를 카드로. 고양이는 그림, 룬은 배지, 조각은 숫자. */
  _gainedCard(g) {
    const card = el('div', `gain-card${g.duplicate ? ' dup' : ''}`)
    if (g.kind === 'cat') {
      const def = getTower(g.id)
      if (def) card.appendChild(spriteCanvas(def, 44))
      card.appendChild(el('span', 'gain-name', def ? def.name : g.id))
      if (g.duplicate) card.appendChild(el('span', 'gain-sub', tr('중복 → 조각')))
    } else if (g.kind === 'rune') {
      const badge = elementBadge(g.id)
      if (badge) card.appendChild(badge)
      card.appendChild(el('span', 'gain-sub', tr('룬')))
    } else {
      card.appendChild(el('span', 'gain-name', tr('조각 +{n}', { n: g.amount })))
    }
    return card
  }

  /**
   * 속성 룬 — 고양이 하나에 끼운다. **룬은 소모되지 않는다**: 가진 개수는
   * "몇 마리에게 동시에 끼울 수 있나"를 뜻한다(그게 원정의 밸런스 제동이다).
   */
  openRunes(towerId, progress) {
    const def = getTower(towerId)
    if (!def) return
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('{defName} · 속성', { defName: def.name })))
    sheet.appendChild(el('p', 'sub', tr('룬을 끼우면 속성이 바뀐다 · 상성은 원정에서만 걸린다')))

    const equipped = (progress.runes && progress.runes.equipped) || {}
    const now = equipped[towerId] || null

    const rowOf = (element) => {
      const on = element === now || (element === null && !now)
      const base = element === null
      const eid = base ? def.element : element
      const row = el('div', `codex-item pet-row rune-row${on ? ' on' : ''}`)
      const body = el('div')
      const h = el('h4')
      const badge = elementBadge(eid)
      if (badge) h.appendChild(badge)
      else h.append(tr('무속성'))
      if (on) h.appendChild(el('span', 'pet-badge', tr('지금 이것')))
      body.appendChild(h)
      if (base) {
        body.appendChild(el('p', null, tr('타고난 속성 — 룬 없이 쓴다')))
      } else {
        body.appendChild(el('p', null, tr('{a}에 강하고 {b}에 약하다', {
          a: tr(ELEMENT_NAMES[beats(element)]), b: tr(ELEMENT_NAMES[beatenBy(element)]),
        })))
        body.appendChild(el('div', 'stat-pill', tr('가진 룬 {n}개', { n: runeCount(progress, element) })))
      }
      row.appendChild(body)
      const act = el('div', 'pet-act')
      const check = base ? { ok: true, reason: null } : canEquipRune(progress, towerId, element)
      const b = el('button', `btn ${on ? 'ghost' : 'primary'}`, on ? tr('장착 중') : tr('장착'))
      b.disabled = on || !check.ok
      if (!on && !check.ok) b.title = check.reason
      b.addEventListener('click', () => this.h.onEquipRune(towerId, element))
      act.appendChild(b)
      row.appendChild(act)
      return row
    }

    sheet.appendChild(rowOf(null))
    for (const e of ELEMENTS) sheet.appendChild(rowOf(e))
    sheet.appendChild(el('p', 'hint', tr('고리: 흙 → 번개 → 얼음 → 불 → 어둠 → 빛 → 흙 · 앞이 뒤에 강하다 (유리 ×1.5 · 불리 ×0.7)')))

    const actions = el('div', 'sheet-actions')
    const back = el('button', 'btn ghost', tr('도감으로'))
    back.addEventListener('click', () => this.openCodex('towers'))
    actions.appendChild(back)
    sheet.appendChild(actions)
  }

  /** 도감 — 레지스트리를 순회하므로 콘텐츠를 추가하면 자동으로 나타난다 */
  openCodex(tab = 'towers') {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('도감')))
    sheet.appendChild(el('p', 'sub', tr('누가 뭘 잡는지')))

    const tabs = el('div', 'codex-tabs')
    const mk = (id, text) => {
      const b = el('button', `chip${tab === id ? ' on' : ''}`, text)
      b.addEventListener('click', () => this.openCodex(id))
      return b
    }
    tabs.appendChild(mk('towers', tr('고양이')))
    tabs.appendChild(mk('cards', tr('카드')))
    tabs.appendChild(mk('enemies', tr('해충')))
    tabs.appendChild(mk('combos', tr('조합')))
    tabs.appendChild(mk('pets', tr('펫')))
    tabs.appendChild(mk('specials', tr('필살기')))
    tabs.appendChild(mk('achievements', tr('업적')))
    tabs.appendChild(mk('records', tr('기록')))
    sheet.appendChild(tabs)
    // 탭이 8개라 가로로 넘긴다 — 지금 탭이 화면 밖에 있으면 보이게 끌어온다
    const onChip = tabs.querySelector('.chip.on')
    if (onChip && typeof onChip.scrollIntoView === 'function') {
      onChip.scrollIntoView({ inline: 'center', block: 'nearest' })
    }

    const progress = this.h.progressView ? this.h.progressView() : null

    if (tab === 'pets') {
      // 펫 — 뭘 데려갈 수 있는지. 사는 건 타이틀의 펫 화면에서.
      const owned = new Set((progress && progress.pets && progress.pets.owned) || [])
      const on = progress && progress.pets ? progress.pets.equipped : null
      for (const pet of listPets()) {
        const row = el('div', `codex-item pet-row${owned.has(pet.id) ? '' : ' locked'}`)
        const body = el('div', 'body')
        const h = el('h4', null, pet.name)
        if (pet.id === on) h.appendChild(el('span', 'pet-badge', tr('데려가는 중')))
        else if (!owned.has(pet.id)) h.appendChild(el('span', 'pet-badge dim', tr('캣닢 {price}', { price: pet.price })))
        body.appendChild(h)
        body.appendChild(el('p', null, pet.desc))
        row.appendChild(body)
        sheet.appendChild(row)
      }
    } else if (tab === 'specials') {
      // 필살기와 연계 — 마나 비용·쿨다운을 한눈에. 연계는 순서와 시간이 전부다.
      for (const s of listSpecials()) {
        const row = el('div', 'codex-item')
        const ic = el('div', 'special-ic')
        ic.appendChild(iconOf(s.icon))
        row.appendChild(ic)
        const body = el('div', 'body')
        body.appendChild(el('h4', null, s.name))
        body.appendChild(el('p', null, s.desc))
        body.appendChild(el('div', 'stat-pill', tr('마나 {mana} · 쿨다운 {cooldown}초', { mana: s.mana, cooldown: s.cooldown })))
        row.appendChild(body)
        sheet.appendChild(row)
      }
      const combos = listSpecialCombos()
      if (combos.length) {
        sheet.appendChild(el('h3', 'codex-sub', tr('연계 — 이어 쓰면 더 세다')))
        const nameOf = (id) => (listSpecials().find((s) => s.id === id) || { name: id }).name
        for (const c of combos) {
          const row = el('div', 'codex-item combo-row')
          const body = el('div', 'body')
          body.appendChild(el('h4', null, c.name))
          body.appendChild(el('p', null, c.desc))
          const bonus = c.bonus.damageMul ? tr('피해 ×{damageMul}', { damageMul: c.bonus.damageMul }) : tr('마나 +{manaRefund}', { manaRefund: c.bonus.manaRefund })
          body.appendChild(el('div', 'stat-pill', tr('{v} → {v2} ({window}초 안) · {bonus}', { v: nameOf(c.from), v2: nameOf(c.to), window: c.window, bonus: bonus })))
          row.appendChild(body)
          sheet.appendChild(row)
        }
      }
    } else if (tab === 'achievements') {
      const defs = listAchievements()
      const done = (progress && progress.achievements && progress.achievements.unlocked) || {}
      const prog = achievementProgress(progress || { achievements: { unlocked: {} } }, defs)
      sheet.appendChild(el('p', 'codex-sub', tr('{done} / {total} 달성', { done: prog.done, total: prog.total })))
      for (const a of defs) {
        const got = !!done[a.id]
        const row = el('div', `codex-item ach-row${got ? ' done' : ' locked'}`)
        const mark = el('div', 'ach-mark')
        mark.appendChild(icon(got ? 'star' : 'lock'))
        row.appendChild(mark)
        const body = el('div', 'body')
        const h = el('h4', null, a.name)
        if (a.catnip) h.appendChild(catnipTag(a.catnip))
        body.appendChild(h)
        body.appendChild(el('p', null, a.desc))
        if (got) body.appendChild(el('div', 'ach-date', new Date(done[a.id]).toLocaleDateString(locale())))
        row.appendChild(body)
        sheet.appendChild(row)
      }
    } else if (tab === 'records') {
      // 평생 기록 — 판이 끝날 때마다 판 장부(accountRun)가 쌓은 것
      const st = (progress && progress.stats) || {}
      const grid = el('div', 'result-grid')
      const cell = (k, v) => {
        const c = el('div', 'result-cell')
        c.appendChild(el('div', 'k', k))
        c.appendChild(el('div', 'v', String(v)))
        grid.appendChild(c)
      }
      const topOf = (obj, nameOf) => {
        const entries = Object.entries(obj || {})
        if (!entries.length) return tr('아직 없음')
        entries.sort((a, b) => b[1] - a[1])
        return `${nameOf(entries[0][0])} ${entries[0][1]}`
      }
      const hours = Math.floor((st.playSec || 0) / 3600)
      const mins = Math.floor(((st.playSec || 0) % 3600) / 60)
      const endlessBest = Math.max(0, ...Object.values((progress && progress.endless && progress.endless.best) || {}))
      cell(tr('플레이'), tr('{v}판', { v: st.runs || 0 }))
      cell(tr('완전 방어'), tr('{v}회', { v: st.wins || 0 }))
      cell(tr('도달 웨이브 합'), st.wavesReached || 0)
      cell(tr('처치'), st.killed || 0)
      cell(tr('누출'), st.leaked || 0)
      cell(tr('보스 처치'), st.bossesKilled || 0)
      cell(tr('크리티컬'), st.crits || 0)
      cell(tr('필살기'), tr('{v}회', { v: st.specialsUsed || 0 }))
      cell(tr('지은 고양이'), st.towersBuilt || 0)
      cell(tr('판 시간'), `${hours}:${String(mins).padStart(2, '0')}`)
      cell(tr('캣닢 획득'), st.catnipEarned || 0)
      cell(tr('훈련 단계 합'), `${totalRanks(progress)} / ${listTowers().length * GROWTH_MAX}`)
      cell(tr('주간 도전 클리어'), tr('{v}주', { v: Object.keys((progress.weekly && progress.weekly.cleared) || {}).length }))
      cell(tr('무한 최고'), endlessBest ? tr('+{endlessBest}웨이브', { endlessBest: endlessBest }) : tr('아직 없음'))
      cell(tr('가장 많이 데려간 고양이'), topOf(st.towerUse, (id) => (getTower(id) || { name: id }).name))
      cell(tr('가장 많이 잡은 보스'), topOf(st.bossKills, (id) => (getEnemy(id) || { name: id }).name))
      cell(tr('첫 플레이'), st.firstPlayedAt ? new Date(st.firstPlayedAt).toLocaleDateString(locale()) : tr('아직 없음'))
      sheet.appendChild(grid)
    } else if (tab === 'towers') {
      for (const t of listTowers()) {
        const row = el('div', 'codex-item')
        row.appendChild(spriteCanvas(t, 52))
        const body = el('div')
        const h = el('h4', null, t.name)
        h.appendChild(goldTag(buildCost(t), 'cost inline'))
        body.appendChild(h)
        body.appendChild(el('p', null, t.desc))
        const s = t.levels[0]
        const tag = el('div', 'stat-pill')
        tag.textContent = tr('공격 {damage} · 사거리 {range} · {fireRate}/초 · ', { damage: s.damage, range: s.range, fireRate: s.fireRate })
          + targetsLabel(t)
        body.appendChild(tag)
        const eb = elementBadge(t.element)
        if (eb) body.appendChild(eb)
        // 훈련 — 캣닢을 쓰는 영구 단계. 판 밖(도감)에서만 산다.
        if (progress && this.h.onTrain) {
          const rank = growthRank(progress, t.id)
          const check = canTrain(progress, t.id)
          const act = el('div', 'train-row')
          act.appendChild(rankPips(rank))
          act.appendChild(el('span', 'train-label', rank > 0 ? tr('공격 +{rank}%', { rank: Math.round(rank * GROWTH_DAMAGE_PER_RANK * 100) }) : tr('훈련 전')))
          const b = el('button', `btn ${check.ok ? 'primary' : 'ghost'} train-btn`)
          if (check.cost === null) { b.textContent = tr('최고 단계'); b.disabled = true } else {
            b.append(tr('훈련 '))
            b.appendChild(catnipTag(check.cost))
            b.disabled = !check.ok
          }
          b.addEventListener('click', () => this.h.onTrain(t.id))
          act.appendChild(b)
          body.appendChild(act)
        }
        if (this.h.onOpenRunes) {
          const cur = (progress && progress.runes && progress.runes.equipped && progress.runes.equipped[t.id]) || null
          const chip = el('button', 'chip rune-chip',
            cur ? tr('속성 · {v}', { v: tr(ELEMENT_NAMES[cur]) }) : tr('속성 바꾸기'))
          chip.addEventListener('click', () => this.h.onOpenRunes(t.id))
          body.appendChild(chip)
        }
        if (this.h.onOpenSkins && listSkins(t.id).length) {
          const eq = equippedSkin(progress, t.id)
          const chip = el('button', 'chip skin-chip', eq ? tr('스킨 · {eqName}', { eqName: eq.name }) : tr('스킨 {v}종', { v: listSkins(t.id).length }))
          chip.addEventListener('click', () => this.h.onOpenSkins(t.id))
          body.appendChild(chip)
        }
        row.appendChild(body)
        sheet.appendChild(row)
      }
    } else if (tab === 'cards') {
      /* 카드 — 뽑기로 얻는 고양이. **여기는 "가진 것"만 보여 준다**(확률은 뽑기 화면이 공개한다).
       * 조각 교환이 이 탭에 있는 이유: "운이 나빠도 결국 도달한다"는 약속이 눈에 보여야 뜻이 있다. */
      const shards = shardCount(progress || {})
      sheet.appendChild(el('p', 'codex-sub',
        tr('조각 {shards}개 · 티켓 {tickets}장', { shards: shards, tickets: ticketCount(progress || {}) })))
      const cards = listTowers().filter((t) => t.rarity)
      if (cards.length === 0) {
        sheet.appendChild(el('p', 'hint', tr('카드로만 얻는 고양이는 아직 없다. 뽑기에서는 속성 룬과 조각이 나온다.')))
      }
      for (const t of cards) {
        const have = cardCount(progress || {}, t.id)
        const row = el('div', `codex-item pet-row${have ? '' : ' locked'}`)
        row.appendChild(spriteCanvas(t, 46))
        const body = el('div')
        const h = el('h4', null, t.name)
        h.appendChild(el('span', `pet-badge${have ? '' : ' dim'}`, have ? tr('{have}장', { have: have }) : tr('없음')))
        body.appendChild(h)
        body.appendChild(el('p', null, t.desc))
        const eb = elementBadge(t.element)
        if (eb) body.appendChild(eb)
        row.appendChild(body)
        if (this.h.onExchangeShards) {
          const act = el('div', 'pet-act')
          const check = canExchange(progress || {}, t.id)
          const b = el('button', `btn ${check.ok ? 'primary' : 'ghost'}`, tr('조각 {cost}', { cost: SHARDS_PER_CARD }))
          b.disabled = !check.ok
          b.addEventListener('click', () => this.h.onExchangeShards(t.id))
          act.appendChild(b)
          row.appendChild(act)
        }
        sheet.appendChild(row)
      }
      // 룬 — 가진 개수를 한 줄로. 어디에 끼웠는지는 고양이 탭의 '속성' 칩에서 본다.
      sheet.appendChild(el('h3', 'codex-sub', tr('속성 룬')))
      const runeWrap = el('div', 'rune-wrap')
      for (const e of ELEMENTS) {
        const n = runeCount(progress || {}, e)
        const chip = el('span', `rune-count${n ? '' : ' dim'}`)
        const badge = elementBadge(e)
        if (badge) chip.appendChild(badge)
        chip.append(` ${n}`)
        runeWrap.appendChild(chip)
      }
      sheet.appendChild(runeWrap)
      if (this.h.onGacha) {
        const go = el('button', 'btn primary', tr('뽑으러 가기'))
        go.addEventListener('click', () => this.h.onGacha())
        sheet.appendChild(go)
      }
    } else if (tab === 'combos') {
      // 조합 — 아직 못 만들어 본 것은 이름과 조건만 보여준다. 모으는 재미가 목적이다.
      const made = new Set(this.h.seenCombos ? this.h.seenCombos() : [])
      const shapeText = {
        adjacent: tr('상하좌우로 붙여서'), diagonal: tr('대각선으로 마주 보게'),
        line: tr('한 줄로 나란히'), near: tr('3×3 안에 모아서'),
      }
      for (const c of listCombos()) {
        const row = el('div', `codex-item combo-row${made.has(c.id) ? '' : ' locked'}`)
        const body = el('div', 'body')
        body.appendChild(el('h4', null, c.name))
        // 아직 못 만든 조합도 조건은 보여준다 — 안 알려주면 영원히 못 찾는다
        body.appendChild(el('p', null, made.has(c.id) ? c.desc : tr('아직 만들어 보지 않았다.')))
        // 필요한 고양이를 가로로 늘어놓는다. 세로로 쌓으면 다섯 마리짜리 조합에서
        // 한 줄이 화면 절반을 먹는다.
        const cats = el('div', 'combo-cats')
        for (const tid of c.towers) {
          const def = getTower(tid)
          if (def) cats.appendChild(spriteCanvas(def, 34))
        }
        cats.appendChild(el('span', 'combo-shape', shapeText[c.shape] || c.shape))
        body.appendChild(cats)
        row.appendChild(body)
        sheet.appendChild(row)
      }
    } else {
      for (const e of listEnemies()) {
        const row = el('div', 'codex-item')
        row.appendChild(spriteCanvas(e, 52))
        const body = el('div')
        const h = el('h4', null, e.name)
        if (e.boss) h.appendChild(icon('crown', 'i mark boss'))
        if (e.flying) h.appendChild(icon('wing', 'i mark air'))
        body.appendChild(h)
        body.appendChild(el('p', null, e.desc))
        const tag = el('div', 'stat-pill')
        tag.textContent = tr('체력 {baseHp} · 방어 {armor} · 속도 {speed} · 골드 {gold}', { baseHp: e.baseHp, armor: e.armor, speed: e.speed, gold: e.gold })
        body.appendChild(tag)
        // 보스 능력 — 이름과 수치. "체력만 많은 보스는 없다"를 도감에서도 보여준다.
        if (e.abilities && e.abilities.length > 0) {
          const list = el('div', 'ability-list')
          for (const ab of e.abilities) {
            const d = describeAbility(ab)
            if (!d) continue
            const chip = el('span', 'ability-chip')
            chip.appendChild(el('b', null, d.name))
            chip.append(` ${d.text}`)
            list.appendChild(chip)
          }
          body.appendChild(list)
        }
        row.appendChild(body)
        sheet.appendChild(row)
      }
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn primary', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  /**
   * 캣닢 상점 — 상품 배열을 순회해 만든다. shop.js에 한 줄 추가하면 여기 자동으로 나타난다.
   * @param {'ingame'|'title'|'defeat'} where 어디서 열었는지 (살 수 있는 소모품이 달라진다)
   * @param {object} progress 캣닢·구매 내역
   * @param {string} billingLabel 결제 제공자 표시 ('데모 결제' 등)
   */
  openStore(where, progress, billingLabel, focus = null) {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, tr('캣닢 상점')))
    const have0 = el('p', 'sub')
    have0.append(tr('보유 '))
    have0.appendChild(catnipTag(progress.catnip, 'cost inline catnip'))
    sheet.appendChild(have0)

    const items = availableItems(where === 'title' ? 'ingame' : where)
    if (items.length > 0) {
      const box = el('div', 'store-section')
      box.appendChild(el('h3', null, tr('캣닢으로 구매')))
      if (where === 'title') {
        box.appendChild(el('p', 'store-note', tr('게임 중에만 쓸 수 있다')))
      }
      for (const item of items) {
        const row = el('div', 'store-item')
        row.appendChild(el('div', 'ic')).appendChild(iconOf(item.icon))
        const body = el('div', 'body')
        body.appendChild(el('h4', null, tr(item.name)))
        body.appendChild(el('p', null, tr(item.desc)))
        row.appendChild(body)

        const buy = el('button', 'btn ghost buy')
        buy.appendChild(catnipTag(item.cost))
        const affordable = progress.catnip >= item.cost
        buy.disabled = !affordable || where === 'title'
        if (where !== 'title') buy.addEventListener('click', () => this.h.onBuyItem(item.id))
        row.appendChild(buy)
        box.appendChild(row)
      }
      sheet.appendChild(box)
    }

    // 데모 웹 빌드(site/play/)에는 유료 콘텐츠가 아예 없다 — 살 수 없는 것을 진열해 두면 거짓말이 된다.
    // 그래서 상품 목록 대신 어디서 전체판을 받는지 한 칸으로 알린다. 캣닢 소모품(위)은 그대로 산다.
    if (DEMO) {
      const box = el('div', 'store-section')
      box.appendChild(el('h3', null, tr('전체판')))
      box.appendChild(el('p', 'store-note', tr('이 데모에는 결제가 없다. 시나리오 3막 · 도전 팩 2 · 스킨 팩은 이 빌드에 들어 있지 않다.')))
      const link = el('a', 'btn primary buy', tr('안드로이드 앱 받기'))
      link.href = FULL_APP_URL
      link.target = '_blank'
      link.rel = 'noopener'
      box.appendChild(link)
      sheet.appendChild(box)

      const actions0 = el('div', 'sheet-actions')
      const done0 = el('button', 'btn primary', tr('닫기'))
      done0.addEventListener('click', () => this.closeOverlay())
      actions0.appendChild(done0)
      sheet.appendChild(actions0)
      return
    }

    // 실제 결제 상품 — 섹션은 shop.js 의 section 이 정한다. 결제가 안 붙은 빌드(미설정)에서는 숨기지 않고
    // '결제 준비 중' 으로 정직하게 보인다: 버튼을 누르면 실패가 그대로 뜬다.
    const notReady = /미설정/.test(billingLabel || '')
    const label = el('p', 'billing-label', tr('결제 방식: {billingLabel}', { billingLabel: billingLabel }))
    const sections = [
      { key: 'content', title: tr('콘텐츠'), note: tr('무료 범위(자유 모드 6맵 · 1~2막 · 도전 5종 · 펫 · 훈련 · 무한 · 주간)는 그대로다 — 이건 그 위에 얹는 것') },
      { key: 'skins', title: tr('스킨 팩'), note: tr('겉모습만 바뀐다 · 능력치는 그대로. 캣닢으로 사는 스킨은 도감의 스킨에서') },
      { key: 'catnip', title: tr('캣닢 충전'), note: tr('캣닢은 보스 처치·5웨이브마다·맵 클리어·도전·주간 첫 클리어로도 쌓인다. 결제 없이 30웨이브 전부 깰 수 있게 만들었다.') },
      { key: 'premium', title: tr('프리미엄'), note: null },
    ]
    let focusRow = null
    let first = true
    for (const sec of sections) {
      const prods = IAP_PRODUCTS.filter((p) => p.section === sec.key).sort((a, b) => a.order - b.order)
      if (!prods.length) continue
      const box = el('div', 'store-section')
      box.appendChild(el('h3', null, sec.title))
      if (first) { box.appendChild(label); first = false }
      if (sec.note) box.appendChild(el('p', 'store-note', sec.note))
      for (const prod of prods) {
        const row = el('div', `store-item${focus === prod.id ? ' focus' : ''}`)
        if (focus === prod.id) focusRow = row
        row.appendChild(el('div', 'ic')).appendChild(iconOf(prod.icon))
        const body = el('div', 'body')
        const h = el('h4', null, tr(prod.name))
        if (prod.badge) h.appendChild(el('span', 'badge', tr(prod.badge)))
        body.appendChild(h)
        body.appendChild(el('p', null, tr(prod.desc)))
        if (notReady && prod.kind === 'once') body.appendChild(el('p', 'store-note', tr('결제 준비 중 — 이 빌드에서는 아직 살 수 없다')))
        row.appendChild(body)

        if (prod.kind === 'once' && ownsGrants(progress, prod.grants)) {
          row.appendChild(el('span', 'owned buy', tr('보유 중')))
        } else {
          const buy = el('button', 'btn primary buy', prod.priceLabel)
          buy.addEventListener('click', () => this.h.onBuyIap(prod.id))
          row.appendChild(buy)
        }
        box.appendChild(row)
      }
      sheet.appendChild(box)
    }
    if (focusRow) requestAnimationFrame(() => { try { focusRow.scrollIntoView({ block: 'center' }) } catch { /* 스크롤 못 해도 괜찮다 */ } })

    const actions = el('div', 'sheet-actions')
    const restore = el('button', 'btn ghost', tr('구매 복원'))
    restore.addEventListener('click', () => this.h.onRestorePurchases())
    actions.appendChild(restore)
    const done = el('button', 'btn primary', tr('닫기'))
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  openPause() {
    const sheet = this._openSheet(false)
    sheet.appendChild(el('h2', null, tr('일시정지')))
    const actions = el('div', 'sheet-actions')

    const resume = el('button', 'btn primary', tr('계속하기'))
    resume.addEventListener('click', () => this.h.onResume())
    actions.appendChild(resume)

    const settings = el('button', 'btn ghost', tr('설정'))
    settings.addEventListener('click', () => this.h.onOpenSettings())
    actions.appendChild(settings)

    const codex = el('button', 'btn ghost', tr('도감'))
    codex.addEventListener('click', () => this.openCodex())
    actions.appendChild(codex)

    const store = el('button', 'btn ghost', tr('캣닢 상점'))
    store.addEventListener('click', () => this.h.onOpenStore('ingame'))
    actions.appendChild(store)

    const quit = el('button', 'btn danger', tr('포기하기'))
    quit.addEventListener('click', () => this.h.onQuit())
    actions.appendChild(quit)

    sheet.appendChild(actions)
  }

  /**
   * 결과 화면. chapter 를 주면 시나리오 판으로 보고 목표 판정과 별을 함께 보여준다.
   * 안 주면 지금까지와 똑같은 자유 모드 결과다.
   */
  openResult(summary, progress, chapter = null, extra = {}) {
    const sheet = this._openSheet(false)
    const judged = chapter ? evaluateObjectives(chapter, summary, getObjective) : null

    if (chapter) {
      sheet.appendChild(el('h2', null, tr('{order}장 · {title}', { order: chapter.order, title: chapter.title })))
      sheet.appendChild(this._stars(judged.stars))
      sheet.appendChild(el('p', 'sub',
        judged.primary.ok
          ? (judged.stars === MAX_STARS ? tr('완벽하다') : tr('통과. 별은 아직 남았다'))
          : tr('목표를 이루지 못했다')))

      const goals = el('div', 'goal-list')
      for (const g of [judged.primary, ...judged.bonus]) {
        const row = el('div', `goal-row${g.ok ? ' ok' : ''}`)
        row.appendChild(icon(g.ok ? 'star' : 'close'))
        row.appendChild(el('span', null, g.label))
        goals.appendChild(row)
      }
      sheet.appendChild(goals)
    } else if (extra.expedition) {
      /* 원정. 칸마다 별도 시트를 만들지 않고 여기서 갈라지는 이유: 남은 목숨·잡은 수·캣닢이
       * 그대로 필요한데 두 번 만들면 두 곳이 어긋난다. 대신 사다리와 '다음 칸'을 여기 얹는다. */
      const { exp, stage, livesLeft } = extra.expedition
      const last = stage === exp.stages.length - 1
      sheet.appendChild(el('h2', null, summary.cleared
        ? (last ? tr('원정 완주') : tr('{n}칸 돌파', { n: stage + 1 }))
        : tr('원정이 끝났다')))
      sheet.appendChild(el('p', 'sub', summary.cleared
        ? (last
          ? tr('{expName} · {total}칸을 전부 지났다', { expName: exp.name, total: exp.stages.length })
          : tr('{mapName} · 목숨 {livesLeft}이(가) 다음 칸으로 이어진다', { mapName: summary.mapName, livesLeft: livesLeft }))
        : tr('{n}칸 · {mapName} 에서 멈췄다 · 다시 하면 첫 칸부터다', { n: stage + 1, mapName: summary.mapName })))
      const chain = el('div', 'stage-chain big')
      for (let i = 0; i < exp.stages.length; i += 1) {
        const st = exp.stages[i]
        const look = ELEMENT_LOOK[st.element]
        const passed = summary.cleared ? i <= stage : i < stage
        const dot = el('span', `stage-dot${passed ? ' done' : ''}${i === stage ? ' now' : ''}`, look ? look.glyph : '?')
        if (look) dot.style.color = look.color
        chain.appendChild(dot)
      }
      sheet.appendChild(chain)
    } else if (summary.weeklyKey) {
      const ch = summary.challengeId ? getChallenge(summary.challengeId) : null
      sheet.appendChild(el('h2', null, summary.cleared ? tr('주간 도전 성공') : tr('주간 도전 실패')))
      sheet.appendChild(el('p', 'sub',
        `${summary.mapName}${ch ? ` · ${ch.name}` : ''} · `
        + (summary.cleared ? tr('{totalWaves}웨이브 전부 막았다', { totalWaves: summary.totalWaves }) : tr('{reachedWave}웨이브에서 멈췄다', { reachedWave: summary.reachedWave }))))
    } else if (summary.challengeId) {
      const ch = getChallenge(summary.challengeId)
      const name = ch ? ch.name : tr('도전')
      sheet.appendChild(el('h2', null, summary.cleared ? tr('{name} 도전 성공', { name: name }) : tr('{name} 도전 실패', { name: name })))
      sheet.appendChild(el('p', 'sub',
        summary.cleared
          ? tr('{mapName} · {totalWaves}웨이브 전부 막았다', { mapName: summary.mapName, totalWaves: summary.totalWaves })
          : tr('{mapName} · {reachedWave}웨이브에서 멈췄다', { mapName: summary.mapName, reachedWave: summary.reachedWave })))
    } else if (summary.endless) {
      // 무한은 언젠가 뚫린다 — 얼마나 버텼는지가 결과다
      const best = (progress && progress.endless && progress.endless.best && progress.endless.best[summary.mapId]) || 0
      sheet.appendChild(el('h2', null, tr('무한 방어 종료')))
      sheet.appendChild(el('p', 'sub',
        tr('{mapName} · 표 밖 +{endlessWaves}웨이브{v}', { mapName: summary.mapName, endlessWaves: summary.endlessWaves, v: best ? tr(' (최고 +{best})', { best: best }) : '' })))
    } else {
      sheet.appendChild(el('h2', null, summary.cleared ? tr('완전 방어') : tr('집이 뚫렸다')))
      sheet.appendChild(el('p', 'sub',
        summary.cleared
          ? tr('{mapName} · {totalWaves}웨이브 전부 막았다', { mapName: summary.mapName, totalWaves: summary.totalWaves })
          : tr('{mapName} · {reachedWave}웨이브에서 멈췄다', { mapName: summary.mapName, reachedWave: summary.reachedWave })))
    }

    const grid = el('div', 'result-grid')
    const cell = (k, v) => {
      const c = el('div', 'result-cell')
      c.appendChild(el('div', 'k', k))
      c.appendChild(el('div', 'v', String(v)))
      return c
    }
    grid.appendChild(cell(tr('도달 웨이브'), `${summary.reachedWave}/${summary.totalWaves}`))
    grid.appendChild(cell(tr('남은 목숨'), summary.livesLeft))
    grid.appendChild(cell(tr('처치'), summary.killed))
    grid.appendChild(cell(tr('누출'), summary.leaked))
    grid.appendChild(cell(tr('보스 처치'), summary.bossesKilled))
    grid.appendChild(cell(tr('크리티컬'), summary.crits))
    grid.appendChild(cell(tr('획득 골드'), summary.goldEarned))
    grid.appendChild(cell(tr('총 피해량'), Math.round(summary.damageDealt)))
    const catnipCell = el('div', 'result-cell')
    catnipCell.appendChild(el('div', 'k', tr('획득 캣닢')))
    const cv = el('div', 'v catnip')
    cv.appendChild(icon('leaf'))
    cv.appendChild(el('b', 'num', String(summary.catnipEarned)))
    catnipCell.appendChild(cv)
    grid.appendChild(catnipCell)
    sheet.appendChild(grid)

    // 이 판에서 풀린 업적
    const unlocked = (extra && extra.unlocked) || []
    if (unlocked.length) {
      const box = el('div', 'ach-unlocked')
      box.appendChild(el('h3', null, tr('업적 달성')))
      for (const a of unlocked) {
        const row = el('div', 'ach-line')
        row.appendChild(icon('star'))
        row.append(`${a.name}`)
        if (a.catnip) row.appendChild(catnipTag(a.catnip))
        box.appendChild(row)
      }
      sheet.appendChild(box)
    }

    const actions = el('div', 'sheet-actions')

    // 패배했을 때만 이어하기를 권한다 (캣닢이 있으면 바로 살 수 있게)
    if (!summary.cleared) {
      const item = catnipItem('revive')
      const have = (progress && progress.catnip) || 0
      const revive = el('button', 'btn primary')
      revive.appendChild(iconOf(item.icon))
      revive.append(tr('이어하기'))
      revive.appendChild(catnipTag(item.cost))
      revive.appendChild(el('span', 'note', tr('보유 {have}', { have: have })))
      revive.disabled = have < item.cost
      revive.addEventListener('click', () => this.h.onRevive())
      actions.appendChild(revive)

      if (have < item.cost) {
        const store = el('button', 'btn ghost', tr('캣닢 충전'))
        store.addEventListener('click', () => this.h.onOpenStore('defeat'))
        actions.appendChild(store)
      }
    }

    // 시나리오에서 목표를 이뤘으면 다음 장으로 바로 넘어가는 게 자연스럽다
    if (chapter && judged.primary.ok && this.h.onNextChapter) {
      const nextCh = listChapters().find((c) => c.order === chapter.order + 1)
      if (nextCh) {
        const go = el('button', 'btn primary', tr('{order}장 · {title}', { order: nextCh.order, title: nextCh.title }))
        go.addEventListener('click', () => this.h.onNextChapter(nextCh.id))
        actions.appendChild(go)
      }
    }

    // 자유 모드를 다 막았으면 표 밖으로 계속 갈 수 있다
    // 원정 칸을 무한으로 이어 가면 목숨을 잇는다는 규칙이 사라진다
    const canEndless = summary.cleared && !chapter && !summary.endless && !summary.challengeId
      && !summary.weeklyKey && !extra.expedition && this.h.onEndless
    if (canEndless) {
      const go = el('button', 'btn primary', tr('계속 버티기 (무한)'))
      go.addEventListener('click', () => this.h.onEndless())
      actions.appendChild(go)
    }

    if (extra.expedition && summary.cleared && extra.expedition.stage < extra.expedition.exp.stages.length - 1 && this.h.onNextStage) {
      const nextSt = extra.expedition.exp.stages[extra.expedition.stage + 1]
      const b = el('button', 'btn primary')
      b.append(tr('다음 칸 · '))
      const eb = elementBadge(nextSt.element)
      if (eb) b.appendChild(eb)
      b.addEventListener('click', () => this.h.onNextStage())
      actions.appendChild(b)
    }

    const retry = el('button', 'btn ' + (summary.cleared && !chapter && !canEndless && !extra.expedition ? 'primary' : 'ghost'),
      extra.expedition ? tr('원정 다시') : tr('다시 도전'))
    retry.addEventListener('click', () => this.h.onRetry())
    actions.appendChild(retry)

    const back = el('button', 'btn ghost', chapter ? tr('챕터 목록으로') : tr('맵 선택으로'))
    back.addEventListener('click', () => this.h.onQuit())
    actions.appendChild(back)

    sheet.appendChild(actions)
  }
}
