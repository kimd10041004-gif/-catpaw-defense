/**
 * 부팅과 조율 — 콘텐츠 검증 → 진행도 로드 → 화면 전환 → 게임 루프 → 입력.
 * 시뮬레이션(game.js)·그리기(render.js)·DOM(ui.js)을 이어 붙이기만 한다.
 */

import './content/index.js'
import { validateAll } from './content/registry.js'
import { loadFrameSets } from './framesets.js'
import { loadMapArt } from './mapart.js'
import * as framesets from './framesets.js'
import {
  getMap, getTower, getPet, nextMapId, getChapter, listChapters, getObjective,
} from './content/registry.js'
import * as registry from './content/registry.js'
import { Game } from './game.js'
import { Renderer } from './render.js'
import { Audio } from './audio.js'
import { UI } from './ui.js'
import {
  loadProgress, saveProgress, recordResult, addCatnip, recordChapter, setAllTowerIds,
} from './domain/save.js'
import { detectBilling, applyPurchase, BillingError } from './domain/billing.js'
import { canBuy, catnipItem, iapProduct, IAP_PRODUCTS, catnipMultiplier } from './domain/shop.js'
import { catnipForMapClear } from './domain/economy.js'
import { difficultyOf, normalizeSettings } from './domain/settings.js'
import { nearestBuildable } from './domain/path.js'
import { evaluateObjectives } from './domain/objectives.js'

/** 고정 타임스텝 — 배속과 기기 성능이 달라도 시뮬레이션 결과가 같도록 */
const STEP = 1 / 60
const SPEEDS = [1, 2, 3]

class App {
  /** 이 정도 이상 움직였으면 탭이 아니라 밀기로 본다 (손가락 흔들림은 보통 6px 이내) */
  static TAP_SLOP_PX = 12
  /** 이보다 오래 누르고 있었으면 탭으로 치지 않는다 */
  static TAP_MAX_MS = 700

  constructor() {
    this.progress = loadProgress(window.localStorage)
    this.settings = normalizeSettings(this.progress.settings)
    this.audio = new Audio(this.settings)
    this.billing = detectBilling()
    this._catnipSynced = 0
    this.renderer = new Renderer(document.getElementById('canvas'))

    this.game = null
    this.paused = false
    this.speed = this.settings.defaultSpeed
    this.selectedTower = null   // 화면에서 선택한 타워
    this.placingId = null       // 상점에서 고른 고양이 id
    this.hover = null           // 놓일 칸 (스냅 보정된 결과)
    this.hoverOk = false        // 그 칸에 지을 수 있는가
    this.drag = null            // 진행 중인 배치 드래그
    this._press = null          // 탭 판정용 pointerdown 기록
    this.screen = 'title'
    this.acc = 0
    this.lastFrame = 0

    this.ui = new UI(this._handlers())
    this._applySettingsSideEffects()
    this._bindCanvas()
    this._bindShopDrag()
    this._bindResize()
    this._bindHistory()

    requestAnimationFrame((t) => this._frame(t))
  }

  // ---------------------------------------------------------- 핸들러

  _handlers() {
    return {
      onPlay: () => { this.audio.unlock(); this._goto('maps') },
      // 도감 조합 탭이 "만들어 본 것"을 흐리게/또렷하게 가르는 데 쓴다.
      // UI 가 진행도 전체를 들고 있으면 어디서든 고칠 수 있게 되므로 필요한 것만 준다.
      seenCombos: () => [...(this.progress.combosSeen || [])],
      onPets: () => { this.audio.unlock(); this._openPets() },
      onSelectMap: (id) => this.startGame(id),
      onScenario: () => {
        this.audio.unlock()
        this.ui.renderChapterList(this.progress)
        this._goto('chapters')
      },
      onSelectChapter: (id) => this.startChapter(id),
      onNextChapter: (id) => {
        this.paused = false
        this.ui.closeOverlay()
        this.startChapter(id)
      },
      onStartWave: () => { if (this.game) this.game.startWave() },
      onSpeed: () => {
        const i = SPEEDS.indexOf(this.speed)
        this.speed = SPEEDS[(i + 1) % SPEEDS.length]
        this.ui.setSpeedLabel(this.speed)
      },
      onPause: () => { this.paused = true; this.ui.openPause() },
      onResume: () => { this.paused = false; this.ui.closeOverlay() },
      onQuit: () => {
        this.paused = false
        this.ui.closeOverlay()
        this._saveRun()
        const wasChapter = this.currentChapterId
        this.game = null
        this.currentChapterId = null
        if (wasChapter) {
          this.ui.renderChapterList(this.progress)
          this._goto('chapters')
        } else {
          this._goto('maps')
        }
      },
      onRetry: () => {
        const chId = this.currentChapterId
        const id = this.currentMapId
        this.paused = false
        this.ui.closeOverlay()
        if (chId) this.startChapter(chId)
        else this.startGame(id)
      },
      onPickTower: (id) => {
        this.audio.unlock()
        this.placingId = this.placingId === id ? null : id
        this.selectedTower = null
        this.ui.hideTowerPanel()
        this.ui.renderShop(this.game, this.placingId)
        // 카드를 누른 채 지도까지 끌면 그대로 놓을 수 있게 드래그를 열어둔다
        this.drag = this.placingId ? { towerId: this.placingId, fromCard: true } : null
      },
      onDeselect: () => { this.selectedTower = null; this.ui.hideTowerPanel() },
      onCancelPlacing: () => this._cancelPlacing(),
      onUpgrade: (t) => {
        if (this.game.upgradeTower(t)) { this._haptic(14); this.ui.showTowerPanel(this.game, t) }
        else this.ui.toast('골드 부족')
      },
      onSell: async (t) => {
        if (this.settings.confirmSell) {
          const info = this.game.towerInfo(t)
          const ok = await this.ui.confirm(
            `${t.def.name} 판매`, `골드 ${info.sellValue}을(를) 돌려받는다`, '판매')
          if (!ok) return
          // 확인하는 사이에 팔렸거나 게임이 끝났을 수 있다
          if (!this.game || !this.game.towers.includes(t)) return
        }
        this.game.sellTower(t)
        this._haptic(18)
        this.selectedTower = null
        this.ui.hideTowerPanel()
      },
      onCycleTarget: (t) => {
        this.game.cycleTargetMode(t)
        this.ui.showTowerPanel(this.game, t)
      },
      onUseSpecial: (id) => {
        if (!this.game) return
        this.audio.unlock()
        const res = this.game.useSpecial(id)
        if (!res.ok) this.ui.toast(res.reason)
      },

      onOpenStore: (where) => {
        this.ui.openStore(where, this.progress, this.billing.label)
      },

      onBuyItem: (itemId) => {
        const check = canBuy(this.progress, itemId)
        if (!check.ok) { this.ui.toast(check.reason); return }
        if (!this.game) { this.ui.toast('게임 중에만 쓸 수 있다'); return }

        const applied = this.game.applyShopItem(itemId)
        if (!applied.ok) { this.ui.toast(applied.reason); return }

        // 효과가 실제로 적용된 다음에만 캣닢을 깎는다
        this.progress = addCatnip(this.progress, -check.item.cost)
        this._persist()
        this.ui.setCatnip(this.progress.catnip)
        this.ui.toast(applied.message)
        this.ui.closeOverlay()
      },

      onBuyIap: async (productId) => {
        const product = iapProduct(productId)
        if (!product) return
        try {
          const receipt = await this.billing.purchase(product)
          const { progress, applied, reason } = applyPurchase(this.progress, product, receipt)
          if (!applied) { this.ui.toast(reason); return }
          this.progress = progress
          this._persist()
          this.ui.setCatnip(this.progress.catnip)
          this.ui.toast(receipt.mock
            ? `${product.name} 지급 · 데모 결제라 실제 청구는 없다`
            : `${product.name} 구매 완료`)
          this.ui.openStore('ingame', this.progress, this.billing.label)
        } catch (err) {
          const msg = err instanceof BillingError ? err.message : '결제 실패'
          this.ui.toast(msg)
        }
      },

      onRestorePurchases: async () => {
        try {
          const receipts = await this.billing.restore()
          let count = 0
          for (const r of receipts) {
            const product = IAP_PRODUCTS.find((pr) => pr.sku === r.sku)
            if (!product) continue
            const { progress, applied } = applyPurchase(this.progress, product, { ok: true, ...r })
            if (applied) { this.progress = progress; count += 1 }
          }
          this._persist()
          this.ui.setCatnip(this.progress.catnip)
          this.ui.toast(count > 0 ? `${count}건 복원` : '복원할 구매 없음')
        } catch {
          this.ui.toast('복원 실패')
        }
      },

      onRevive: () => {
        const check = canBuy(this.progress, 'revive')
        if (!check.ok) { this.ui.toast(check.reason); return }
        const applied = this.game.applyShopItem('revive')
        if (!applied.ok) { this.ui.toast(applied.reason); return }
        this.progress = addCatnip(this.progress, -catnipItem('revive').cost)
        this._persist()
        this.ui.setCatnip(this.progress.catnip)
        this.ui.closeOverlay()
        this.ui.toast('목숨 +10')
      },

      onOpenSettings: () => {
        this.ui.openSettings(this.settings, (id, value) => this._changeSetting(id, value))
      },
      onOverlayClosed: () => {
        // 일시정지 중 설정/도감을 닫으면 일시정지 화면으로 되돌아온다
        if (this.screen === 'game' && this.paused && this.game
            && this.game.phase !== 'victory' && this.game.phase !== 'defeat') {
          this.ui.openPause()
        }
      },
    }
  }

  /** 설정과 캣닢을 한 번에 저장한다 */
  _persist() {
    this.progress.settings = this.settings
    saveProgress(window.localStorage, this.progress)
  }

  _changeSetting(id, value) {
    this.settings[id] = value
    this._persist()
    this._applySettingsSideEffects()
  }

  _applySettingsSideEffects() {
    document.body.classList.toggle('left-handed', !!this.settings.leftHanded)
    document.body.classList.toggle('reduced-motion', !!this.settings.reducedMotion)
  }

  /**
   * 짧은 진동. 설정에서 끌 수 있고, 지원하지 않는 기기에서는 조용히 무시된다.
   * 배치·판매처럼 "확정된" 동작에만 준다 — 아무 데나 울리면 금방 거슬린다.
   */
  _haptic(ms = 12) {
    if (!this.settings.haptics) return
    if (typeof navigator.vibrate !== 'function') return
    try { navigator.vibrate(ms) } catch { /* 정책상 막힌 브라우저 — 무시 */ }
  }

  // ---------------------------------------------------------- 화면 전환

  _goto(screen, push = true) {
    this.screen = screen
    this.audio.setBgm(screen === 'game')   // 배경음은 게임 화면에서만
    if (screen === 'maps') this.ui.renderMapList(this.progress)
    if (screen === 'chapters') this.ui.renderChapterList(this.progress)
    this.ui.showScreen(screen)
    if (push && window.history && window.history.pushState) {
      try { window.history.pushState({ screen }, '') } catch { /* file://에선 막힐 수 있다 */ }
    }
  }

  _bindHistory() {
    window.addEventListener('popstate', () => {
      if (!document.getElementById('overlay').hidden) { this.ui.closeOverlay(); return }
      if (this.screen === 'game') { this.paused = true; this.ui.openPause(); return }
      if (this.screen === 'maps' || this.screen === 'chapters') this._goto('title', false)
    })
  }

  // ---------------------------------------------------------- 게임 시작

  /**
   * 시나리오 챕터를 시작한다. 컷신을 먼저 보여주고 끝나면 전투로 들어간다.
   * 컷신이 없으면 곧바로 전투다 — 없는 챕터도 있을 수 있게 둔다.
   */
  startChapter(chapterId) {
    const ch = getChapter(chapterId)
    if (!ch) return
    this.audio.unlock()
    this.ui.openStoryCards(ch.intro, () => this.startGame(ch.mapId, ch))
  }

  /**
   * @param {string} mapId 맵 id
   * @param {object|null} chapter 시나리오 챕터. 주면 웨이브셋·길이가 챕터를 따르고
   *   결과 화면이 목표 판정을 함께 보여준다. 안 주면 지금까지의 자유 모드다.
   */
  startGame(mapId, chapter = null) {
    const mapDef = getMap(mapId)
    if (!mapDef) return

    this.currentMapId = mapId
    this.currentChapterId = chapter ? chapter.id : null
    this.game = new Game({
      mapDef,
      difficulty: difficultyOf(this.settings),
      settings: this.settings,
      audio: this.audio,
      progress: this.progress,
      waveSet: chapter ? chapter.waveSet : null,
      waveLimit: chapter ? (chapter.waveLimit || 0) : 0,
    })
    this._catnipSynced = 0
    this.game.on('victory', (s) => this._endRun(s))
    this.game.on('defeat', (s) => this._endRun(s))
    this.game.on('waveclear', ({ bonus }) => this.ui.toast(`웨이브 클리어  +${bonus}`))
    this.game.on('combo', ({ combo }) => this._recordCombo(combo.id))
    // 목숨이 깎이는 순간은 가장 중요한 피드백이라 진동을 조금 더 길게 준다
    this.game.on('leak', () => this._haptic(45))

    this.selectedTower = null
    this.placingId = null
    this._syncPlacingHint()
    this.ui.hideTowerPanel()
    this.paused = false
    this.speed = this.settings.defaultSpeed
    this.acc = 0

    this._goto('game')
    this.ui.setSpeedLabel(this.speed)
    this.ui.setCatnip(this.progress.catnip)
    this.ui.renderShop(this.game, null)
    this.ui.renderSpecials(this.game)
    this.ui.hideTowerPanel()
    this._resize()
  }

  /**
   * 펫 고르기 화면. 고르거나 사면 즉시 저장하고 화면을 다시 그린다.
   *
   * 판 안에서는 못 연다 — 타이틀 화면 버튼에만 걸려 있다. 전투 중에 갈아 끼울 수
   * 있으면 "지금 필요한 펫으로 바꾸기"가 되어 고르는 의미가 사라진다.
   */
  _openPets() {
    const pick = (id) => {
      this.progress = { ...this.progress, pets: { ...this.progress.pets, equipped: id } }
      this._persist()
      this._openPets()
      const pet = getPet(id)
      if (pet) this.ui.toast(`${pet.name}과(와) 함께 간다`)
    }
    const buy = (id) => {
      const pet = getPet(id)
      if (!pet || this.progress.catnip < pet.price) return
      const owned = [...this.progress.pets.owned, id]
      this.progress = addCatnip(this.progress, -pet.price)
      this.progress = { ...this.progress, pets: { owned, equipped: id } }
      this._persist()
      this.ui.setCatnip(this.progress.catnip)
      this._openPets()
      this.ui.toast(`${pet.name}이(가) 합류했다`)
    }
    this.ui.openPets(this.progress, pick, buy)
  }

  /** 조합을 처음 만들면 도감에 남기고 바로 저장한다. */
  _recordCombo(id) {
    const seen = new Set(this.progress.combosSeen || [])
    if (seen.has(id)) return
    seen.add(id)
    this.progress = { ...this.progress, combosSeen: [...seen] }
    this._persist()
  }

  _endRun(summary) {
    const chapter = this.currentChapterId ? getChapter(this.currentChapterId) : null

    // 조합은 만드는 즉시 기록하지만(_recordCombo), 판 결과로 한 번 더 훑는다.
    // 이벤트를 놓친 경로가 생겨도 도감이 비지 않게 하는 안전망이다.
    for (const id of summary.combosMade || []) this._recordCombo(id)

    if (chapter) {
      const { stars } = evaluateObjectives(chapter, summary, getObjective)
      const res = recordChapter(this.progress, chapter.id, stars, chapter.rewards)
      this.progress = res.progress
      if (res.gained.catnip) summary.catnipEarned += res.gained.catnip
      if (res.gained.tower) {
        const t = getTower(res.gained.tower)
        if (t) this.ui.toast(`${t.name}이(가) 합류했다`)
      }
      // Game 은 만들 때 받은 progress 객체를 들고 있다. 진행도는 새 객체로 갈아끼우는
      // 방식이라, 여기서 넘겨주지 않으면 보상으로 푼 고양이가 이 판에서는 계속 잠겨 보인다.
      this.game.progress = this.progress
      this._persist()
    } else if (summary.cleared) {
      // 맵을 처음 클리어하면 캣닢 보너스를 준다 (자유 모드만)
      const bonus = catnipForMapClear(catnipMultiplier(this.progress))
      this.progress = addCatnip(this.progress, bonus)
      summary.catnipEarned += bonus
    }

    this._saveRun()
    this.ui.setCatnip(this.progress.catnip)

    const showResult = () => this.ui.openResult(summary, this.progress, chapter)
    // 목표를 이뤘으면 마무리 컷신을 먼저 보여준다
    if (chapter && chapter.outro.length && summary.cleared) {
      this.ui.openStoryCards(chapter.outro, showResult)
    } else {
      showResult()
    }
  }

  /**
   * 진행도 저장 — 중간에 나가도 최고 웨이브는 남는다.
   *
   * 시나리오 판은 recordResult 를 부르지 않는다. waveLimit 6짜리 챕터가 그 맵의
   * bestWave 를 6으로 써버리면 자유 모드 기록이 부정확해지고, unlockedMaps 도
   * 시나리오가 건드리면 자유 모드 해금 순서가 뒤엉킨다.
   */
  _saveRun() {
    if (!this.game) return
    if (this.currentChapterId) { this._persist(); return }
    const s = this.game.summary()
    this.progress = recordResult(
      this.progress, s.mapId, s.reachedWave, s.cleared, nextMapId(s.mapId),
    )
    this._persist()
  }

  /** 게임이 벌어들인 캣닢을 진행도로 옮긴다 (증가분만 정확히 한 번) */
  _syncCatnip() {
    if (!this.game) return
    const earned = this.game.catnipEarned
    if (earned <= this._catnipSynced) return
    this.progress = addCatnip(this.progress, earned - this._catnipSynced)
    this._catnipSynced = earned
    this._persist()
    this.ui.setCatnip(this.progress.catnip)
  }

  // ---------------------------------------------------------- 입력

  // ---------------------------------------------------------- 입력
  //
  // 설계 의도: 손가락은 정확하지 않고, 한 칸은 35px 남짓이다.
  //  · 누르는 순간이 아니라 **떼는 순간** 배치한다 → 누른 채로 밀어서 위치를 고칠 수 있다
  //  · 놓일 칸은 손가락 위가 아니라 칸 자체에 그린다 → 손에 가려지지 않는다
  //  · 빗나가면 주변의 지을 수 있는 칸으로 보정한다 (nearestBuildable)
  //  · 상점 카드에서 지도로 그대로 끌어다 놓을 수도 있다

  /** 화면 좌표를 실수 타일 좌표로. 캔버스 밖이면 null. */
  _pointOnCanvas(ev, allowOutside = false) {
    const canvas = document.getElementById('canvas')
    const rect = canvas.getBoundingClientRect()
    const inside = ev.clientX >= rect.left && ev.clientX <= rect.right
      && ev.clientY >= rect.top && ev.clientY <= rect.bottom
    if (!inside && !allowOutside) return null
    return this.renderer.pointFromPixel(ev.clientX - rect.left, ev.clientY - rect.top)
  }

  /** 드래그 중 미리보기 갱신 — 빗나간 손가락을 가까운 빈 칸으로 보정한다 */
  _updatePlacementPreview(point) {
    if (!this.game || !point) { this.hover = null; this.hoverOk = false; return }

    const snapped = nearestBuildable(this.game.mapDef, this.game.path, point.x, point.y, {
      radius: 0.65,
      isFree: (c, r) => !this.game.towerAt(c, r),
    })
    if (snapped) {
      this.hover = { c: snapped.c, r: snapped.r }
      this.hoverOk = true
      return
    }
    // 보정할 곳이 없으면 누른 칸을 그대로 보여주되 '안 됨'으로 표시한다
    const c = Math.floor(point.x)
    const r = Math.floor(point.y)
    const inGrid = c >= 0 && r >= 0 && c < this.game.mapDef.cols && r < this.game.mapDef.rows
    this.hover = inGrid ? { c, r } : null
    this.hoverOk = false
  }

  /** 드래그를 끝내고 실제로 배치한다 */
  _commitPlacement() {
    const drag = this.drag
    this.drag = null
    if (!drag || !this.game) { this.hover = null; return }

    const tile = this.hover
    const ok = this.hoverOk
    this.hover = null
    this.hoverOk = false

    if (!tile || !ok) {
      // 지도 밖에서 뗐으면 조용히 취소한다 (실수로 골드를 쓰지 않게)
      if (tile) this.ui.toast('여기엔 못 짓는다')
      return
    }

    const res = this.game.placeTower(tile.c, tile.r, drag.towerId)
    if (!res.ok) { this.ui.toast(res.reason); this.audio.play('tap'); return }

    this._haptic(12)
    this.ui.refreshShopAffordability(this.game)
    // 계속 지을 수 있으면 선택을 유지한다 (연속 배치가 훨씬 편하다)
    if (this.game.gold < res.tower.def.levels[0].cost) this._cancelPlacing()
  }

  /** 배치 모드를 끝내고 관련 표시를 모두 지운다 */
  _cancelPlacing() {
    this.placingId = null
    this.drag = null
    this.hover = null
    this.hoverOk = false
    this._syncPlacingHint()
  }

  /**
   * 배치 모드 표시를 placingId 에 맞춘다. 상태가 바뀐 프레임에만 DOM을 건드린다.
   * 표시는 상점 카드 위에만 둔다 — 지도 위에 안내를 띄우면 딱 그 자리에 못 짓게 된다.
   * (지도를 덮는 UI 때문에 조작이 막히는 사고를 이미 두 번 냈다)
   */
  _syncPlacingHint() {
    if (this._hintFor === this.placingId) return
    this._hintFor = this.placingId
    if (this.game) this.ui.renderShop(this.game, this.placingId)
  }

  _bindCanvas() {
    const canvas = document.getElementById('canvas')

    canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault()
      this.audio.unlock()
      if (!this.game) return

      const point = this._pointOnCanvas(ev)
      if (!point) return

      // 밀크 크리스탈이 먼저다. 누르는 순간 바로 줍는다 —
      // 떼는 순간까지 기다리면 반응이 굼떠 보이고, 배치보다 우선해야
      // 크리스탈 위에 실수로 고양이를 짓는 일이 없다.
      if (this.game.collectCrystalNear(point.x, point.y).ok) {
        this._haptic(10)
        return
      }

      if (this.placingId) {
        // 아직 놓지 않는다 — 떼는 순간에 놓는다
        canvas.setPointerCapture(ev.pointerId)
        this.drag = { towerId: this.placingId, pointerId: ev.pointerId }
        this._updatePlacementPreview(point)
        return
      }

      // 배치 모드가 아니면 타워 선택 — 다만 '탭'일 때만.
      // 누른 위치·시각을 적어 두고 pointerup 에서 움직임이 작았는지 본다.
      this._press = { x: ev.clientX, y: ev.clientY, at: performance.now(), id: ev.pointerId }
    })

    canvas.addEventListener('pointermove', (ev) => {
      if (!this.drag || ev.pointerId !== this.drag.pointerId) return
      ev.preventDefault()
      this._updatePlacementPreview(this._pointOnCanvas(ev, true))
    })

    canvas.addEventListener('pointerup', (ev) => {
      ev.preventDefault()
      if (this.drag && ev.pointerId === this.drag.pointerId) {
        this._updatePlacementPreview(this._pointOnCanvas(ev, true))
        this._commitPlacement()
        return
      }

      // 밀어서 넘긴 동작까지 '선택'으로 처리하면 손가락을 뗄 때마다 패널이 열렸다 닫힌다.
      // 움직임과 시간이 모두 작을 때만 탭으로 본다.
      const press = this._press
      this._press = null
      if (!press || press.id !== ev.pointerId) return
      const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y)
      const held = performance.now() - press.at
      if (moved > App.TAP_SLOP_PX || held > App.TAP_MAX_MS) return

      const point = this._pointOnCanvas(ev)
      if (!point || !this.game) return
      this._selectTowerNear(point)
    })

    canvas.addEventListener('pointercancel', () => {
      this.drag = null
      this.hover = null
      this.hoverOk = false
      this._press = null
    })
  }

  /** 손가락이 조금 빗나가도 타워가 선택되도록 반경 안에서 가장 가까운 타워를 고른다 */
  _selectTowerNear(point) {
    let best = null
    /* 0.85타일이 기본이되, 타일이 작아져도 실제 허용 반경이 20 CSS px 밑으로는
     * 안 떨어지게 한다. 짧은 화면에서 타일이 22px 까지 줄면 허용 반경이 19px 가
     * 되는데, 손가락은 지도가 작아진다고 같이 작아지지 않는다.
     * 타일이 24px 보다 크면 0.85 가 이기므로 평소 동작은 그대로다. */
    let bestDist = Math.max(0.85, 20 / (this.renderer.tile || 40))
    for (const t of this.game.towers) {
      const d = Math.hypot(t.x - point.x, t.y - point.y)
      if (d < bestDist) { best = t; bestDist = d }
    }

    if (best) {
      this.selectedTower = best
      this.ui.showTowerPanel(this.game, best)
      this.audio.play('tap')
      this._haptic(8)
    } else if (this.selectedTower) {
      this.selectedTower = null
      this.ui.hideTowerPanel()
    }
  }

  /**
   * 상점 카드에서 지도로 바로 끌어다 놓기.
   * 카드를 짧게 누르면 그냥 선택되고, 지도까지 끌면 그 자리에 놓인다.
   */
  _bindShopDrag() {
    const onMove = (ev) => {
      if (!this.drag || !this.drag.fromCard) return
      const point = this._pointOnCanvas(ev, false)
      if (point) ev.preventDefault()
      this._updatePlacementPreview(point)
    }
    const onUp = () => {
      if (!this.drag || !this.drag.fromCard) return
      if (this.hover) this._commitPlacement()
      else { this.drag = null; this.hover = null; this.hoverOk = false }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  _bindResize() {
    const stage = document.getElementById('stage')
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._resize()).observe(stage)
    }
    window.addEventListener('resize', () => this._resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120))
    /* iOS 인앱 브라우저(카카오·인스타 등)는 위아래 크롬이 접혔다 펴질 때
     * window.resize 를 안 띄운다. stage 의 CSS 크기가 안 변하면 ResizeObserver 도
     * 안 뛰므로 이게 유일한 신호다 — 없으면 캔버스가 낡은 크기로 남는다. */
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._resize())
    }
  }

  _resize() {
    if (!this.game) return
    const stage = document.getElementById('stage')
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (w > 0 && h > 0) this.renderer.resize(w, h, this.game.mapDef)
  }

  // ---------------------------------------------------------- 루프

  _frame(now) {
    requestAnimationFrame((t) => this._frame(t))
    const realDt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now

    if (!this.game || this.screen !== 'game') return

    if (!this.paused && this.game.phase !== 'victory' && this.game.phase !== 'defeat') {
      this.acc += realDt * this.speed
      const maxSteps = 6 * this.speed
      let steps = 0
      while (this.acc >= STEP && steps < maxSteps) {
        this.game.update(STEP)
        this.acc -= STEP
        steps += 1
      }
      if (this.acc > STEP * maxSteps) this.acc = 0 // 크게 밀린 시간은 버린다
    }

    // 선택한 타워가 팔렸으면 패널을 닫는다
    if (this.selectedTower && !this.game.towers.includes(this.selectedTower)) {
      this.selectedTower = null
      this.ui.hideTowerPanel()
    }

    this._syncPlacingHint()
    this.ui.updateHud(this.game)
    this.ui.refreshShopAffordability(this.game)
    this.ui.refreshTowerPanelAffordability(this.game)
    this.ui.updateSpecials(this.game)
    this._syncCatnip()

    this.renderer.draw(this.game, {
      selected: this.selectedTower,
      placing: this.placingId ? getTower(this.placingId) : null,
      hover: this.hover,
      buildable: this.hoverOk,
    })
  }
}

// ---------------------------------------------------------- 부팅

function boot() {
  const status = document.getElementById('boot-status')
  try {
    const summary = validateAll()
    status.textContent =
      `고양이 ${summary.towers}종 · 해충 ${summary.enemies}종 · 맵 ${summary.maps}종 준비 완료`
  } catch (err) {
    // 콘텐츠가 잘못됐으면 조용히 깨지지 않고 화면에 그대로 보여준다
    status.textContent = `콘텐츠 오류: ${err.message}`
    status.style.color = '#ff7a7a'
    console.error(err)
    return
  }

  // 프레임 아트는 기다리지 않는다. 도착 전까지는 캔버스 스프라이트로 그려지므로
  // 첫 화면이 그림 다운로드에 밀리지 않는다.
  loadFrameSets()
  loadMapArt()
  // '전부 열림' 마이그레이션이 가리킬 목록. 고양이를 추가해도 따라온다.
  setAllTowerIds(registry.listTowers().map((t) => t.id))

  const app = new App()
  // 헤드리스 스모크 테스트에서 게임을 조작하기 위한 훅
  window.__catpaw = app
  app.__registry = registry   // 스프라이트 시트 생성 등 개발 도구용
  app.__framesets = framesets  // 프레임 아트가 실제로 붙었는지 스모크에서 확인한다
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

// 서비스 워커 — 오프라인 구동. file://에서는 등록이 불가능하므로 건너뛴다.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 없어도 게임은 돌아간다 */ })
  })
}
