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
  listAchievements, listTowers, listFreeTowers, listCombos, listPets, listMaps, getChallenge, listChallenges,
  getSkin, getExpedition, listExpeditions,
} from './content/registry.js'
import * as registry from './content/registry.js'
import { Game, CRYSTAL_LIFE_SEC } from './game.js'
import { Renderer } from './render.js'
import { Audio } from './audio.js'
import { UI } from './ui.js'
import {
  loadProgress, saveProgress, recordResult, addCatnip, recordChapter, setAllTowerIds,
  accountRun, recordEndless, recordChallenge, recordWeekly, recordExpedition, setExpeditionDeck,
} from './domain/save.js'
import { detectBilling, applyPurchase, reconcilePurchases, BillingError } from './domain/billing.js'
import { canBuy, catnipItem, iapProduct, IAP_PRODUCTS, catnipMultiplier } from './domain/shop.js'
import { catnipForMapClear } from './domain/economy.js'
import { difficultyOf, normalizeSettings } from './domain/settings.js'
import { nearestBuildable } from './domain/path.js'
import { evaluateObjectives } from './domain/objectives.js'
import * as loading from './loading.js'
import { APP_VERSION } from './version.js'
import { buildTips } from './domain/tips.js'
import { nextHint } from './domain/hints.js'
import { evaluateAchievements } from './domain/achievements.js'
import { claimDaily, localDateKey, DAILY_REWARDS } from './domain/daily.js'
import { isAndroidApp, shouldRegisterServiceWorker } from './domain/platform.js'
import { train, GROWTH_DAMAGE_PER_RANK } from './domain/growth.js'
import { weekKey, weeklyPick, WEEKLY_REWARD } from './domain/weekly.js'
import { mulberry32 } from './domain/rng.js'
import { tr, setLanguage, resolveLanguage, localizeStatic } from './i18n/index.js'
import { hasPack, hasAct } from './domain/entitlements.js'
import { drawTen, draw as drawOne } from './domain/gacha.js'
import { applyDraws, canDraw, payDraw, exchangeShards, equipRune, unequipRune } from './domain/cards.js'
import { cardPools } from './content/registry.js'
import {
  DECK_SIZE, ownedCats, canEnter, stageRules, savedDeck, towerElement, reachedStage,
} from './domain/expedition.js'

/** 고정 타임스텝 — 배속과 기기 성능이 달라도 시뮬레이션 결과가 같도록 */
const STEP = 1 / 60
const SPEEDS = [1, 2, 3]

/** 콘텐츠에서 사라진 스킨은 보유·장착에서 뺀다 — 없는 스킨을 낀 채 조용히 아무 효과도 안 나는 것보다 낫다 */
function stripUnknownSkins(progress) {
  const skins = progress.skins || { owned: [], equipped: {} }
  const owned = skins.owned.filter((id) => !!getSkin(id))
  const equipped = {}
  for (const [towerId, id] of Object.entries(skins.equipped || {})) if (owned.includes(id)) equipped[towerId] = id
  if (owned.length === skins.owned.length && Object.keys(equipped).length === Object.keys(skins.equipped || {}).length) return progress
  return { ...progress, skins: { owned, equipped } }
}

class App {
  /** 이 정도 이상 움직였으면 탭이 아니라 밀기로 본다 (손가락 흔들림은 보통 6px 이내) */
  static TAP_SLOP_PX = 12
  /** 이보다 오래 누르고 있었으면 탭으로 치지 않는다 */
  static TAP_MAX_MS = 700

  constructor() {
    this.storage = safeStorage()
    this.progress = stripUnknownSkins(loadProgress(this.storage))
    this.settings = normalizeSettings(this.progress.settings)
    // 언어는 여기서 한 번 정한다 — 이 아래에서 만들어지는 모든 문구(UI · 레지스트리 · 정적 HTML)가 이 언어다.
    setLanguage(resolveLanguage(this.settings.language, typeof navigator !== 'undefined' ? navigator.language : ''))
    localizeStatic(document)
    registry.localizeAll(tr)
    this.audio = new Audio(this.settings)
    this.billing = detectBilling()
    // 실제 결제 환경이면 데모 결제로 받은 프리미엄은 효력을 잃는다 (캣닢·영수증은 그대로).
    // 토스트는 UI 가 생긴 뒤에 띄운다 — 아래 _reconcileNote 를 _afterLoading 이 읽는다.
    const rec = reconcilePurchases(this.progress, this.billing)
    this._reconcileNote = rec.changed ? rec.reason : null
    if (rec.changed) this.progress = rec.progress
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
      // 뽑기 — 타이틀 버튼과 도감 카드 탭에서. 확률 표는 ui 가 gacha.js 에서 직접 만든다.
      onGacha: () => { this.audio.unlock(); this.ui.openGacha(this.progress) },
      onDraw: ({ ten = false } = {}) => {
        const check = canDraw(this.progress, { ten })
        if (!check.ok) { this.ui.toast(check.reason); return }
        this.progress = payDraw(this.progress, { ten })
        /* 뽑기 난수는 시드를 안 박는다 — 주간 도전과 반대다. 같은 시드로 재현되면
         * 결과를 미리 보고 되돌리는 길이 생긴다(저장을 백업했다 덮어쓰기). */
        const pools = cardPools()
        const results = ten ? drawTen(Math.random, pools) : [drawOne(Math.random, pools)]
        const applied = applyDraws(this.progress, results)
        this.progress = applied.progress
        this._persist()
        this.ui.setCatnip(this.progress.catnip)
        if (this.game) { this.game.setProgress(this.progress); this.ui.renderShop(this.game, this.placingId) }
        this.ui.openGacha(this.progress, applied.gained)
      },
      onExchangeShards: (catId) => {
        const r = exchangeShards(this.progress, catId)
        if (!r.ok) { this.ui.toast(r.reason); return }
        this.progress = r.progress
        this._persist()
        if (this.game) { this.game.setProgress(this.progress); this.ui.renderShop(this.game, this.placingId) }
        this.ui.openCodex('cards')
        const t = getTower(catId)
        this.ui.toast(tr('{v} 카드를 조각으로 바꿨다', { v: t ? t.name : catId }))
      },
      // 속성 룬 — 도감 고양이 행의 칩에서. 판 중에 바꿔도 이미 놓인 타워는 안 바뀐다(스킨과 같은 규칙).
      onOpenRunes: (towerId) => { this.audio.unlock(); this.ui.openRunes(towerId, this.progress) },
      onEquipRune: (towerId, element) => {
        if (element === null) {
          this.progress = unequipRune(this.progress, towerId)
        } else {
          const r = equipRune(this.progress, towerId, element)
          if (!r.ok) { this.ui.toast(r.reason); return }
          this.progress = r.progress
        }
        this._persist()
        if (this.game) { this.game.setProgress(this.progress); this.ui.renderShop(this.game, this.placingId) }
        this.ui.openRunes(towerId, this.progress)
      },
      // 스킨 — 도감 고양이 행의 칩에서. 장착은 판 밖의 선택이라 진행 중인 판의 타워는 안 바뀐다(상점 카드만 갱신).
      onOpenSkins: (towerId) => { this.audio.unlock(); this.ui.openSkins(towerId, this.progress) },
      onEquipSkin: (towerId, skinId) => {
        const skins = this.progress.skins || { owned: [], equipped: {} }
        if (skinId && !skins.owned.includes(skinId)) return
        const equipped = { ...skins.equipped }
        if (skinId) equipped[towerId] = skinId; else delete equipped[towerId]
        this.progress = { ...this.progress, skins: { owned: [...skins.owned], equipped } }
        this._persist()
        if (this.game) { this.game.setProgress(this.progress); this.ui.renderShop(this.game, this.placingId) }
        this.ui.openSkins(towerId, this.progress)
      },
      onBuySkin: (skinId) => {
        const skin = getSkin(skinId)
        if (!skin || !skin.price) return
        if ((this.progress.catnip || 0) < skin.price) { this.ui.toast(tr('캣닢 부족 ({catnip}/{price})', { catnip: this.progress.catnip, price: skin.price })); return }
        const skins = this.progress.skins || { owned: [], equipped: {} }
        this.progress = addCatnip(this.progress, -skin.price)
        this.progress = { ...this.progress, skins: { owned: [...skins.owned, skinId], equipped: { ...skins.equipped, [skin.towerId]: skinId } } }
        this._persist()
        this.ui.setCatnip(this.progress.catnip)
        if (this.game) { this.game.setProgress(this.progress); this.ui.renderShop(this.game, this.placingId) }
        this.ui.openSkins(skin.towerId, this.progress)
        this.ui.toast(tr('{skinName} 장착', { skinName: skin.name }))
      },
      // 훈련 — 도감 고양이 행에서. 캣닢을 깎고 단계를 올린 뒤 도감을 다시 그린다.
      onTrain: (towerId) => {
        const r = train(this.progress, towerId)
        if (!r.ok) { this.ui.toast(r.reason); return }
        this.progress = r.progress
        this._persist()
        if (this.game) this.game.setProgress(this.progress)
        this.ui.setCatnip(this.progress.catnip)
        const t = getTower(towerId)
        this.ui.toast(tr('{v} 훈련 {rank}단계 · 공격 +{rank2}%', { v: t ? t.name : towerId, rank: r.rank, rank2: Math.round(r.rank * GROWTH_DAMAGE_PER_RANK * 100) }), 2000)
        this.ui.openCodex('towers')
        const unlocked = this._checkAchievements()
        if (unlocked.length) this.ui.toastQueue(unlocked.map((a) => tr('업적 달성: {aName}  캣닢 +{catnip}', { aName: a.name, catnip: a.catnip })), 2200)
      },
      // 도감의 기록·업적 탭이 읽는다 (읽기만 — 진행도를 고치는 건 여기서만)
      progressView: () => this.progress,
      onEndless: () => {
        this.paused = false
        this.ui.closeOverlay()
        if (this.game && this.game.continueEndless()) {
          this._lastResult = null
          this.ui.toast(tr('무한 방어 — 얼마나 버티나'), 2200)
        }
      },
      onSelectMap: (id) => this.startGame(id),
      // 맵 카드의 '도전' 칩 → 규칙 목록 시트 → 규칙 하나를 얹어 시작
      onOpenChallenges: (mapId) => { this.audio.unlock(); this.ui.openChallenges(mapId, this.progress) },
      onSelectChallenge: (mapId, challengeId) => this.startChallenge(mapId, challengeId),
      onWeekly: () => this.startWeekly(),
      // 원정 — 맵 목록 맨 위 카드에서. 사다리와 덱 편성이 한 시트에 있다.
      onOpenExpedition: (expId) => {
        this.audio.unlock()
        const exp = getExpedition(expId) || listExpeditions()[0]
        if (exp) this.ui.openExpedition(exp, this.progress, listTowers().map((t) => t.id))
      },
      onStartExpedition: (expId, deck) => this.startExpedition(expId, deck),
      onNextStage: () => {
        const run = this.expeditionRun
        if (!run || !this.game) return
        this.paused = false
        this.ui.closeOverlay()
        // 목숨을 그대로 다음 칸으로 넘긴다 — 이것이 원정의 규칙이다
        this.expeditionRun = { ...run, stage: run.stage + 1, lives: this.game.summary().livesLeft }
        this._lastResult = null
        this._startExpeditionStage()
      },
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
        const unlocked = this._saveRun()
        if (unlocked && unlocked.length) this.ui.toastQueue(unlocked.map((a) => tr('업적 달성: {aName}  캣닢 +{catnip}', { aName: a.name, catnip: a.catnip })), 2200)
        const wasChapter = this.currentChapterId
        this.game = null
        this.currentChapterId = null
        this.currentChallengeId = null
        this.currentWeeklyKey = null
        this.currentExpeditionId = null
        this.expeditionRun = null      // 원정은 중간에 나가면 처음부터다(진행 중 상태를 저장하지 않는다)
        if (wasChapter) {
          this.ui.renderChapterList(this.progress)
          this._goto('chapters')
        } else {
          this._goto('maps')
        }
      },
      onRetry: () => {
        const chId = this.currentChapterId
        const challengeId = this.currentChallengeId
        const weekly = this.currentWeeklyKey
        const expedition = this.expeditionRun
        const id = this.currentMapId
        this.paused = false
        this.ui.closeOverlay()
        // 원정은 '다시'가 그 칸이 아니라 **첫 칸부터**다 — 목숨이 이어지는 것이 이 모드의 규칙이라
        // 중간 칸만 다시 하면 그 규칙이 사라진다.
        if (expedition) this.startExpedition(expedition.id, expedition.deck)
        else if (chId) this.startChapter(chId)
        else if (weekly) this.startWeekly()
        else if (challengeId) this.startChallenge(id, challengeId)
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
        else this.ui.toast(tr('골드 부족'))
      },
      onSell: async (t) => {
        const can = this.game && this.game.canSellTower()
        if (can && !can.ok) { this.ui.toast(can.reason); return }
        if (this.settings.confirmSell) {
          const info = this.game.towerInfo(t)
          const ok = await this.ui.confirm(
            tr('{defName} 판매', { defName: t.def.name }), tr('골드 {sellValue}을(를) 돌려받는다', { sellValue: info.sellValue }), tr('판매'))
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

      onOpenStore: (where, focus = null) => {
        // 어디서 열었는지 기억한다. 결제 뒤 다시 열 때 'ingame' 으로 하드코딩하면
        // 패배 화면에서 온 사람이 이어하기가 없는 상점으로 떨어진다 —
        // 이어하기는 onlyWhen: 'defeat' 라 'ingame' 목록에 아예 안 들어간다.
        this._storeCtx = where
        /* 판이 끝난 뒤 결과 화면에서 상점으로 왔는가. 이 표시가 있을 때만
         * 상점을 닫으며 결과로 되돌린다 — 조건 없이 되돌리면 결과 화면 자체를
         * 닫을 때도 다시 열려서 영영 못 빠져나온다(실제로 그렇게 만들었다가 잡았다). */
        this._returnToResult = !!this._lastResult && !!this.game
          && (this.game.phase === 'defeat' || this.game.phase === 'victory')
        this.ui.openStore(where, this.progress, this.billing.label, focus)
      },


      onBuyItem: (itemId) => {
        const check = canBuy(this.progress, itemId)
        if (!check.ok) { this.ui.toast(check.reason); return }
        if (!this.game) { this.ui.toast(tr('게임 중에만 쓸 수 있다')); return }

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
          // 돌고 있는 판에도 넘긴다. 안 하면 프리미엄의 '캣닢 2배'가 생성 시점에
          // 얼어붙은 catnipMul 때문에 그 판 끝까지 안 걸린다.
          if (this.game) this.game.setProgress(this.progress)
          this.ui.setCatnip(this.progress.catnip)
          this.ui.toast(receipt.mock
            ? tr('{productName} 지급 · 데모 결제라 실제 청구는 없다', { productName: tr(product.name) })
            : tr('{productName} 구매 완료', { productName: tr(product.name) }))
          this._reopenStore()
        } catch (err) {
          const msg = err instanceof BillingError ? err.message : tr('결제 실패')
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
          if (this.game) this.game.setProgress(this.progress)
          this.ui.setCatnip(this.progress.catnip)
          this.ui.toast(count > 0 ? tr('{count}건 복원', { count: count }) : tr('복원할 구매 없음'))
          // 복원 버튼은 상점 시트 안에 있으므로 시트가 확실히 열려 있다.
          // 다시 안 그리면 '1건 복원' 토스트가 뜨는데 보유는 0, 버튼은 잠긴 채다.
          if (count > 0) this._reopenStore()
        } catch {
          this.ui.toast(tr('복원 실패'))
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
        this.ui.toast(tr('목숨 +10'))
      },

      onOpenSettings: () => {
        this.ui.openSettings(this.settings, (id, value) => this._changeSetting(id, value))
      },
      onOverlayClosed: () => {
        // 일시정지 중 설정/도감을 닫으면 일시정지 화면으로 되돌아온다
        if (this.screen === 'game' && this.paused && this.game
            && this.game.phase !== 'victory' && this.game.phase !== 'defeat') {
          this.ui.openPause()
          return
        }
        // 결과 화면에서 연 상점을 닫으면 결과로 되돌아온다.
        // 안 그러면 캣닢을 사고 나왔을 때 멈춘 지도만 남고 이어하기가 사라진다.
        if (this._returnToResult && this._lastResult) {
          this._returnToResult = false
          this.ui.openResult(this._lastResult.summary, this.progress, this._lastResult.chapter,
            { unlocked: this._lastResult.unlocked, expedition: this._lastResult.expedition })
        }
      },
    }
  }

  /**
   * 로딩 화면. 진행률은 loading.js 가 세고(파일 42개), 여기서는 그리기와 흐름만 한다:
   * 최소 0.9초 표시 → 다 오거나 15초 → 탭 → 오디오 해제 → 타이틀.
   *
   * 최소 표시: 캐시된 재방문은 0.3초에 끝나서 로고가 번쩍이고 사라진다.
   * 최대 대기: 그림이 없어도 벡터로 도니 가두지 않는다.
   * 탭 게이트: 브라우저가 첫 제스처 전에는 소리를 막는다. 타이틀의 도감·상점·설정
   * 버튼은 unlock 을 안 부르므로 여기가 유일하게 확실한 자리다.
   */
  _startLoadingScreen() {
    const node = document.getElementById('loading')
    if (!node) return   // 옛 번들·검사 환경
    this.ui.setLoadingVersion(APP_VERSION)

    const tips = buildTips(Math.random, { crystalLife: CRYSTAL_LIFE_SEC })
    let ti = 0
    this.ui.setLoadingTip(tips[0])
    const tipTimer = setInterval(() => {
      ti = (ti + 1) % tips.length
      this.ui.setLoadingTip(tips[ti])
    }, 3200)

    // 타이틀 배경도 센다 — CSS 가 실제로 쓰는 URL 을 computedStyle 에서 읽어 하나 더 연다.
    // 같은 URL 이라 추가 다운로드는 없고, 번들(data URI)에서도 그대로 맞는다.
    const bgUrl = (getComputedStyle(document.getElementById('screen-title')).backgroundImage
      .match(/url\("?([^")]+)"?\)/) || [])[1]
    if (bgUrl) {
      loading.expect(1)
      const bg = new Image()
      bg.onload = bg.onerror = () => loading.finish()
      bg.src = bgUrl
    }

    loading.subscribe((s) => this.ui.setLoadingProgress(s))

    const shownAt = performance.now()
    let readied = false
    const ready = (note) => {
      if (readied) return
      readied = true
      clearInterval(tipTimer)
      const wait = Math.max(0, 900 - (performance.now() - shownAt))   // 최소 표시
      setTimeout(() => { this.ui.loadingReady(note); this._haptic(8) }, wait)
    }
    loading.whenComplete(() => ready())
    setTimeout(() => ready(tr('일부 그림은 나중에 옵니다')), 15000)      // 가두지 않는다

    const go = () => {
      if (!readied || this._loadingDone) return
      this._loadingDone = true
      this.audio.unlock()
      this.audio.setBgm(true)
      this.ui.hideLoading()
      this._afterLoading()
    }
    node.addEventListener('click', go)
    document.getElementById('loading-tap').addEventListener('click', go)
  }

  /**
   * 로딩이 걷힌 직후 — 출석 보상과 업적 소급 판정. 로딩 화면(z 100) 위로는 토스트가
   * 안 보이므로 여기서 한다. 업적은 기존 세이브도 한 번에 소급된다(표 합계로 유한).
   */
  _afterLoading() {
    if (this._reconcileNote) {
      this.ui.toast(this._reconcileNote, 4200)
      this._reconcileNote = null
      this._persist()
    }
    const r = claimDaily(this.progress, localDateKey())
    if (r.claimed || r.code === 'clock-back') {
      this.progress = r.progress
      this._persist()
      this.ui.setCatnip(this.progress.catnip)
    }
    if (r.claimed) this.ui.openDaily({ day: r.day, reward: r.reward, table: DAILY_REWARDS, tickets: r.tickets || 0 })
    const unlocked = this._checkAchievements(null)
    if (unlocked.length) this.ui.toastQueue(unlocked.map((a) => tr('업적 달성: {aName}  캣닢 +{catnip}', { aName: a.name, catnip: a.catnip })), 2200)
  }

  /** 업적 판정에 넣는 등록 수 — 숫자를 박지 않는다 */
  _counts() {
    return {
      towers: listTowers().length, freeTowers: listFreeTowers().length, combos: listCombos().length, pets: listPets().length,
      chapters: listChapters().length, maps: listMaps().length, challenges: listChallenges().length,
    }
  }

  /**
   * 업적 판정. 새로 풀린 것을 돌려준다 (호출한 쪽이 토스트나 결과 시트에 싣는다).
   * summary 는 방금 끝난 판의 요약, 부팅·펫 구매 뒤에는 null.
   */
  _checkAchievements(summary = null) {
    const { progress, unlocked } = evaluateAchievements(this.progress, summary, listAchievements(), this._counts())
    if (unlocked.length === 0) return []
    this.progress = progress
    if (this.game) this.game.setProgress(this.progress)
    this._persist()
    this.ui.setCatnip(this.progress.catnip)
    return unlocked
  }

  /**
   * 결제·복원 뒤 상점을 같은 맥락으로 다시 그린다.
   *
   * 상점 시트는 한 번만 그려진다 — 보유 캣닢, 구매 버튼 잠금, '보유 중' 배지가
   * 전부 그때 값으로 굳는다. 결제 쪽은 다시 그리고 있었는데 복원만 빠져서,
   * '1건 복원' 토스트가 뜨는데 보유는 0이고 버튼은 잠긴 채로 남았다.
   */
  _reopenStore() {
    this.ui.openStore(this._storeCtx || 'title', this.progress, this.billing.label)
  }

  /**
   * 설정과 캣닢을 한 번에 저장한다.
   *
   * saveProgress 는 용량 초과·시크릿 모드를 잡아 false 를 돌려주는데, 예전에는
   * 13곳의 호출자가 전부 그 값을 버렸다. 저장이 안 되고 있어도 다음에 켤 때까지
   * 아무도 몰랐다. 실패는 한 번만 알린다 — 매번 띄우면 토스트가 도배된다.
   */
  _persist() {
    this.progress.settings = this.settings
    const ok = saveProgress(this.storage, this.progress)
    if (!ok && !this._saveWarned) {
      this._saveWarned = true
      this.ui.toast(tr('저장이 안 된다 — 저장 공간이 없거나 시크릿 모드일 수 있다'))
    }
    return ok
  }

  _changeSetting(id, value) {
    this.settings[id] = value
    this._persist()
    this._applySettingsSideEffects()
    if (id === 'language') {
      // 이미 번역돼 붙은 문구(레지스트리 · 정적 HTML)는 되돌릴 수 없다 — 다시 시작하는 게 정직하다
      this.ui.toast(tr('언어를 바꿔 다시 시작한다'))
      setTimeout(() => location.reload(), 700)
    }
  }

  _applySettingsSideEffects() {
    document.body.classList.toggle('left-handed', !!this.settings.leftHanded)
    document.body.classList.toggle('reduced-motion', !!this.settings.reducedMotion)
    document.body.classList.toggle('text-lg', this.settings.textSize === 'large')
  }

  /**
   * 첫 판 안내. 0.25초마다 상태를 보고 아직 안 본 힌트를 하나 띄운다 (한 번에 하나,
   * 다른 토스트가 떠 있으면 기다린다). 설정 '첫 판 도움말'이 꺼져 있으면 아무것도 안 한다.
   */
  _syncHints(dt) {
    if (!this.settings.hints || !this.game || this.paused) return
    this._hintClock = (this._hintClock || 0) + dt
    if (this._hintClock < 0.25) return
    this._hintClock = 0
    if (!document.getElementById('toast').hidden) return
    const h = nextHint(this.game, this.progress.hintsSeen || [])
    if (!h) return
    this.progress = { ...this.progress, hintsSeen: [...(this.progress.hintsSeen || []), h.id] }
    this._persist()
    this.ui.toast(tr(h.text), 3200)
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
    this.audio.setBgm(screen === 'game' || screen === 'title')   // 배경음은 타이틀·게임에서
    if (screen !== 'game') this.audio.setBgmMode('normal')
    if (screen === 'maps') this.ui.renderMapList(this.progress)
    if (screen === 'chapters') this.ui.renderChapterList(this.progress)
    this.ui.showScreen(screen)
    if (push && window.history && window.history.pushState) {
      try { window.history.pushState({ screen }, '') } catch { /* file://에선 막힐 수 있다 */ }
    }
  }

  /**
   * 하드웨어 뒤로가기.
   *
   * 전투 중에는 '일시정지 열기 / 닫기' 토글로 못 박는다. 게임에서 나가는 것은
   * 일시정지 메뉴의 '나가기'(_saveRun 을 제대로 부른다)로만 한다.
   *
   * 전에는 이랬다: 1번째 일시정지가 뜨고, 2번째는 closeOverlay 만 해서
   * onOverlayClosed 가 곧바로 다시 열어 겉보기엔 아무 일도 안 일어나는데
   * 히스토리만 한 칸 닳고, 3번째에 canGoBack() 이 false 가 되어 앱이 그대로
   * 꺼졌다 — _saveRun 을 못 거치므로 그 판 기록이 통째로 날아갔다.
   */
  _bindHistory() {
    window.addEventListener('popstate', () => {
      // 로딩 중엔 아무것도 안 한다 — 뒤로 갈 곳이 없다
      const ld = document.getElementById('loading')
      if (ld && !ld.hidden) return
      const inGame = this.screen === 'game'
      if (!document.getElementById('overlay').hidden) {
        if (inGame && this.paused) { this.paused = false; this.ui.closeOverlay(); return }
        this.ui.closeOverlay()
        // 전투 중이면 히스토리를 되채워 다음 뒤로가기가 앱을 끄지 않게 한다
        if (inGame) this._pushGuard()
        return
      }
      if (inGame) { this.paused = true; this.ui.openPause(); this._pushGuard(); return }
      if (this.screen === 'maps' || this.screen === 'chapters') this._goto('title', false)
    })
  }

  /** 전투 중 뒤로가기가 히스토리를 다 쓰고 앱을 끄지 않도록 한 칸 채워 둔다 */
  _pushGuard() {
    if (!window.history || !window.history.pushState) return
    try { window.history.pushState({ screen: 'game' }, '') } catch { /* file://에선 막힐 수 있다 */ }
  }

  // ---------------------------------------------------------- 게임 시작

  /**
   * 시나리오 챕터를 시작한다. 컷신을 먼저 보여주고 끝나면 전투로 들어간다.
   * 컷신이 없으면 곧바로 전투다 — 없는 챕터도 있을 수 있게 둔다.
   */
  startChapter(chapterId) {
    const ch = getChapter(chapterId)
    if (!ch) return
    if (!hasAct(this.progress, ch.act || 1)) { this.ui.toast(tr('이 막은 상점에서 연다')); return }
    this.audio.unlock()
    this.ui.openStoryCards(ch.intro, () => this.startGame(ch.mapId, ch))
  }

  /**
   * 도전 — 클리어한 자유 모드 맵에 규칙 하나를 얹어 다시 논다. 맵을 깬 적이 없으면
   * 시트가 안 열리지만, 여기서도 한 번 더 막는다(칩은 UI 가 그리는 것이라 새는 경로가 있을 수 있다).
   */
  startChallenge(mapId, challengeId) {
    const ch = getChallenge(challengeId)
    if (!ch || !(this.progress.clears[mapId] > 0)) return
    if (!hasPack(this.progress, ch.pack)) { this.ui.toast(tr('이 도전은 도전 팩에 들어 있다 · 상점에서')); return }
    this.audio.unlock()
    this.ui.closeOverlay()
    this.startGame(mapId, null, ch)
  }

  /**
   * 이번 주 도전 — 주 키에서 맵·규칙·시드가 정해진다(weekly.js). 맵 해금과 무관하게 열린다:
   * 자유 모드 기록을 안 건드리는 별도 모드라 새 사람에게 뒷 맵을 맛보게 하는 쪽이 낫다.
   */
  startWeekly() {
    const key = weekKey()
    const pick = weeklyPick(key, listMaps(), listChallenges().filter((c) => !c.pack))   // 주간은 모두가 할 수 있어야 한다 — 무료 규칙만
    if (!pick) return
    this.audio.unlock()
    this.ui.closeOverlay()
    const challenge = pick.challengeId ? getChallenge(pick.challengeId) : null
    this.startGame(pick.mapId, null, challenge, { weekly: key, random: mulberry32(pick.seed) })
  }

  /**
   * 속성 원정 — 칸 다섯을 **목숨 하나로** 잇는다. 덱은 네 마리고, 시작할 때 굳는다.
   *
   * 진행 중인 원정은 저장하지 않는다(앱을 닫으면 처음부터). 대신 칸별 첫 클리어 보상을
   * 그 자리에서 주므로 시간은 잃어도 보상은 안 잃는다 — `recordExpedition` 이 그 일을 한다.
   */
  startExpedition(expId, deck) {
    const exp = getExpedition(expId)
    if (!exp) return
    const all = listTowers().map((t) => t.id)
    const gate = canEnter(this.progress, all)
    if (!gate.ok) {
      this.ui.toast(tr('원정은 고양이 {need}마리부터 · 지금 {have}마리', { need: gate.need, have: gate.have }))
      return
    }
    const owned = new Set(ownedCats(this.progress, all))
    const picked = (deck || []).filter((id) => owned.has(id)).slice(0, DECK_SIZE)
    if (picked.length !== DECK_SIZE) { this.ui.toast(tr('덱을 {n}마리로 채워라', { n: DECK_SIZE })); return }

    this.audio.unlock()
    this.ui.closeOverlay()
    this.progress = setExpeditionDeck(this.progress, picked)
    this._persist()
    this.expeditionRun = { id: expId, stage: 0, lives: 0, deck: picked }
    this._startExpeditionStage()
  }

  /** 지금 칸을 시작한다. 목숨은 `run.lives`(직전 칸에서 남은 수)가 0보다 크면 그것으로 이어진다. */
  _startExpeditionStage() {
    const run = this.expeditionRun
    const exp = run && getExpedition(run.id)
    const stage = exp && exp.stages[run.stage]
    if (!stage) { this.expeditionRun = null; this._goto('maps'); return }
    const all = listTowers().map((t) => t.id)
    this.startGame(stage.mapId, null, null, {
      expedition: run.id,
      waveSet: stage.waveSet,
      waveLimit: stage.waveLimit,
      rules: stageRules(stage, run.deck, all),
      lives: run.lives,
    })
  }

  /** 주간 첫 클리어 보상 — 프리미엄은 2배 */
  _weeklyReward() {
    return WEEKLY_REWARD * (this.progress.premium ? 2 : 1)
  }

  /**
   * @param {string} mapId 맵 id
   * @param {object|null} chapter 시나리오 챕터. 주면 웨이브셋·길이가 챕터를 따르고
   *   결과 화면이 목표 판정을 함께 보여준다. 안 주면 지금까지의 자유 모드다.
   * @param {object|null} challenge 도전 정의(registerChallenge). 규칙이 Game 으로 들어간다.
   *   도전 판은 해금·bestWave·무한을 건드리지 않고 challenge 기록만 남긴다.
   * @param {{ weekly?: string, random?: Function }} [extra] 주간 도전 키와 시드 난수
   */
  startGame(mapId, chapter = null, challenge = null, extra = {}) {
    const mapDef = getMap(mapId)
    if (!mapDef) return

    this.currentMapId = mapId
    this.currentChapterId = chapter ? chapter.id : null
    this.currentChallengeId = challenge ? challenge.id : null
    this.currentWeeklyKey = extra.weekly || null
    this.currentExpeditionId = extra.expedition || null
    this.game = new Game({
      mapDef,
      difficulty: difficultyOf(this.settings),
      settings: this.settings,
      audio: this.audio,
      progress: this.progress,
      // 챕터는 정의에서, 원정은 칸에서 웨이브셋·길이를 받는다
      waveSet: chapter ? chapter.waveSet : (extra.waveSet || null),
      waveLimit: chapter ? (chapter.waveLimit || 0) : (extra.waveLimit || 0),
      challenge,
      weekly: extra.weekly || null,
      rules: extra.rules || null,
      lives: extra.lives || 0,
      random: extra.random || Math.random,
    })
    this._catnipSynced = 0
    this._runLedger = null   // 이 판에서 아직 아무것도 기록에 반영하지 않았다
    this.game.on('victory', (s) => this._endRun(s))
    this.game.on('defeat', (s) => this._endRun(s))
    this.game.on('waveclear', ({ bonus }) => this.ui.toast(tr('웨이브 클리어  +{bonus}', { bonus: bonus })))
    this.game.on('combo', ({ combo }) => this._recordCombo(combo.id))
    // 목숨이 깎이는 순간은 가장 중요한 피드백이라 진동을 조금 더 길게 준다
    this.game.on('leak', () => this._haptic(45))

    this.selectedTower = null
    this.placingId = null
    // 지난 판의 결과를 버린다. 안 지우면 새 판에서 시트를 닫을 때
    // 옛 결과 화면이 되살아난다.
    this._lastResult = null
    this._returnToResult = false
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
      if (pet) this.ui.toast(tr('{petName}과(와) 함께 간다', { petName: pet.name }))
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
      const unlocked = this._checkAchievements(null)
      this.ui.toastQueue([tr('{petName}이(가) 합류했다', { petName: pet.name }), ...unlocked.map((a) => tr('업적 달성: {aName}  캣닢 +{catnip}', { aName: a.name, catnip: a.catnip }))])
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
      const res = recordChapter(this.progress, chapter.id, stars, chapter.rewards, chapter.mapId)
      this.progress = res.progress
      if (res.gained.catnip) summary.catnipEarned += res.gained.catnip
      if (res.gained.tower) {
        const t = getTower(res.gained.tower)
        if (t) this.ui.toast(tr('{tName}이(가) 합류했다', { tName: t.name }))
      }
      if (res.gained.pet) {
        const p = getPet(res.gained.pet)
        if (p) this.ui.toast(tr('펫 {pName}이(가) 식구가 됐다 · 타이틀의 펫에서 데려갈 수 있다', { pName: p.name }), 2600)
      }
      if (res.gained.skin) {
        const sk = getSkin(res.gained.skin)
        if (sk) this.ui.toast(tr('스킨 {skName} 획득 · 도감의 스킨에서 장착', { skName: sk.name }), 2600)
      }
      // Game 은 만들 때 받은 progress 객체를 들고 있다. 진행도는 새 객체로 갈아끼우는
      // 방식이라, 여기서 넘겨주지 않으면 보상으로 푼 고양이가 이 판에서는 계속 잠겨 보인다.
      this.game.setProgress(this.progress)
      this._persist()
    } else if (summary.cleared && this.currentExpeditionId && this.expeditionRun) {
      // 원정 칸 보상은 _saveRun 의 recordExpedition 이 준다(첫 클리어만). 결과 화면에 보이게 요약에만 얹는다.
      const run = this.expeditionRun
      const exp = getExpedition(run.id)
      const stage = exp && exp.stages[run.stage]
      if (stage && run.stage + 1 > reachedStage(this.progress, run.id)) {
        summary.catnipEarned += stage.reward.catnip || 0
      }
    } else if (summary.cleared && this.currentWeeklyKey) {
      // 주간 첫 클리어 보상은 _saveRun 의 recordWeekly 가 준다. 결과 시트에 보이게 요약에만 얹는다.
      const key = this.currentWeeklyKey
      if (!(this.progress.weekly && this.progress.weekly.cleared[key])) summary.catnipEarned += this._weeklyReward()
    } else if (summary.cleared && this.currentChallengeId) {
      // 도전 첫 클리어 보상은 _saveRun 의 recordChallenge 가 준다(장부라 한 번만).
      // 결과 시트의 '캣닢' 칸에도 보이게 여기서 요약에만 얹는다.
      const ch = getChallenge(this.currentChallengeId)
      const key = `${summary.mapId}:${this.currentChallengeId}`
      const first = !(this.progress.challenge && this.progress.challenge.clears[key] > 0)
      if (ch && first) summary.catnipEarned += ch.reward
    } else if (summary.cleared) {
      // 맵을 처음 클리어하면 캣닢 보너스를 준다 (자유 모드만)
      const bonus = catnipForMapClear(catnipMultiplier(this.progress))
      this.progress = addCatnip(this.progress, bonus)
      summary.catnipEarned += bonus
    }

    const unlocked = this._saveRun()
    this.ui.setCatnip(this.progress.catnip)

    /* 결과 시트를 다시 열 수 있게 인자를 보관한다.
     * 패배 화면에서 '캣닢 충전'을 누르면 상점이 결과 시트를 덮어쓰는데,
     * 캣닢을 사고 상점을 닫으면 돌아올 곳이 없었다 — 이어하기 하려고 돈을 냈는데
     * 멈춘 화면만 남았다. onOverlayClosed 가 이걸 보고 되돌린다. */
    /* 원정이면 결과 시트가 사다리와 '다음 칸' 버튼을 함께 보인다. 별도 시트를 안 만드는 이유:
     * 남은 목숨·잡은 수·캣닢이 그대로 필요한데 그걸 두 번 만들면 두 곳이 어긋난다. */
    const run = this.currentExpeditionId ? this.expeditionRun : null
    const expedition = run ? {
      exp: getExpedition(run.id), stage: run.stage, livesLeft: summary.livesLeft,
    } : null
    this._lastResult = { summary, chapter, unlocked, expedition }
    const showResult = () => this.ui.openResult(summary, this.progress, chapter, { unlocked, expedition })
    // 목표를 이뤘으면 마무리 컷신을 먼저 보여준다
    if (chapter && chapter.outro.length && summary.cleared) {
      this.ui.openStoryCards(chapter.outro, showResult)
    } else {
      showResult()
    }
  }

  /**
   * 진행도 저장 — 중간에 나가도 최고 웨이브와 평생 기록은 남는다.
   *
   * 이 함수는 한 판에서 여러 번 불린다(승리 → 결과 시트 → '맵 선택으로'). 그래서
   * 이번 판에서 마지막으로 반영한 summary 를 _runLedger 에 두고 **그 뒤로 늘어난
   * 만큼만** 더한다 — 안 그러면 clears 가 판마다 두 번 오른다(실제로 그랬다).
   *
   * 시나리오 판은 recordResult 를 부르지 않는다. waveLimit 6짜리 챕터가 그 맵의
   * bestWave 를 6으로 써버리면 자유 모드 기록이 부정확해지고, unlockedMaps 도
   * 시나리오가 건드리면 자유 모드 해금 순서가 뒤엉킨다.
   */
  _saveRun() {
    if (!this.game) return
    const s = this.game.summary()
    const prev = this._runLedger
    this.progress = accountRun(this.progress, s, prev).progress
    const newlyCleared = s.cleared && !(prev && prev.cleared)
    const challenge = this.currentChallengeId ? getChallenge(this.currentChallengeId) : null
    if (this.currentExpeditionId && this.expeditionRun) {
      /* 원정 판. **이 분기가 자유 모드보다 앞에 있어야 한다** — 뒤에 있으면 아래
       * recordResult 가 원정 성적으로 그 맵의 bestWave·clears·unlockedMaps 를 덮어쓴다. */
      const run = this.expeditionRun
      const exp = getExpedition(run.id)
      const stage = exp && exp.stages[run.stage]
      if (stage) {
        this.progress = recordExpedition(
          this.progress, run.id, run.stage, newlyCleared, stage.reward, run.stage === exp.stages.length - 1,
        )
      }
    } else if (this.currentWeeklyKey) {
      // 주간 판: 시드·규칙이 다르니 자유 모드·도전 기록에 섞지 않는다
      this.progress = recordWeekly(
        this.progress, this.currentWeeklyKey, Math.min(s.reachedWave, s.tableWaves), newlyCleared, this._weeklyReward(),
      )
    } else if (challenge) {
      // 도전 판: 규칙이 다르니 자유 모드 최고 웨이브·해금·무한 기록에 섞지 않는다
      this.progress = recordChallenge(
        this.progress, `${s.mapId}:${challenge.id}`, Math.min(s.reachedWave, s.tableWaves), newlyCleared, challenge.reward,
      )
    } else if (!this.currentChapterId) {
      this.progress = recordResult(
        this.progress, s.mapId, Math.min(s.reachedWave, s.tableWaves), newlyCleared, nextMapId(s.mapId),
      )
      if (s.endless) this.progress = recordEndless(this.progress, s.mapId, s.endlessWaves)
    }
    this._runLedger = s
    this._persist()
    return this._checkAchievements(s)
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
      if (tile) this.ui.toast(tr('여기엔 못 짓는다'))
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
    /* 가로 안내 막의 탈출구. 막을 켜고 끄는 것은 CSS 미디어 쿼리라 여기엔 상태가 없다 —
     * 이 버튼은 html 에 표시 하나만 남기고, 회전하면 미디어 쿼리가 알아서 꺼진다.
     * 창이 작은 데스크톱을 위한 것이지 폰에서 권하는 길이 아니다. */
    const ignore = document.getElementById('rotate-ignore')
    if (ignore) {
      ignore.addEventListener('click', () => {
        document.documentElement.classList.add('rotate-ok')
        this._resize()
      })
    }
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
    this.ui.refreshTowerPanel(this.game, this.selectedTower)
    this.ui.updateSpecials(this.game)
    this._syncCatnip()
    this._syncHints(realDt)
    // 보스가 전장에 있으면 보스 테마. 실제 전환은 마디 경계에서 audio 가 한다.
    this.audio.setBgmMode(this.game.bossOnField > 0 ? 'boss' : 'normal')

    this.renderer.draw(this.game, {
      selected: this.selectedTower,
      placing: this.placingId ? getTower(this.placingId) : null,
      hover: this.hover,
      buildable: this.hoverOk,
    })
  }
}

/**
 * localStorage — 없거나 막혔으면 메모리로 떨어진다.
 *
 * loadProgress 는 getItem 을 잘 감쌌지만, window.localStorage **속성을 읽는 것만으로**
 * 던지는 환경이 있다(시크릿 모드, 저장이 차단된 오리진, dom.storage.enabled=false).
 * 그 예외는 App 생성자에서 터져서 '준비 완료'라고 적힌 채 버튼만 전부 죽은 화면을 만든다.
 */
function safeStorage() {
  try {
    const ls = window.localStorage
    ls.getItem('catpaw.probe')
    return ls
  } catch {
    const mem = new Map()
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)) },
      removeItem: (k) => { mem.delete(k) },
    }
  }
}

// ---------------------------------------------------------- 부팅

function boot() {
  const status = document.getElementById('boot-status')
  let summary
  try {
    summary = validateAll()
  } catch (err) {
    // 콘텐츠가 잘못됐으면 조용히 깨지지 않고 화면 가운데에 크게 보여준다.
    // 예전에는 화면 맨 아래 작은 버전 글씨에만 찍혀서, 버튼이 전부 죽은
    // 멀쩡해 보이는 타이틀 화면이 남았다.
    showBootError(tr('콘텐츠 오류'), err)
    return
  }

  // 프레임 아트는 기다리지 않는다. 도착 전까지는 캔버스 스프라이트로 그려지므로
  // 첫 화면이 그림 다운로드에 밀리지 않는다.
  loadFrameSets()
  loadMapArt()
  // '전부 열림' 마이그레이션이 가리킬 목록. 고양이를 추가해도 따라온다.
  setAllTowerIds(registry.listTowers().map((t) => t.id))

  let app
  try {
    app = new App()
  } catch (err) {
    // 여기서 터지면 예전에는 '준비 완료'라고 적힌 채 전부 죽었다.
    // 그래서 성공 문구는 App 이 실제로 만들어진 뒤에만 쓴다.
    showBootError(tr('시작 실패'), err)
    return
  }
  status.textContent = tr('고양이 {t}종 · 해충 {e}종 · 맵 {m}종 준비 완료', { t: summary.towers, e: summary.enemies, m: summary.maps })
  document.documentElement.dataset.ready = '1'   // 스모크 · 인라인 폴백이 문구 대신 이 신호를 본다(문구는 언어에 따라 다르다)

  // 헤드리스 스모크 테스트에서 게임을 조작하기 위한 훅
  window.__catpaw = app
  app.__registry = registry   // 스프라이트 시트 생성 등 개발 도구용
  app._onSwUpdate = () => onSwUpdate(app)   // 스모크가 업데이트 토스트를 직접 띄워 본다
  app.__framesets = framesets  // 프레임 아트가 실제로 붙었는지 스모크에서 확인한다
  app.__loading = loading      // 로딩 진행률이 실제 파일 수와 맞는지 스모크에서 확인한다

  // 로딩 화면. '준비 완료' 와 window.__catpaw 가 먼저다 — 스모크가 그 순간 읽는다.
  app._startLoadingScreen()
}

/** 부팅이 실패했다는 것을 화면 가운데에 크게 알린다 */
function showBootError(title, err) {
  console.error(err)
  const box = document.getElementById('boot-error')
  if (box) {
    box.hidden = false
    box.textContent = `${title}\n${err && err.message ? err.message : err}`
    return
  }
  const status = document.getElementById('boot-status')
  if (status) {
    status.textContent = `${title}: ${err && err.message ? err.message : err}`
    status.style.color = '#ff7a7a'
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}

/**
 * 서비스 워커 — 오프라인 구동(PWA). file:// 에서는 등록이 불가능하므로 건너뛴다.
 *
 * 안드로이드 APK(appassets.androidplatform.net) 안에서는 등록하지 않고, 남아 있는 등록을 해제한다.
 * 에셋이 이미 로컬이라 워커가 보태는 게 없고, 앱을 업데이트한 뒤 옛 APK 의 파일을 서빙할 수 있는
 * 유일한 것이 이 캐시다. (MainActivity 의 ServiceWorkerControllerCompat 배선은 이 해제가
 * 결정적으로 돌게 하고, 나중에 다시 켤 자리다.)
 */
/** 새 워커가 설치됐고(이미 옛 워커가 페이지를 잡고 있다) → 새로고침해야 새 모듈을 싣는다 */
function onSwUpdate(app) {
  app.ui.toastAction(tr('새 버전이 있습니다'), tr('새로고침'), () => location.reload())
}

if ('serviceWorker' in navigator) {
  if (shouldRegisterServiceWorker(location)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing
          if (!w) return
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller && window.__catpaw) onSwUpdate(window.__catpaw)
          })
        })
      }).catch(() => { /* 없어도 게임은 돌아간다 */ })
    })
  } else if (isAndroidApp(location)) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => { /* 해제 실패는 치명적이지 않다 */ })
  }
}
