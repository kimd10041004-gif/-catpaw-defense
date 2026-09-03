/**
 * 캔버스 렌더링. 게임 상태를 읽기만 하고 절대 바꾸지 않는다.
 * 모든 좌표는 타일 단위로 들어와서 여기서만 픽셀로 환산된다.
 */

import { getSprite } from './content/registry.js'
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
    if (view.placing) this._drawPlacePreview(game, view)
    this._drawRanges(game, view)
    this._drawTowers(game, view)
    this._drawEnemies(game)
    this._drawProjectiles(game)
    this._drawParticles(game)
    this._drawFloaters(game)

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
  }

  _drawPath(game) {
    const ctx = this.ctx
    const t = this.tile
    const pts = game.path.points

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

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
      ctx.save()
      ctx.fillStyle = ok ? 'rgba(120,255,190,0.30)' : 'rgba(255,110,110,0.32)'
      ctx.fillRect(this.toPx(c), this.toPy(r), t, t)
      ctx.strokeStyle = ok ? '#8bffcf' : '#ff7a7a'
      ctx.lineWidth = 2
      ctx.strokeRect(this.toPx(c) + 1, this.toPy(r) + 1, t - 2, t - 2)
      this._rangeCircle(c + 0.5, r + 0.5, lv.range, ok ? '#8bffcf' : '#ff7a7a')
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
      const draw = getSprite(tw.def.sprite)
      if (!draw) continue

      if (view.selected === tw) {
        ctx.save()
        ctx.strokeStyle = '#ffd166'
        ctx.lineWidth = 2.5
        ctx.strokeRect(this.toPx(tw.c) + 2, this.toPy(tw.r) + 2, t - 4, t - 4)
        ctx.restore()
      }

      draw(ctx, {
        x: this.toPx(tw.x), y: this.toPy(tw.y), r: t * 0.36,
        palette: tw.def.palette, angle: tw.angle, t: game.time + tw.born,
        extra: { recoil: tw.recoil },
      })

      // 레벨 표시 — 머리 위 점 개수
      const pips = tw.level
      for (let i = 0; i < pips; i += 1) {
        ctx.fillStyle = '#ffd166'
        ctx.beginPath()
        ctx.arc(
          this.toPx(tw.x) + (i - (pips - 1) / 2) * t * 0.16,
          this.toPy(tw.r) + t * 0.10,
          t * 0.05, 0, Math.PI * 2,
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
      const draw = getSprite(e.def.sprite)
      if (!draw) continue
      const r = e.def.size * t

      ctx.save()
      if (e.hitFlash > 0) {
        ctx.filter = `brightness(${1 + e.hitFlash * 5})`
      }
      draw(ctx, {
        x: this.toPx(e.x), y: this.toPy(e.y), r,
        palette: e.def.palette, angle: e.angle, t: game.time + e.born, flying: e.flying,
      })
      ctx.restore()

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
      if (p.kind === 'shockwave' || p.kind === 'splash') {
        ctx.strokeStyle = p.color
        ctx.lineWidth = t * 0.09
        ctx.beginPath()
        ctx.arc(x, y, p.radius * t * (1.15 - a * 0.35), 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'frost') {
        ctx.fillStyle = p.color
        ctx.beginPath(); ctx.arc(x, y, t * 0.1 * a, 0, Math.PI * 2); ctx.fill()
      } else {
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
    ctx.font = `700 ${Math.round(t * 0.34)}px system-ui, -apple-system, sans-serif`
    for (const f of game.floaters) {
      const a = Math.max(0, f.life / f.maxLife)
      ctx.globalAlpha = a
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'
      ctx.strokeText(f.text, this.toPx(f.x), this.toPy(f.y))
      ctx.fillStyle = f.color
      ctx.fillText(f.text, this.toPx(f.x), this.toPy(f.y))
    }
    ctx.restore()
  }
}
