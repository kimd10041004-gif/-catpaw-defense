/**
 * 부팅과 조율 — 콘텐츠 검증 → 진행도 로드 → 화면 전환 → 게임 루프 → 입력.
 * 시뮬레이션(game.js)·그리기(render.js)·DOM(ui.js)을 이어 붙이기만 한다.
 */

import './content/index.js'
import { validateAll } from './content/registry.js'
import { getMap, getTower, nextMapId } from './content/registry.js'
import { Game } from './game.js'
import { Renderer } from './render.js'
import { Audio } from './audio.js'
import { UI } from './ui.js'
import { loadProgress, saveProgress, recordResult, addCatnip } from './domain/save.js'
import { detectBilling, applyPurchase, BillingError } from './domain/billing.js'
import { canBuy, catnipItem, iapProduct, IAP_PRODUCTS, catnipMultiplier } from './domain/shop.js'
import { catnipForMapClear } from './domain/economy.js'
import { difficultyOf, normalizeSettings } from './domain/settings.js'
import { isBuildable } from './domain/path.js'

/** 고정 타임스텝 — 배속과 기기 성능이 달라도 시뮬레이션 결과가 같도록 */
const STEP = 1 / 60
const SPEEDS = [1, 2, 3]

class App {
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
    this.hover = null
    this.screen = 'title'
    this.acc = 0
    this.lastFrame = 0

    this.ui = new UI(this._handlers())
    this._applySettingsSideEffects()
    this._bindCanvas()
    this._bindResize()
    this._bindHistory()

    requestAnimationFrame((t) => this._frame(t))
  }

  // ---------------------------------------------------------- 핸들러

  _handlers() {
    return {
      onPlay: () => { this.audio.unlock(); this._goto('maps') },
      onSelectMap: (id) => this.startGame(id),
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
        this.game = null
        this._goto('maps')
      },
      onRetry: () => {
        const id = this.currentMapId
        this.paused = false
        this.ui.closeOverlay()
        this.startGame(id)
      },
      onPickTower: (id) => {
        this.audio.unlock()
        this.placingId = this.placingId === id ? null : id
        this.selectedTower = null
        this.ui.hideTowerPanel()
        this.ui.renderShop(this.game, this.placingId)
      },
      onDeselect: () => { this.selectedTower = null; this.ui.hideTowerPanel() },
      onUpgrade: (t) => {
        if (this.game.upgradeTower(t)) this.ui.showTowerPanel(this.game, t)
        else this.ui.toast('골드가 부족합니다')
      },
      onSell: (t) => {
        if (this.settings.confirmSell && !window.confirm(`${t.def.name}을(를) 판매할까요?`)) return
        this.game.sellTower(t)
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
        if (!this.game) { this.ui.toast('게임 중에만 사용할 수 있습니다'); return }

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
            ? `${product.name} 지급 (데모 결제 — 실제 청구 없음)`
            : `${product.name} 구매 완료`)
          this.ui.openStore('ingame', this.progress, this.billing.label)
        } catch (err) {
          const msg = err instanceof BillingError ? err.message : '결제에 실패했습니다'
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
          this.ui.toast(count > 0 ? `${count}건을 복원했습니다` : '복원할 구매 내역이 없습니다')
        } catch {
          this.ui.toast('구매 복원에 실패했습니다')
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
        this.ui.toast('이어하기! 목숨 +10')
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
  }

  // ---------------------------------------------------------- 화면 전환

  _goto(screen, push = true) {
    this.screen = screen
    this.audio.setBgm(screen === 'game')   // 배경음은 게임 화면에서만
    if (screen === 'maps') this.ui.renderMapList(this.progress)
    this.ui.showScreen(screen)
    if (push && window.history && window.history.pushState) {
      try { window.history.pushState({ screen }, '') } catch { /* file://에선 막힐 수 있다 */ }
    }
  }

  _bindHistory() {
    window.addEventListener('popstate', () => {
      if (!document.getElementById('overlay').hidden) { this.ui.closeOverlay(); return }
      if (this.screen === 'game') { this.paused = true; this.ui.openPause(); return }
      if (this.screen === 'maps') this._goto('title', false)
    })
  }

  // ---------------------------------------------------------- 게임 시작

  startGame(mapId) {
    const mapDef = getMap(mapId)
    if (!mapDef) return

    this.currentMapId = mapId
    this.game = new Game({
      mapDef,
      difficulty: difficultyOf(this.settings),
      settings: this.settings,
      audio: this.audio,
      progress: this.progress,
    })
    this._catnipSynced = 0
    this.game.on('victory', (s) => this._endRun(s))
    this.game.on('defeat', (s) => this._endRun(s))
    this.game.on('waveclear', ({ bonus }) => this.ui.toast(`웨이브 클리어! +${bonus} 골드`))

    this.selectedTower = null
    this.placingId = null
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

  _endRun(summary) {
    // 맵을 처음 클리어하면 캣닢 보너스를 준다
    if (summary.cleared) {
      const bonus = catnipForMapClear(catnipMultiplier(this.progress))
      this.progress = addCatnip(this.progress, bonus)
      summary.catnipEarned += bonus
    }
    this._saveRun()
    this.ui.setCatnip(this.progress.catnip)
    this.ui.openResult(summary, this.progress)
  }

  /** 진행도 저장 — 중간에 나가도 최고 웨이브는 남는다 */
  _saveRun() {
    if (!this.game) return
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

  _bindCanvas() {
    const canvas = document.getElementById('canvas')

    const tileAt = (ev) => {
      if (!this.game) return null
      const rect = canvas.getBoundingClientRect()
      return this.renderer.tileFromPixel(ev.clientX - rect.left, ev.clientY - rect.top, this.game.mapDef)
    }

    canvas.addEventListener('pointerdown', (ev) => {
      ev.preventDefault()
      this.audio.unlock()
      const tile = tileAt(ev)
      if (!tile || !this.game) return
      this.hover = tile

      if (this.placingId) {
        const res = this.game.placeTower(tile.c, tile.r, this.placingId)
        if (!res.ok) { this.ui.toast(res.reason); this.audio.play('tap'); return }
        this.ui.refreshShopAffordability(this.game)
        // 계속 더 지을 수 있으면 배치 모드를 유지한다 (연속 배치가 훨씬 편하다)
        const stillAffordable = this.game.gold >= res.tower.def.levels[0].cost
        if (!stillAffordable) {
          this.placingId = null
          this.ui.renderShop(this.game, null)
        }
        return
      }

      const tower = this.game.towerAt(tile.c, tile.r)
      if (tower) {
        this.selectedTower = tower
        this.ui.showTowerPanel(this.game, tower)
        this.audio.play('tap')
      } else if (this.selectedTower) {
        this.selectedTower = null
        this.ui.hideTowerPanel()
      }
    })

    canvas.addEventListener('pointermove', (ev) => {
      if (!this.placingId) return
      this.hover = tileAt(ev)
    })
    canvas.addEventListener('pointerleave', () => { this.hover = null })
  }

  _bindResize() {
    const stage = document.getElementById('stage')
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._resize()).observe(stage)
    }
    window.addEventListener('resize', () => this._resize())
    window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120))
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

    this.ui.updateHud(this.game)
    this.ui.refreshShopAffordability(this.game)
    this.ui.updateSpecials(this.game)
    this._syncCatnip()

    this.renderer.draw(this.game, {
      selected: this.selectedTower,
      placing: this.placingId ? getTower(this.placingId) : null,
      hover: this.hover,
      buildable: this.hover
        ? isBuildable(this.game.mapDef, this.game.path, this.hover.c, this.hover.r)
          && !this.game.towerAt(this.hover.c, this.hover.r)
        : false,
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

  const app = new App()
  // 헤드리스 스모크 테스트에서 게임을 조작하기 위한 훅
  window.__catpaw = app
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
