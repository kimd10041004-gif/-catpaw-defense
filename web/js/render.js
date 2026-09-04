/**
 * 캔버스 렌더링. 게임 상태를 읽기만 하고 절대 바꾸지 않는다.
 * 모든 좌표는 타일 단위로 들어와서 여기서만 픽셀로 환산된다.
 */

import { drawUnit } from './framesets.js'
import { frameForWalk } from './domain/frames.js'
import { speedMultiplier } from './domain/status.js'
import { pointAtDistance } from './domain/path.js'
import { TARGET_MODE_LABELS } from './domain/targeting.js'

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.tile = 32
    this.ox = 0
    this.oy = 0
    this.dpr = 1
  }

  /**
   * 표시 영역에 맞춰 캔버스 해상도와 타일 크기를 다시 계산한다.
   * 격자가 잘리지 않게 가로/세로 중 빡빡한 쪽에 맞추고 가운데 정렬한다.
   */
  resize(cssW, cssH, mapDef) {
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(cssW * dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * dpr))
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`

    this.tile = Math.min(cssW / mapDef.cols, cssH / mapDef.rows)
    this.ox = (cssW - this.tile * mapDef.cols) / 2
    this.oy = (cssH - this.tile * mapDef.rows) / 2
    this.cssW = cssW
    this.cssH = cssH
  }

  /**
   * 화면 좌표(css px) → 실수 타일 좌표. 격자 밖이어도 그대로 돌려준다.
   * 드래그 중 손가락 위치를 부드럽게 따라가야 하므로 정수로 반올림하지 않는다.
   */
  pointFromPixel(px, py) {
    return { x: (px - this.ox) / this.tile, y: (py - this.oy) / this.tile }
  }

  /** 화면 좌표(css px) → 타일 좌표. 격자 밖이면 null. */
  tileFromPixel(px, py, mapDef) {
    const c = Math.floor((px - this.ox) / this.tile)
    const r = Math.floor((py - this.oy) / this.tile)
    if (c < 0 || r < 0 || c >= mapDef.cols || r >= mapDef.rows) return null
    return { c, r }
  }

  toPx(x) { return this.ox + x * this.tile }
  toPy(y) { return this.oy + y * this.tile }

  /**
   * 한 프레임을 그린다.
   * @param {object} game
   * @param {{selected?:object, placing?:object, hover?:{c,r}, buildable?:boolean}} view
   */
  draw(game, view = {}) {
    const ctx = this.ctx
    const map = game.mapDef
    const t = this.tile

    ctx.save()
    ctx.scale(this.dpr, this.dpr)
    ctx.clearRect(0, 0, this.cssW, this.cssH)

    // 배경
    ctx.fillStyle = map.theme.sky
    ctx.fillRect(0, 0, this.cssW, this.cssH)

    // 화면 흔들림 (누출 시)
    if (game.shake > 0) {
      const s = game.shake * t * 0.16
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
    }

    this._drawGround(game)
    this._drawPath(game)
    this._drawBlocked(game)
    this._drawCrystals(game)
    if (view.placing) this._drawPlacePreview(game, view)
    this._drawRanges(game, view)
    this._drawTowers(game, view)
    this._drawEnemies(game)
    this._drawProjectiles(game)
    this._drawParticles(game)
    this._drawFloaters(game)
    this._drawBossBar(game)
    this._drawScreenFlash(game)

    ctx.restore()
  }

  /** 큰 타격 순간 화면 전체를 물들인다 */
  _drawScreenFlash(game) {
    if (!game.flashColor || game.flashStrength <= 0) return
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = Math.min(0.55, game.flashStrength * 0.55)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = game.flashColor
    ctx.fillRect(-40, -40, this.cssW + 80, this.cssH + 80)
    ctx.restore()
  }

  /** 화면에 보스가 있으면 상단에 큼직한 전용 체력바를 띄운다 */
  _drawBossBar(game) {
    let boss = null
    for (const e of game.enemies) {
      if (!e.def.boss) continue
      if (!boss || (e.def.tier || 1) > (boss.def.tier || 1) || e.maxHp > boss.maxHp) boss = e
    }
    if (!boss) return

    const ctx = this.ctx
    const w = this.cssW * 0.82
    const h = 13
    const x = (this.cssW - w) / 2
    const y = 10

    ctx.save()
    ctx.fillStyle = 'rgba(10,12,18,0.78)'
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6)

    const ratio = Math.max(0, boss.hp / boss.maxHp)
    const grad = ctx.createLinearGradient(x, 0, x + w, 0)
    grad.addColorStop(0, '#ff4d6d')
    grad.addColorStop(1, '#ff9ecb')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w * ratio, h)

    // 보호막은 체력바 위에 파란 층으로 겹쳐 보여준다
    if (boss.shieldMax > 0 && boss.shield > 0) {
      ctx.fillStyle = 'rgba(143,212,255,0.85)'
      ctx.fillRect(x, y, w * Math.min(1, boss.shield / boss.maxHp), h * 0.42)
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)

    ctx.font = `700 ${Math.round(h * 1.05)}px system-ui, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    const tierMark = '★'.repeat(boss.def.tier || 1)
    ctx.fillText(`${tierMark} ${boss.def.name}${boss.enraged ? '  광폭화!' : ''}`, this.cssW / 2, y + h + 14)
    ctx.restore()
  }

  _drawGround(game) {
    const ctx = this.ctx
    const map = game.mapDef
    const t = this.tile

    for (let r = 0; r < map.rows; r += 1) {
      for (let c = 0; c < map.cols; c += 1) {
        ctx.fillStyle = (c + r) % 2 === 0 ? map.theme.ground : map.theme.groundAlt
        ctx.fillRect(this.toPx(c), this.toPy(r), t + 0.5, t + 0.5)
      }
    }

    // 격자선을 아주 옅게 — 칸 경계가 보여야 어디에 지을지 가늠이 된다
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let c = 1; c < map.cols; c += 1) {
      ctx.moveTo(Math.round(this.toPx(c)) + 0.5, this.toPy(0))
      ctx.lineTo(Math.round(this.toPx(c)) + 0.5, this.toPy(map.rows))
    }
    for (let r = 1; r < map.rows; r += 1) {
      ctx.moveTo(this.toPx(0), Math.round(this.toPy(r)) + 0.5)
      ctx.lineTo(this.toPx(map.cols), Math.round(this.toPy(r)) + 0.5)
    }
    ctx.stroke()

    // 위에서 빛이 오는 것처럼 — 평평한 체커보드가 '바닥'으로 읽히게 하는 가장 싼 방법
    const w = t * map.cols
    const h = t * map.rows
    const g = ctx.createRadialGradient(
      this.toPx(map.cols / 2), this.toPy(map.rows * 0.28), t,
      this.toPx(map.cols / 2), this.toPy(map.rows * 0.5), Math.max(w, h) * 0.78,
    )
    g.addColorStop(0, 'rgba(255,255,255,0.055)')
    g.addColorStop(0.55, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.34)')
    ctx.fillStyle = g
    ctx.fillRect(this.toPx(0), this.toPy(0), w, h)
    ctx.restore()
  }

  _drawPath(game) {
    const ctx = this.ctx
    const t = this.tile
    const pts = game.path.points

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 길 아래 그림자 — 길이 바닥에 '파여 있는' 느낌을 준다
    ctx.strokeStyle = 'rgba(0,0,0,0.34)'
    ctx.lineWidth = t * 1.0
    ctx.beginPath()
    ctx.moveTo(this.toPx(pts[0].x), this.toPy(pts[0].y) + t * 0.06)
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(this.toPx(pts[i].x), this.toPy(pts[i].y) + t * 0.06)
    ctx.stroke()

    ctx.strokeStyle = game.mapDef.theme.pathEdge
    ctx.lineWidth = t * 0.94
    ctx.beginPath()
    ctx.moveTo(this.toPx(pts[0].x), this.toPy(pts[0].y))
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(this.toPx(pts[i].x), this.toPy(pts[i].y))
    ctx.stroke()

    ctx.strokeStyle = game.mapDef.theme.path
    ctx.lineWidth = t * 0.78
    ctx.stroke()

    // 진행 방향을 알려주는 점선
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = t * 0.07
    ctx.setLineDash([t * 0.22, t * 0.34])
    ctx.lineDashOffset = -(game.time * t * 0.9) % (t * 0.56)
    ctx.stroke()
    ctx.setLineDash([])

    // 도착 지점 표시 — 여기로 들어오면 목숨이 깎인다
    const end = pointAtDistance(game.path, game.path.lengthTiles)
    ctx.strokeStyle = 'rgba(255,90,90,0.85)'
    ctx.lineWidth = t * 0.1
    ctx.beginPath()
    ctx.arc(this.toPx(end.x), this.toPy(end.y), t * 0.34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  _drawBlocked(game) {
    const map = game.mapDef
    if (!Array.isArray(map.blocked)) return
    const ctx = this.ctx
    const t = this.tile
    for (const [c, r] of map.blocked) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      const pad = t * 0.12
      ctx.fillRect(this.toPx(c) + pad, this.toPy(r) + pad, t - pad * 2, t - pad * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 1
      ctx.strokeRect(this.toPx(c) + pad, this.toPy(r) + pad, t - pad * 2, t - pad * 2)
    }
  }

  /**
   * 밀크 크리스탈 — 주우면 마나가 찬다.
   * 사라지기 직전에는 빠르게 깜빡여서 "곧 없어진다"를 알린다.
   */
  _drawCrystals(game) {
    if (!game.crystals || game.crystals.length === 0) return
    const ctx = this.ctx
    const t = this.tile

    for (const c of game.crystals) {
      const left = c.life / c.maxLife
      // 마지막 30% 구간에서 점멸
      const blinkOn = left > 0.3 || Math.sin(game.time * 18) > -0.2
      if (!blinkOn) continue

      const x = this.toPx(c.x)
      const bob = Math.sin(game.time * 2.6 + c.x) * t * 0.07
      const y = this.toPy(c.y) + bob

      ctx.save()
      // 바닥 빛무리 — 어디 떨어졌는지 멀리서도 보이게
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.30 + Math.sin(game.time * 3) * 0.10
      ctx.fillStyle = '#7fc7ff'
      ctx.beginPath()
      ctx.arc(x, this.toPy(c.y), t * 0.62, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.translate(x, y)
      // 결정 — 위아래로 뾰족한 육각 기둥
      const w = t * 0.20
      const h = t * 0.34
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(w, -h * 0.30)
      ctx.lineTo(w * 0.72, h * 0.72)
      ctx.lineTo(0, h)
      ctx.lineTo(-w * 0.72, h * 0.72)
      ctx.lineTo(-w, -h * 0.30)
      ctx.closePath()
      ctx.fillStyle = '#9fdcff'
      ctx.fill()
      // 왼쪽 면을 밝게 — 입체로 보이게
      ctx.beginPath()
      ctx.moveTo(0, -h)
      ctx.lineTo(-w, -h * 0.30)
      ctx.lineTo(-w * 0.72, h * 0.72)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fillStyle = '#e2f5ff'
      ctx.fill()
      ctx.strokeStyle = '#5aa8e0'
      ctx.lineWidth = Math.max(1, t * 0.025)
      ctx.stroke()
      ctx.restore()
    }
  }

  /** 배치 모드에서 지을 수 있는 칸을 표시하고, 손가락 위치에 사거리 미리보기를 그린다 */
  _drawPlacePreview(game, view) {
    const ctx = this.ctx
    const t = this.tile
    const map = game.mapDef

    ctx.save()
    ctx.globalAlpha = 0.16
    for (let r = 0; r < map.rows; r += 1) {
      for (let c = 0; c < map.cols; c += 1) {
        if (game.towerAt(c, r)) continue
        if (game.path.tileSet.has(`${c},${r}`)) continue
        if ((map.blocked || []).some((b) => b[0] === c && b[1] === r)) continue
        ctx.fillStyle = '#8bffcf'
        ctx.fillRect(this.toPx(c) + t * 0.1, this.toPy(r) + t * 0.1, t * 0.8, t * 0.8)
      }
    }
    ctx.restore()

    if (view.hover) {
      const { c, r } = view.hover
      const ok = view.buildable
      const lv = view.placing.levels[0]
      const cx = c + 0.5
      const cy = r + 0.5

      // 사거리를 먼저 (고양이 뒤에 깔리도록)
      this._rangeCircle(cx, cy, lv.range, ok ? '#8bffcf' : '#ff7a7a')

      ctx.save()
      // 놓일 칸을 굵게 표시 — 손가락에 가려도 보이도록 테두리를 두껍게
      ctx.fillStyle = ok ? 'rgba(120,255,190,0.22)' : 'rgba(255,110,110,0.26)'
      ctx.fillRect(this.toPx(c), this.toPy(r), t, t)
      ctx.strokeStyle = ok ? '#8bffcf' : '#ff7a7a'
      ctx.lineWidth = 3
      ctx.strokeRect(this.toPx(c) + 1.5, this.toPy(r) + 1.5, t - 3, t - 3)

      // 반투명 고양이 미리보기 — 손가락 위가 아니라 '놓일 칸'에 그린다.
      // 손가락에 가려지지 않아야 어디에 놓이는지 보인다.
      ctx.globalAlpha = 0.72
      drawUnit(this.ctx, view.placing, {
        x: this.toPx(cx), y: this.toPy(cy), r: t * 0.36,
        angle: -Math.PI / 2, t: game.time,
      })
      ctx.globalAlpha = 1

      if (!ok) {
        // 왜 못 놓는지 즉시 알 수 있게 X 표시
        ctx.strokeStyle = '#ff7a7a'
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        const p = t * 0.28
        ctx.beginPath()
        ctx.moveTo(this.toPx(c) + p, this.toPy(r) + p)
        ctx.lineTo(this.toPx(c + 1) - p, this.toPy(r + 1) - p)
        ctx.moveTo(this.toPx(c + 1) - p, this.toPy(r) + p)
        ctx.lineTo(this.toPx(c) + p, this.toPy(r + 1) - p)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  _rangeCircle(x, y, rangeTiles, color) {
    const ctx = this.ctx
    ctx.save()
    ctx.beginPath()
    ctx.arc(this.toPx(x), this.toPy(y), rangeTiles * this.tile, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.10
    ctx.fill()
    ctx.globalAlpha = 0.75
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  _drawRanges(game, view) {
    const showAll = game.settings.showAllRanges
    for (const t of game.towers) {
      const isSel = view.selected === t
      if (!showAll && !isSel) continue
      const lv = t.def.levels[t.level - 1]
      this._rangeCircle(t.x, t.y, lv.range, isSel ? '#ffd166' : 'rgba(255,255,255,0.6)')
    }
  }

  _drawTowers(game, view) {
    const ctx = this.ctx
    const t = this.tile
    for (const tw of game.towers) {
      if (view.selected === tw) {
        ctx.save()
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 2.5
        ctx.strokeRect(this.toPx(tw.c) + 2, this.toPy(tw.r) + 2, t - 4, t - 4)
        ctx.restore()
      }

      drawUnit(this.ctx, tw.def, {
        x: this.toPx(tw.x), y: this.toPy(tw.y), r: t * 0.36,
        angle: tw.angle, t: game.time + tw.born,
        phase: tw.recoil,
        seed: tw.uid * 1.7,
        idle: game.isTowerIdle(tw),       // 오래 안 쏘면 자는 프레임
      })

      // 총구 화염 — 발사 직후 짧게 번쩍인다
      if (tw.muzzle > 0) {
        const a = tw.muzzle / 0.12
        ctx.save()
        ctx.globalAlpha = a * 0.9
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = '#fff3cf'
        const mx = this.toPx(tw.x) + Math.cos(tw.angle) * t * 0.42
        const my = this.toPy(tw.y) + Math.sin(tw.angle) * t * 0.42
        ctx.beginPath()
        ctx.arc(mx, my, t * 0.20 * a, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // 강화 버프 중 — 황금 고리
      if (game.towerFireRateMul() > 1) {
        ctx.save()
        ctx.globalAlpha = 0.5 + Math.sin(game.time * 8 + tw.uid) * 0.2
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(this.toPx(tw.x), this.toPy(tw.y), t * 0.46, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 레벨 표시 — 머리 위 점 개수
      const pips = tw.level
      for (let i = 0; i < pips; i += 1) {
        ctx.fillStyle = '#ffd166'
        ctx.beginPath()
        ctx.arc(
          this.toPx(tw.x) + (i - (pips - 1) / 2) * t * 0.16,
          // 그림 고양이는 귀 끝이 타일 위쪽 13%까지 올라온다. 점을 그 위로 올린다.
          this.toPy(tw.r) + t * 0.065,
          t * 0.045, 0, Math.PI * 2,
        )
        ctx.fill()
      }

      // 타겟팅 모드 (선택했을 때만)
      if (view.selected === tw) {
        ctx.save()
        ctx.font = `600 ${Math.round(t * 0.26)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffd166'
        ctx.fillText(TARGET_MODE_LABELS[tw.targetMode] || '', this.toPx(tw.x), this.toPy(tw.r + 1) - t * 0.06)
        ctx.restore()
      }
    }
  }

  _drawEnemies(game) {
    const ctx = this.ctx
    const t = this.tile
    const mode = game.settings.hpBars

    for (const e of game.enemies) {
      const r = e.def.size * t
      // 둔화가 심하면(자장가 등) 멈춘 프레임으로 바꾼다. born 을 더해 개체마다
      // 걷기 위상이 달라야 떼로 나올 때 발이 똑같이 맞지 않는다.
      const speed = speedMultiplier(e.status, game.time) * (e.auraSpeed || 1)
      const frame = frameForWalk(game.time + e.born, speed)

      ctx.save()
      if (e.hitFlash > 0) {
        ctx.filter = `brightness(${1 + e.hitFlash * 5})`
      }
      drawUnit(ctx, e.def, {
        x: this.toPx(e.x), y: this.toPy(e.y), r,
        // 엘리트는 스폰 때 왕관을 얹은 팔레트를 들고 있다 (정의는 그대로 둔다)
        palette: e.palette || e.def.palette,
        angle: e.angle, t: game.time + e.born, seed: e.born * 3.1,
        flying: e.flying, frame,
      })
      ctx.restore()

      // 보호막 — 몸 주위를 감싸는 파란 막
      if (e.shieldMax > 0 && e.shield > 0) {
        ctx.save()
        ctx.globalAlpha = 0.30 + 0.35 * (e.shield / e.shieldMax)
        ctx.fillStyle = '#8fd4ff'
        ctx.beginPath()
        ctx.arc(this.toPx(e.x), this.toPy(e.y), r * 1.45, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = '#cfeaff'
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      // 광폭화 — 붉은 기운이 피어오른다
      if (e.enraged) {
        ctx.save()
        ctx.globalAlpha = 0.35 + Math.sin(game.time * 9) * 0.15
        ctx.strokeStyle = '#ff5c5c'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(this.toPx(e.x), this.toPy(e.y), r * 1.32, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 함성 버프를 받는 중 — 노란 점선
      if (e.buffedBy) {
        ctx.save()
        ctx.globalAlpha = 0.5
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 4])
        ctx.beginPath()
        ctx.arc(this.toPx(e.x), this.toPy(e.y), r * 1.18, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
        e.buffedBy = null
      }

      // 슬로우 표시 — 파란 고리
      if (e.status.slowUntil > game.time) {
        ctx.save()
        ctx.strokeStyle = 'rgba(143,212,255,0.85)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(this.toPx(e.x), this.toPy(e.y), r * 1.25, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      const show = mode === 'always' || (mode === 'damaged' && e.damaged)
      if (show && e.hp < e.maxHp) {
        const w = t * 0.72
        const h = Math.max(3, t * 0.09)
        const bx = this.toPx(e.x) - w / 2
        const by = this.toPy(e.y) - r * 1.5
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(bx - 1, by - 1, w + 2, h + 2)
        const ratio = Math.max(0, e.hp / e.maxHp)
        ctx.fillStyle = e.def.boss ? '#ff7ab8' : ratio > 0.5 ? '#7fe08a' : ratio > 0.22 ? '#ffd166' : '#ff7a7a'
        ctx.fillRect(bx, by, w * ratio, h)
      }
    }
  }

  _drawProjectiles(game) {
    const ctx = this.ctx
    const t = this.tile
    for (const p of game.projectiles) {
      const x = this.toPx(p.x)
      const y = this.toPy(p.y)
      ctx.save()

      // 꼬리 — 어디서 날아왔는지 보이면 훨씬 빠르게 느껴진다
      if (p.angle !== undefined) {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = p.kind === 'bomb' ? '#ffb35c' : p.kind === 'gaze' ? '#8fd4ff' : '#fff3cf'
        ctx.lineWidth = t * 0.10
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x - Math.cos(p.angle) * t * 0.66, y - Math.sin(p.angle) * t * 0.66)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.restore()
      }

      switch (p.kind) {
        case 'bomb':
          ctx.fillStyle = '#c98a4b'
          ctx.beginPath(); ctx.arc(x, y, t * 0.16, 0, Math.PI * 2); ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
          break
        case 'gaze':
          ctx.strokeStyle = 'rgba(143,212,255,0.9)'
          ctx.lineWidth = t * 0.07
          ctx.beginPath()
          ctx.moveTo(x - Math.cos(p.angle || 0) * t * 0.3, y - Math.sin(p.angle || 0) * t * 0.3)
          ctx.lineTo(x, y)
          ctx.stroke()
          break
        case 'dart':
          ctx.strokeStyle = '#f2d45c'
          ctx.lineWidth = t * 0.06
          ctx.beginPath()
          ctx.moveTo(x - Math.cos(p.angle || 0) * t * 0.42, y - Math.sin(p.angle || 0) * t * 0.42)
          ctx.lineTo(x, y)
          ctx.stroke()
          break
        default:
          ctx.fillStyle = '#fff3cf'
          ctx.beginPath(); ctx.arc(x, y, t * 0.08, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
  }

  _drawParticles(game) {
    const ctx = this.ctx
    const t = this.tile
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.maxLife)
      const x = this.toPx(p.x)
      const y = this.toPy(p.y)
      ctx.save()
      ctx.globalAlpha = a

      switch (p.kind) {
        // 퍼져 나가는 고리들
        case 'shockwave':
        case 'splash':
        case 'wave':
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * 0.09
          ctx.beginPath()
          ctx.arc(x, y, p.radius * t * (1.15 - a * 0.35), 0, Math.PI * 2)
          ctx.stroke()
          break

        // 보스 처치 — 두꺼운 이중 고리가 크게 퍼진다
        case 'bossdown': {
          ctx.globalCompositeOperation = 'lighter'
          const grow = (1 - a) * 1.9 + 0.3
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * 0.22 * a
          ctx.beginPath(); ctx.arc(x, y, p.radius * t * grow, 0, Math.PI * 2); ctx.stroke()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = t * 0.08 * a
          ctx.beginPath(); ctx.arc(x, y, p.radius * t * grow * 0.72, 0, Math.PI * 2); ctx.stroke()
          break
        }

        // 필살기 낙하 지점
        case 'strike': {
          ctx.globalCompositeOperation = 'lighter'
          const g = (1 - a) * 1.4 + 0.2
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * 0.14 * a
          ctx.beginPath(); ctx.arc(x, y, p.radius * t * g, 0, Math.PI * 2); ctx.stroke()
          break
        }

        case 'shieldup':
        case 'shieldhit':
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * (p.kind === 'shieldup' ? 0.12 : 0.07)
          ctx.beginPath()
          ctx.arc(x, y, p.radius * t * (p.kind === 'shieldup' ? (1.4 - a * 0.5) : 1), 0, Math.PI * 2)
          ctx.stroke()
          break

        case 'summon':
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * 0.1
          ctx.setLineDash([t * 0.16, t * 0.16])
          ctx.beginPath()
          ctx.arc(x, y, p.radius * t * (1.3 - a * 0.4), 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          break

        // 크리티컬 — 사방으로 튀는 밝은 조각
        case 'crit':
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = p.color
          ctx.lineWidth = t * 0.07
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + p.vx * t * 0.12, y + p.vy * t * 0.12)
          ctx.stroke()
          break

        case 'smoke':
          ctx.globalAlpha = a * 0.42
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(x, y, t * (0.16 + (1 - a) * 0.34), 0, Math.PI * 2)
          ctx.fill()
          break

        case 'heal':
          ctx.fillStyle = p.color
          ctx.font = `700 ${Math.round(t * 0.34)}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText('+', x, y)
          break

        case 'frost':
          ctx.fillStyle = p.color
          ctx.beginPath(); ctx.arc(x, y, t * 0.1 * a, 0, Math.PI * 2); ctx.fill()
          break

        default:
          ctx.fillStyle = p.color
          ctx.beginPath(); ctx.arc(x, y, t * 0.09 * a + 1, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
  }

  _drawFloaters(game) {
    const ctx = this.ctx
    const t = this.tile
    ctx.save()
    ctx.textAlign = 'center'
    for (const f of game.floaters) {
      const a = Math.max(0, f.life / f.maxLife)
      const scale = f.scale || 1
      ctx.font = `700 ${Math.round(t * 0.34 * scale)}px system-ui, -apple-system, sans-serif`
      ctx.globalAlpha = a
      ctx.lineWidth = 3 * scale
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.strokeText(f.text, this.toPx(f.x), this.toPy(f.y))
      ctx.fillStyle = f.color
      ctx.fillText(f.text, this.toPx(f.x), this.toPy(f.y))
    }
    ctx.restore()
  }
}
