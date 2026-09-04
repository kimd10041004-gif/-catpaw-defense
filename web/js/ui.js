/**
 * DOM UI — 화면 전환, HUD, 상점, 타워 패널, 설정, 도감, 결과.
 *
 * 설정 화면과 도감은 손으로 쓰지 않고 데이터에서 생성한다:
 *   설정 = SETTINGS_SCHEMA 순회 / 도감 = 레지스트리 순회
 * 그래서 콘텐츠나 설정을 추가해도 이 파일은 그대로 둬도 된다.
 */

import {
  listTowers, listEnemies, listMaps, listChapters, listCombos, listPets,
  getObjective, getTower,
} from './content/registry.js'
import { drawUnit, getFrameImage, onFrameSetsReady } from './framesets.js'
import { SETTINGS_SCHEMA, settingsGroups } from './domain/settings.js'
import { buildPath } from './domain/path.js'
import { TARGET_MODE_LABELS } from './domain/targeting.js'
import { buildCost } from './domain/economy.js'
import { availableItems, IAP_PRODUCTS, catnipItem } from './domain/shop.js'
import { isChapterUnlocked } from './domain/save.js'
import { evaluateObjectives, MAX_STARS } from './domain/objectives.js'

const $ = (id) => document.getElementById(id)

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
function spriteCanvas(def, cssSize) {
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
    drawUnit(ctx, def, { x: cssSize / 2, y: cssSize / 2, r: cssSize * 0.34 })
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

  showScreen(name) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = true
    $(`screen-${name}`).hidden = false
    this.screen = name
  }

  setBootStatus(text) { $('boot-status').textContent = text }

  toast(message) {
    const node = $('toast')
    node.textContent = message
    node.hidden = false
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => { node.hidden = true }, 1600)
  }

  // ---------------------------------------------------------- 맵 선택

  renderMapList(progress) {
    const list = $('map-list')
    list.textContent = ''
    for (const m of listMaps()) {
      const unlocked = progress.unlockedMaps.includes(m.id)
      const card = el('button', 'map-card')
      card.disabled = !unlocked
      card.appendChild(mapThumb(m, 68)).className = 'map-thumb'

      const body = el('div', 'map-body')
      body.appendChild(el('h3', null, m.name))
      body.appendChild(el('p', null, m.desc))
      const best = progress.bestWave[m.id] || 0
      const clears = progress.clears[m.id] || 0
      const meta = el('div', `map-meta${unlocked ? '' : ' locked'}`)
      meta.textContent = unlocked
        ? `난이도 ×${m.difficulty.toFixed(2)} · 최고 ${best}웨이브${clears ? ` · 클리어 ${clears}회` : ''}`
        : '앞 맵을 깨야 열린다'
      body.appendChild(meta)
      card.appendChild(body)

      if (!unlocked) card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
      else card.addEventListener('click', () => this.h.onSelectMap(m.id))
      list.appendChild(card)
    }
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
    for (const ch of all) {
      const unlocked = isChapterUnlocked(progress, ch, all)
      const stars = (progress.scenario && progress.scenario.stars[ch.id]) || 0
      const card = el('button', 'map-card')
      card.disabled = !unlocked

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
      } else {
        body.appendChild(el('div', 'map-meta locked', '앞 장을 깨야 열린다'))
      }
      card.appendChild(body)

      if (!unlocked) card.appendChild(el('span', 'lock')).appendChild(icon('lock'))
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
    let i = 0

    const box = el('div', 'story-box')
    sheet.appendChild(box)
    const hint = el('div', 'story-hint', '탭해서 넘기기')
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
      hint.textContent = i === cards.length - 1 ? '탭해서 시작' : '탭해서 넘기기'
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
    for (const def of listTowers()) {
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
        card.appendChild(el('div', 'tag', '시나리오 보상'))
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
      card.appendChild(spriteCanvas(def, 42))
      card.appendChild(el('div', 'nm', def.name))
      card.appendChild(goldTag(cost))
      card.appendChild(el('div', 'tag', def.targets === 'ground' ? '지상 전용' : def.targets === 'air' ? '공중 전용' : ' '))
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
        node.cd.textContent = st.cooled ? `${st.short} 부족` : String(Math.ceil(st.remaining))
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
    $('wave-label').textContent = game.phase === 'prep'
      ? `WAVE ${game.nextWaveNo} / ${game.totalWaves} · 준비`
      : `WAVE ${game.waveNo} / ${game.totalWaves} · 남은 해충 ${alive}`
    $('wavebar').classList.toggle('danger', game.lives <= Math.max(3, game.maxLives * 0.25))

    const btn = $('btn-wave')
    const prep = game.phase === 'prep'
    btn.disabled = !prep || game.waveNo >= game.totalWaves
    btn.textContent = ''
    if (prep) {
      // 짧게 — 긴 문장을 버튼에 밀어 넣으면 한 줄에 안 들어가고 읽기 어렵다
      btn.append(`${game.nextWaveNo}웨이브 시작`)
      const secs = Math.ceil(game.prepRemaining)
      if (secs > 0) btn.appendChild(el('span', 'sub', `자동 ${secs}초`))
    } else {
      btn.append(`${game.waveNo}웨이브 진행 중…`)
    }

    const badge = $('prep-badge')
    if (prep && game.prepRemaining > 0) {
      badge.hidden = false
      badge.textContent = ''
      badge.appendChild(icon('clock'))
      badge.append(`${Math.ceil(game.prepRemaining)}초`)
    } else {
      badge.hidden = true
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
    head.appendChild(spriteCanvas(tower.def, 34))
    head.appendChild(el('h3', null, tower.def.name))
    head.appendChild(el('span', 'tp-lv', `Lv.${info.level}/${info.maxLevel}`))
    const close = el('button', 'icon-btn tp-close')
    close.appendChild(icon('close'))
    close.setAttribute('aria-label', '닫기')
    close.addEventListener('click', () => this.h.onDeselect())
    head.appendChild(close)
    panel.appendChild(head)

    const stats = el('div', 'tp-stats')
    const pill = (label, value, next) => {
      const p = el('span', 'stat-pill')
      p.append(label)
      p.appendChild(el('b', null, String(value)))
      if (next !== undefined && next !== null && String(next) !== String(value)) {
        p.appendChild(el('b', 'up', `▲${next}`))
      }
      return p
    }
    const s = info.stats
    const n = info.next
    stats.appendChild(pill('공격력', s.damage, n && n.damage))
    stats.appendChild(pill('사거리', s.range.toFixed(1), n && n.range.toFixed(1)))
    stats.appendChild(pill('연사', `${s.fireRate.toFixed(2)}/초`, n && `${n.fireRate.toFixed(2)}/초`))
    stats.appendChild(pill('초당피해', info.dps, n && Math.round(n.damage * n.fireRate * 10) / 10))
    for (const fx of s.effects || []) {
      if (fx.kind === 'slow') stats.appendChild(pill('둔화', `${Math.round(fx.factor * 100)}% / ${fx.duration}초`))
      if (fx.kind === 'splash') stats.appendChild(pill('폭발 반경', fx.radius.toFixed(1)))
      if (fx.kind === 'aura') stats.appendChild(pill('범위 전체 타격', '○'))
    }
    panel.appendChild(stats)

    const actions = el('div', 'tp-actions')
    const upBtn = el('button', 'btn primary upgrade')
    if (info.upgradeCost === null) {
      upBtn.textContent = '최대 레벨'
      upBtn.disabled = true
    } else {
      // 버튼 안에서는 아이콘을 빼고 숫자만 — 작은 동전은 그냥 점으로 보인다
      upBtn.append('업그레이드')
      upBtn.appendChild(el('span', 'amt num', String(info.upgradeCost)))
      upBtn.disabled = game.gold < info.upgradeCost
      upBtn.addEventListener('click', () => this.h.onUpgrade(tower))
    }
    actions.appendChild(upBtn)

    const tgtBtn = el('button', 'btn ghost stack')
    tgtBtn.appendChild(el('span', 'lbl', '표적'))
    tgtBtn.appendChild(el('span', 'val', TARGET_MODE_LABELS[tower.targetMode]))
    tgtBtn.title = '표적 우선순위 바꾸기'
    tgtBtn.addEventListener('click', () => this.h.onCycleTarget(tower))
    actions.appendChild(tgtBtn)

    const sellBtn = el('button', 'btn danger')
    sellBtn.append('판매')
    sellBtn.appendChild(el('span', 'amt num', String(info.sellValue)))
    sellBtn.addEventListener('click', () => this.h.onSell(tower))
    actions.appendChild(sellBtn)

    panel.appendChild(actions)
  }

  hideTowerPanel() { $('tower-panel').hidden = true }

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
  confirm(title, message, okLabel = '확인', okClass = 'danger') {
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
      const no = el('button', 'btn ghost', '취소')
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
    sheet.appendChild(el('h2', null, '설정'))
    sheet.appendChild(el('p', 'sub', '바꾸면 바로 저장된다'))

    for (const group of settingsGroups()) {
      const box = el('div', 'set-group')
      box.appendChild(el('h3', null, group))
      const rows = el('div', 'set-rows')
      box.appendChild(rows)

      for (const item of SETTINGS_SCHEMA.filter((s) => s.group === group)) {
        const row = el('div', 'set-row')
        const label = el('div', 'set-label')
        label.appendChild(document.createTextNode(item.label))
        if (item.hint) label.appendChild(el('span', 'hint', item.hint))
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
            o.textContent = text
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
    const done = el('button', 'btn primary', '닫기')
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
    sheet.appendChild(el('h2', null, '펫'))
    sheet.appendChild(el('p', 'sub', '판마다 한 마리만 데려간다'))

    const owned = new Set(progress.pets.owned)
    for (const pet of listPets()) {
      const has = owned.has(pet.id)
      const on = progress.pets.equipped === pet.id
      const row = el('div', `codex-item pet-row${on ? ' on' : ''}${has ? '' : ' locked'}`)
      const body = el('div')
      const h = el('h4', null, pet.name)
      if (on) h.appendChild(el('span', 'pet-badge', '데려가는 중'))
      body.appendChild(h)
      body.appendChild(el('p', null, pet.desc))
      row.appendChild(body)

      const act = el('div', 'pet-act')
      if (has) {
        const b = el('button', `btn ${on ? 'ghost' : 'primary'}`, on ? '데려가는 중' : '데려가기')
        b.disabled = on
        b.addEventListener('click', () => onPick(pet.id))
        act.appendChild(b)
      } else {
        const b = el('button', 'btn', `캣닢 ${pet.price}`)
        b.disabled = progress.catnip < pet.price
        b.addEventListener('click', () => onBuy(pet.id))
        act.appendChild(b)
      }
      row.appendChild(act)
      sheet.appendChild(row)
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn primary', '닫기')
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  /** 도감 — 레지스트리를 순회하므로 콘텐츠를 추가하면 자동으로 나타난다 */
  openCodex(tab = 'towers') {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, '도감'))
    sheet.appendChild(el('p', 'sub', '누가 뭘 잡는지'))

    const tabs = el('div', 'codex-tabs')
    const mk = (id, text) => {
      const b = el('button', `chip${tab === id ? ' on' : ''}`, text)
      b.addEventListener('click', () => this.openCodex(id))
      return b
    }
    tabs.appendChild(mk('towers', '고양이'))
    tabs.appendChild(mk('enemies', '해충'))
    tabs.appendChild(mk('combos', '조합'))
    sheet.appendChild(tabs)

    if (tab === 'towers') {
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
        tag.textContent = `공격 ${s.damage} · 사거리 ${s.range} · ${s.fireRate}/초 · `
          + (t.targets === 'ground' ? '지상 전용' : t.targets === 'air' ? '공중 전용' : '지상+공중')
        body.appendChild(tag)
        row.appendChild(body)
        sheet.appendChild(row)
      }
    } else if (tab === 'combos') {
      // 조합 — 아직 못 만들어 본 것은 이름과 조건만 보여준다. 모으는 재미가 목적이다.
      const made = new Set(this.h.seenCombos ? this.h.seenCombos() : [])
      const shapeText = {
        adjacent: '상하좌우로 붙여서', diagonal: '대각선으로 마주 보게',
        line: '한 줄로 나란히', near: '3×3 안에 모아서',
      }
      for (const c of listCombos()) {
        const row = el('div', `codex-item combo-row${made.has(c.id) ? '' : ' locked'}`)
        const body = el('div', 'body')
        body.appendChild(el('h4', null, c.name))
        // 아직 못 만든 조합도 조건은 보여준다 — 안 알려주면 영원히 못 찾는다
        body.appendChild(el('p', null, made.has(c.id) ? c.desc : '아직 만들어 보지 않았다.'))
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
        tag.textContent = `체력 ${e.baseHp} · 방어 ${e.armor} · 속도 ${e.speed} · 골드 ${e.gold}`
        body.appendChild(tag)
        row.appendChild(body)
        sheet.appendChild(row)
      }
    }

    const actions = el('div', 'sheet-actions')
    const done = el('button', 'btn primary', '닫기')
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
  openStore(where, progress, billingLabel) {
    const sheet = this._openSheet()
    sheet.appendChild(el('h2', null, '캣닢 상점'))
    const have0 = el('p', 'sub')
    have0.append('보유 ')
    have0.appendChild(catnipTag(progress.catnip, 'cost inline catnip'))
    sheet.appendChild(have0)

    const items = availableItems(where === 'title' ? 'ingame' : where)
    if (items.length > 0) {
      const box = el('div', 'store-section')
      box.appendChild(el('h3', null, '캣닢으로 구매'))
      if (where === 'title') {
        box.appendChild(el('p', 'store-note', '게임 중에만 쓸 수 있다'))
      }
      for (const item of items) {
        const row = el('div', 'store-item')
        row.appendChild(el('div', 'ic')).appendChild(iconOf(item.icon))
        const body = el('div', 'body')
        body.appendChild(el('h4', null, item.name))
        body.appendChild(el('p', null, item.desc))
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

    const iap = el('div', 'store-section')
    iap.appendChild(el('h3', null, '캣닢 충전'))
    iap.appendChild(el('p', 'billing-label', `결제 방식: ${billingLabel}`))
    iap.appendChild(el('p', 'store-note',
      '캣닢은 보스 처치·5웨이브마다·맵 클리어로도 쌓인다. 결제 없이 30웨이브 전부 깰 수 있게 만들었다.'))

    for (const prod of IAP_PRODUCTS) {
      const row = el('div', 'store-item')
      row.appendChild(el('div', 'ic')).appendChild(iconOf(prod.icon))
      const body = el('div', 'body')
      const h = el('h4', null, prod.name)
      if (prod.badge) h.appendChild(el('span', 'badge', prod.badge))
      body.appendChild(h)
      body.appendChild(el('p', null, prod.desc))
      row.appendChild(body)

      if (prod.permanent && progress.premium) {
        row.appendChild(el('span', 'owned buy', '보유 중'))
      } else {
        const buy = el('button', 'btn primary buy', prod.priceLabel)
        buy.addEventListener('click', () => this.h.onBuyIap(prod.id))
        row.appendChild(buy)
      }
      iap.appendChild(row)
    }
    sheet.appendChild(iap)

    const actions = el('div', 'sheet-actions')
    const restore = el('button', 'btn ghost', '구매 복원')
    restore.addEventListener('click', () => this.h.onRestorePurchases())
    actions.appendChild(restore)
    const done = el('button', 'btn primary', '닫기')
    done.addEventListener('click', () => this.closeOverlay())
    actions.appendChild(done)
    sheet.appendChild(actions)
  }

  openPause() {
    const sheet = this._openSheet(false)
    sheet.appendChild(el('h2', null, '일시정지'))
    const actions = el('div', 'sheet-actions')

    const resume = el('button', 'btn primary', '계속하기')
    resume.addEventListener('click', () => this.h.onResume())
    actions.appendChild(resume)

    const settings = el('button', 'btn ghost', '설정')
    settings.addEventListener('click', () => this.h.onOpenSettings())
    actions.appendChild(settings)

    const codex = el('button', 'btn ghost', '도감')
    codex.addEventListener('click', () => this.openCodex())
    actions.appendChild(codex)

    const store = el('button', 'btn ghost', '캣닢 상점')
    store.addEventListener('click', () => this.h.onOpenStore('ingame'))
    actions.appendChild(store)

    const quit = el('button', 'btn danger', '포기하기')
    quit.addEventListener('click', () => this.h.onQuit())
    actions.appendChild(quit)

    sheet.appendChild(actions)
  }

  /**
   * 결과 화면. chapter 를 주면 시나리오 판으로 보고 목표 판정과 별을 함께 보여준다.
   * 안 주면 지금까지와 똑같은 자유 모드 결과다.
   */
  openResult(summary, progress, chapter = null) {
    const sheet = this._openSheet(false)
    const judged = chapter ? evaluateObjectives(chapter, summary, getObjective) : null

    if (chapter) {
      sheet.appendChild(el('h2', null, `${chapter.order}장 · ${chapter.title}`))
      sheet.appendChild(this._stars(judged.stars))
      sheet.appendChild(el('p', 'sub',
        judged.primary.ok
          ? (judged.stars === MAX_STARS ? '완벽하다' : '통과. 별은 아직 남았다')
          : '목표를 이루지 못했다'))

      const goals = el('div', 'goal-list')
      for (const g of [judged.primary, ...judged.bonus]) {
        const row = el('div', `goal-row${g.ok ? ' ok' : ''}`)
        row.appendChild(icon(g.ok ? 'star' : 'close'))
        row.appendChild(el('span', null, g.label))
        goals.appendChild(row)
      }
      sheet.appendChild(goals)
    } else {
      sheet.appendChild(el('h2', null, summary.cleared ? '완전 방어' : '집이 뚫렸다'))
      sheet.appendChild(el('p', 'sub',
        summary.cleared
          ? `${summary.mapName} · ${summary.totalWaves}웨이브 전부 막았다`
          : `${summary.mapName} · ${summary.reachedWave}웨이브에서 멈췄다`))
    }

    const grid = el('div', 'result-grid')
    const cell = (k, v) => {
      const c = el('div', 'result-cell')
      c.appendChild(el('div', 'k', k))
      c.appendChild(el('div', 'v', String(v)))
      return c
    }
    grid.appendChild(cell('도달 웨이브', `${summary.reachedWave}/${summary.totalWaves}`))
    grid.appendChild(cell('남은 목숨', summary.livesLeft))
    grid.appendChild(cell('처치', summary.killed))
    grid.appendChild(cell('누출', summary.leaked))
    grid.appendChild(cell('보스 처치', summary.bossesKilled))
    grid.appendChild(cell('크리티컬', summary.crits))
    grid.appendChild(cell('획득 골드', summary.goldEarned))
    grid.appendChild(cell('총 피해량', Math.round(summary.damageDealt)))
    const catnipCell = el('div', 'result-cell')
    catnipCell.appendChild(el('div', 'k', '획득 캣닢'))
    const cv = el('div', 'v catnip')
    cv.appendChild(icon('leaf'))
    cv.appendChild(el('b', 'num', String(summary.catnipEarned)))
    catnipCell.appendChild(cv)
    grid.appendChild(catnipCell)
    sheet.appendChild(grid)

    const actions = el('div', 'sheet-actions')

    // 패배했을 때만 이어하기를 권한다 (캣닢이 있으면 바로 살 수 있게)
    if (!summary.cleared) {
      const item = catnipItem('revive')
      const have = (progress && progress.catnip) || 0
      const revive = el('button', 'btn primary')
      revive.appendChild(iconOf(item.icon))
      revive.append('이어하기')
      revive.appendChild(catnipTag(item.cost))
      revive.appendChild(el('span', 'note', `보유 ${have}`))
      revive.disabled = have < item.cost
      revive.addEventListener('click', () => this.h.onRevive())
      actions.appendChild(revive)

      if (have < item.cost) {
        const store = el('button', 'btn ghost', '캣닢 충전')
        store.addEventListener('click', () => this.h.onOpenStore('defeat'))
        actions.appendChild(store)
      }
    }

    // 시나리오에서 목표를 이뤘으면 다음 장으로 바로 넘어가는 게 자연스럽다
    if (chapter && judged.primary.ok && this.h.onNextChapter) {
      const nextCh = listChapters().find((c) => c.order === chapter.order + 1)
      if (nextCh) {
        const go = el('button', 'btn primary', `${nextCh.order}장 · ${nextCh.title}`)
        go.addEventListener('click', () => this.h.onNextChapter(nextCh.id))
        actions.appendChild(go)
      }
    }

    const retry = el('button', 'btn ' + (summary.cleared && !chapter ? 'primary' : 'ghost'), '다시 도전')
    retry.addEventListener('click', () => this.h.onRetry())
    actions.appendChild(retry)

    const back = el('button', 'btn ghost', chapter ? '챕터 목록으로' : '맵 선택으로')
    back.addEventListener('click', () => this.h.onQuit())
    actions.appendChild(back)

    sheet.appendChild(actions)
  }
}
