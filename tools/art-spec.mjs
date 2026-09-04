/**
 * 캐릭터 그림 발주서 — 여덟 장.
 *
 * 지금 게임에는 그림이 아예 없어 벡터 도형으로 떨어지는 캐릭터가 8종 있고
 * (고양이 4 · 해충 4), 그림은 있지만 원본이 209px 이라 화면에서 최대 2.86배로
 * 늘어나는 보스가 5종 있다. 그 열셋의 발주서다.
 *
 * ── 칸 수가 해상도를 정한다 ──────────────────────────────────────────────────
 * art-src/ 다섯 장을 재 보니 생성기는 **내가 준 가로세로 비율을 지키고 넓이만
 * 약 1.05메가픽셀로 맞춘다** (내 발주서 1158×1774 → 돌아온 것 816×1285).
 * 그래서 돌아올 셀 크기는 이렇게 예측된다:
 *
 *     셀 = sqrt(1.05e6 × f / n)      f = 발주서에서 격자가 차지하는 넓이 비율
 *                                     n = 칸 수
 *
 * 지난 해충 발주서로 검증했다: f=0.664, n=15 → 예측 216px, 실제 209px (오차 3%).
 *
 * 여기서 나오는 결론 셋이 이 파일의 모양을 정했다.
 *   1. 고양이 4마리를 한 장(20칸)에 넣으면 176px 이라 지금(169)과 같다.
 *      **두 장으로 쪼갠다.**
 *   2. **왼쪽 이름 칸을 없앤다.** 지난 시트는 폭의 22%를 이름에 썼다.
 *      칸 위 작은 글씨로 옮기면 같은 칸 수에서 f 가 오른다.
 *   3. 보스는 한 마리당 한 장. 3칸뿐이라 셀이 가장 커진다.
 *
 * 글씨 크기는 시트 폭에 비례해 키운다(S). 생성기는 입력을 1024px 안팎으로
 * 줄여 읽으므로, 넓은 시트에 작은 글씨를 쓰면 안 읽힌다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/art-spec.mjs
 *
 * 결과물 (보내는 순서대로)
 *   tools/out/23-art-cats-1.png    고양이 2마리 × 5프레임
 *   tools/out/23-art-cats-2.png    고양이 2마리 × 5프레임
 *   tools/out/23-art-pests.png     해충 4종 × 3프레임
 *   tools/out/23-art-boss-*.png    보스 1마리 × 3프레임 (다섯 장)
 */
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'web')
const outDir = join(root, 'tools/out')
mkdirSync(outDir, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
}

const server = await new Promise((resolve) => {
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (p === '/' || p.endsWith('/')) p += 'index.html'
      const file = join(webRoot, normalize(p).replace(/^(\.\.[/\\])+/, ''))
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch { res.writeHead(404); res.end('not found') }
  })
  s.listen(0, '127.0.0.1', () => resolve(s))
})

/**
 * 고양이 프레임 5장. 경계값은 domain/frames.js 의 frameForPhase 가 정한 그대로다.
 * 뜻을 글로만 쓰면 안 지켜져서, 시트에는 치즈냥 실물로 한 줄 보여준다.
 */
const CAT_FRAMES = [
  { label: '① 발사 순간', note: '앞발이 가장 뻗은 순간', phase: 1 },
  { label: '② 되돌아옴', note: '되돌아오는 중', phase: 0.65 },
  { label: '③ 거의 제자리', note: '거의 원래 자세', phase: 0.3 },
  { label: '④ 대기', note: '가장 오래 보이는 칸', phase: 0 },
  { label: '⑤ 자는 중', note: '베개·이불까지 (치즈냥처럼)', phase: 0, idle: true },
]

/** 해충 프레임 3장. 걷기만 한다 — 피격·보호막·왕관은 코드가 그린다. */
const PEST_FRAMES = [
  { label: '걷기 A', note: '다리·꼬리 한쪽', t: Math.PI / 2 / 12 },
  { label: '걷기 B', note: '반대쪽', t: Math.PI * 1.5 / 12 },
  { label: '멈춤', note: '둔화·자장가에 걸렸을 때', t: 0 },
]

/**
 * 새 캐릭터의 성격 — 벡터 도형만 보고는 무엇을 그려야 할지 알 수 없다.
 * 지금 벡터가 무엇을 잘못 그리고 있는지도 함께 적는다(wrong).
 */
const CAT_BRIEF = {
  mackerel: {
    look: '갈색·회색 굵은 세로 줄무늬(고등어 무늬). 날렵한 몸',
    act: '앞발을 크게 휘둘러 할퀸다 — 발톱이 보여야 합니다',
    wrong: '치즈냥과 무늬가 겹치지 않게: 치즈냥은 주황, 이쪽은 회청색',
  },
  bluerussian: {
    noStripe: true,
    look: '줄무늬 없는 균일한 청회색 짧은 털 + 노란 눈',
    act: '털이 서고 앞발·꼬리 끝에서 파란 정전기가 튄다',
    wrong: '같은 장의 고등어냥과 색이 비슷합니다 — 이쪽은 줄무늬가 전혀 없게',
  },
  tuxedo: {
    look: '검은 몸에 흰 가슴·앞발·주둥이(정장처럼)',
    act: '자기는 안 때린다. 앞발을 들어 지휘하듯 — 주변으로 기운이 퍼진다',
    wrong: '기존 검은냥은 온몸이 검습니다. 흰 가슴과 흰 발이 이 고양이의 전부',
  },
  sphynx: {
    noStripe: true,
    look: '털 없는 주름진 분홍베이지 피부, 아주 큰 귀, 가는 몸',
    act: '꼬리를 창처럼 곧게 뒤로 뻗어 쏜다',
    wrong: '털을 그리지 마세요 — 실루엣만으로 구분되는 게 이 고양이의 특징',
  },
}
const PEST_BRIEF = {
  pigeon: { look: '나는 비둘기. 두꺼운 회색 몸 + 흰 날개, 주황 부리',
    wrong: '날개를 편 채로. 기존 박쥐와 겹치지 않게 — 이쪽은 새입니다' },
  fireant: { look: '붉은 개미. 세 마디 몸, 얇은 다리 여섯, 더듬이',
    wrong: '기존 바퀴와 겹치지 않게 — 개미는 허리가 잘록합니다' },
  worm: { look: '분홍 지렁이. 마디진 긴 몸이 구불구불',
    wrong: '다리를 그리지 마세요. 지렁이는 다리도 더듬이도 없습니다' },
  earwig: { look: '초록 집게벌레. 꽁무니의 집게가 특징',
    wrong: '꽁무니의 집게가 한눈에 보이게 — 그게 이 벌레의 전부입니다' },
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 })

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.__catpaw !== undefined, { timeout: 10_000 })
  // 참고로 싣는 그림은 **실물**이어야 한다. 안 기다리면 참고 줄까지 도형으로 나가서
  // 발주서가 통째로 무의미해진다.
  await page.evaluate(() => new Promise((r) => window.__catpaw.__framesets.onFrameSetsReady(r)))
  const artKeys = await page.evaluate(() => window.__catpaw.__framesets.loadedFrameSetKeys())
  if (artKeys.length < 15) throw new Error(`참고용 그림이 ${artKeys.length}장뿐입니다 — 15장이어야 합니다`)

  const made = await page.evaluate((IN) => {
    const { CAT_FRAMES, PEST_FRAMES, CAT_BRIEF, PEST_BRIEF } = IN
    const reg = window.__catpaw.__registry
    const { drawUnit } = window.__catpaw.__framesets

    // 대상은 레지스트리에서 고른다. 하드코딩하면 캐릭터가 늘 때 안 따라온다.
    const newCats = reg.listTowers().filter((t) => !t.frames)
    const oldCats = reg.listTowers().filter((t) => t.frames)
    const newPests = reg.listEnemies().filter((e) => !e.boss && !e.frames)
    const oldPests = reg.listEnemies().filter((e) => !e.boss && e.frames)
    /* 보스 발주 대상.
     *
     * 넷은 2차(칸 396px)로 다시 받았고, 마왕 쥐는 **지금 그림을 그대로 쓰기로
     * 정했다**(화면에서 2.86배로 늘어나지만 사용자가 그대로 가기로 했다).
     * 그래서 지금은 대상이 없다 — 나중에 마음이 바뀌면 KEEP_AS_IS 에서 빼면
     * 발주서가 다시 나온다. */
    const KEEP_AS_IS = ['demonking']
    const bosses = reg.listEnemies().filter((e) => {
      if (!e.boss || KEEP_AS_IS.includes(e.id)) return false
      const fs = e.frames ? reg.getFrameSet(e.frames) : null
      return !fs || fs.w < 300
    })

    /* 화면에서 실제로 필요한 프레임 크기.
     *
     *   그려지는 세로(CSS) = fs.h × hPerR × r / body.h
     *   r = 고양이 tile×0.36 (render.js:500) · 해충 size×tile (render.js:566)
     *
     * 가장 큰 화면이 기준이다 — 태블릿 9칸 격자, tile 88.9 CSS, DPR 2.
     * 그림이 아직 없는 캐릭터는 기존 같은 가족의 평균 비율로 추정한다.   */
    const TILE = 88.9, DPR = 2
    const CAT_DEFAULT = { hPerR: 2.18, bodyFrac: 107 / 169 }
    const PEST_DEFAULT = { hPerR: 2.0, bodyFrac: 0.50 }
    function shape(def, dflt) {
      const fs = def.frames ? reg.getFrameSet(def.frames) : null
      if (!fs || !fs.body) return { ...dflt, measured: false }
      return { hPerR: fs.hPerR ?? 2.18, bodyFrac: fs.body.h / fs.h, measured: true }
    }
    const needPx = (def, isCat) => {
      const s = shape(def, isCat ? CAT_DEFAULT : PEST_DEFAULT)
      const r = isCat ? TILE * 0.36 : def.size * TILE
      return { px: Math.round(s.hPerR * r * DPR / s.bodyFrac), measured: s.measured }
    }
    /** 이 캐릭터를 세로 h 픽셀로 그리려면 넘겨야 하는 r */
    const rFor = (def, h, isCat) => {
      const s = shape(def, isCat ? CAT_DEFAULT : PEST_DEFAULT)
      return h * s.bodyFrac / s.hPerR
    }
    /* 몸이 세로 h 를 채우게 하는 r.
     *
     * rFor 는 '프레임'을 h 로 맞춘다. 그런데 기존 그림은 프레임의 40~63%만 몸이고
     * 나머지는 빈 여백이다(박쥐왕 39.7%) — 그대로 참고로 실으면 "칸을 꽉 채워
     * 그려주세요"라고 써 놓고 칸의 3분의 1만 찬 그림을 보여주는 셈이 된다.
     * 여백은 칸 밖으로 나가게 두고(잘라낸다) 몸을 h 에 맞춘다.                */
    const rBody = (def, h, isCat) => h / shape(def, isCat ? CAT_DEFAULT : PEST_DEFAULT).hPerR
    /** 사각형 안으로 잘라서 그린다 — 몸을 키우면 빈 여백이 칸 밖으로 나간다 */
    function clipped(ctx, x, y, w, h, fn) {
      ctx.save()
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
      fn()
      ctx.restore()
    }

    /** 중심 cy 에 반지름 r 로 그렸을 때 발이 닿는 y. 그림자를 뺀 몸 아래 끝이다. */
    const footY = (def, cy, r) => {
      const fs = def.frames ? reg.getFrameSet(def.frames) : null
      const hPerR = (fs && fs.hPerR) ?? 2.18
      const cyPerR = (fs && fs.cyPerR) ?? 0.07
      return cy + (cyPerR + hPerR / 2) * r
    }

    // ── 공통 그리기 ───────────────────────────────────────────────────────
    const BG = '#3f3f3f'
    function mk(W, H) {
      const cv = document.createElement('canvas')
      cv.width = W; cv.height = H
      const ctx = cv.getContext('2d')
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'left'
      return { cv, ctx }
    }
    const overflow = []
    function say(ctx, s, x, y, size, color, weight = '500', align = 'left', mono = false, max = 0) {
      ctx.textAlign = align
      ctx.fillStyle = color
      ctx.font = `${weight} ${size}px ${mono ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`
      // 캔버스에는 줄바꿈이 없어서 폭이 넘치면 옆 글자와 겹쳐 나간다. 지도 발주서에서
      // 두 번 그랬다 — 눈으로 잡지 말고 재서 걸러낸다.
      if (max > 0 && ctx.measureText(s).width > max) overflow.push(`${Math.round(ctx.measureText(s).width)}>${Math.round(max)}  ${s}`)
      ctx.fillText(s, x, y)
    }
    /** 캔버스에는 줄바꿈이 없다. 폭에 맞춰 손으로 접는다 */
    function wrap(ctx, txt, max) {
      const out = []
      let cur = ''
      for (const w of txt.split(' ')) {
        if (ctx.measureText(cur ? `${cur} ${w}` : w).width > max && cur) { out.push(cur); cur = w }
        else cur = cur ? `${cur} ${w}` : w
      }
      if (cur) out.push(cur)
      return out
    }
    /** 규칙 줄들을 여러 단으로 흘린다. ★ 로 시작하면 노란색 */
    function ruleBlock(ctx, rules, x, y, colW, cols, size, gap) {
      const rows = Math.ceil(rules.length / cols)
      rules.forEach((line, i) => {
        const cx = x + (i / rows | 0) * colW
        const cy = y + (i % rows) * gap
        say(ctx, line, cx, cy, size, line.startsWith('★') ? '#ffd166' : '#c2c2c2',
          line.startsWith('★') ? '700' : '500', 'left', false, colW - size * 0.8)
      })
      return y + rows * gap
    }
    /* 형태 안내 — 얇은 점선 윤곽선.
     *
     * 새 해충 넷은 전부 남의 스프라이트를 빌려 쓴다(비둘기=박쥐, 나머지 셋=바퀴).
     * 그 도형을 칸에 깔면 "지렁이는 다리가 없습니다"라고 아무리 적어도 그림이
     * 이긴다 — 바닥 시트에서 "길을 그리지 마세요"가 무시된 것과 같은 일이다.
     * 그렇다고 칸을 비우면 뭘 그려야 할지 알 수가 없다.
     *
     * 그래서 **완성 그림이 아닌 게 한눈에 보이는 얇은 점선 윤곽**으로 형태와
     * 크기만 알려준다. 시트 안에서 점선 = 안내라는 규칙을 이미 쓰고 있다
     * (발이 닿는 노란 선, 왕관 여백의 파란 선). */
    const SHAPE = {
      pigeon(c, cx, cy, w, h) {
        c.ellipse(cx - w * 0.04, cy, w * 0.30, h * 0.30, 0, 0, Math.PI * 2)          // 몸통
        c.moveTo(cx + w * 0.42, cy - h * 0.20)
        c.ellipse(cx + w * 0.28, cy - h * 0.20, w * 0.14, h * 0.16, 0, 0, Math.PI * 2) // 머리
        c.moveTo(cx + w * 0.42, cy - h * 0.20)
        c.lineTo(cx + w * 0.52, cy - h * 0.16)
        c.lineTo(cx + w * 0.42, cy - h * 0.12)                                        // 부리
        c.moveTo(cx - w * 0.20, cy - h * 0.10)
        c.quadraticCurveTo(cx, cy - h * 0.52, cx + w * 0.14, cy - h * 0.06)            // 편 날개
        c.moveTo(cx - w * 0.34, cy + h * 0.02)
        c.lineTo(cx - w * 0.50, cy + h * 0.16)                                         // 꼬리
      },
      fireant(c, cx, cy, w, h) {
        const seg = [[-0.26, 0.30], [0.02, 0.20], [0.28, 0.17]]                        // 배·가슴·머리
        for (const [dx, rr] of seg) {
          c.moveTo(cx + w * dx + w * rr * 0.5, cy)
          c.ellipse(cx + w * dx, cy, w * rr * 0.5, h * rr * 0.62, 0, 0, Math.PI * 2)
        }
        for (let i = 0; i < 3; i += 1) {                                               // 다리 여섯
          const bx = cx + w * (-0.04 + i * 0.10)
          c.moveTo(bx, cy); c.lineTo(bx - w * 0.10, cy + h * 0.40)
          c.moveTo(bx, cy); c.lineTo(bx - w * 0.06, cy - h * 0.40)
        }
        c.moveTo(cx + w * 0.34, cy - h * 0.08)                                         // 더듬이
        c.quadraticCurveTo(cx + w * 0.46, cy - h * 0.34, cx + w * 0.54, cy - h * 0.22)
      },
      worm(c, cx, cy, w, h) {
        // 다리도 더듬이도 없다. 마디만 있는 굵은 곡선 하나.
        const y0 = cy + h * 0.06
        c.moveTo(cx - w * 0.46, y0)
        c.bezierCurveTo(cx - w * 0.22, y0 - h * 0.34, cx + w * 0.10, y0 + h * 0.30, cx + w * 0.44, y0 - h * 0.14)
        c.moveTo(cx - w * 0.46, y0 + h * 0.20)
        c.bezierCurveTo(cx - w * 0.22, y0 - h * 0.14, cx + w * 0.10, y0 + h * 0.50, cx + w * 0.44, y0 + h * 0.06)
        for (let i = 1; i < 6; i += 1) {                                               // 마디 금
          const t = i / 6
          const mx = cx + w * (-0.46 + 0.90 * t)
          c.moveTo(mx, y0 + h * (0.02 + 0.14 * Math.sin(t * 3)))
          c.lineTo(mx, y0 + h * (0.20 + 0.14 * Math.sin(t * 3)))
        }
      },
      earwig(c, cx, cy, w, h) {
        c.moveTo(cx + w * 0.14, cy)
        c.ellipse(cx - w * 0.06, cy, w * 0.32, h * 0.22, 0, 0, Math.PI * 2)            // 긴 몸
        c.moveTo(cx + w * 0.40, cy)
        c.ellipse(cx + w * 0.30, cy, w * 0.10, h * 0.15, 0, 0, Math.PI * 2)            // 머리
        c.moveTo(cx + w * 0.38, cy - h * 0.10)
        c.lineTo(cx + w * 0.52, cy - h * 0.28)                                          // 더듬이
        for (const sgn of [-1, 1]) {                                                    // 꽁무니 집게
          c.moveTo(cx - w * 0.38, cy + sgn * h * 0.06)
          c.quadraticCurveTo(cx - w * 0.56, cy + sgn * h * 0.30, cx - w * 0.62, cy + sgn * h * 0.04)
        }
        for (let i = 0; i < 3; i += 1) {
          const bx = cx + w * (-0.16 + i * 0.12)
          c.moveTo(bx, cy + h * 0.16); c.lineTo(bx - w * 0.08, cy + h * 0.40)
        }
      },
    }

    /** 형태와 크기 안내. 칸을 비워 두면 뭘 그릴지 알 수 없고, 남의 도형을 깔면 그게 주문이 된다. */
    function sizeGuide(ctx, id, x, top, CELL, groundY) {
      const w = CELL * 0.72, h = CELL * 0.50
      const cx = x + CELL / 2, cy = groundY - h * 0.52
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'
      ctx.lineWidth = Math.max(1, CELL * 0.005)
      ctx.setLineDash([11, 9])
      ctx.strokeRect(cx - w / 2, groundY - h, w, h)
      const draw = SHAPE[id]
      if (draw) {
        ctx.strokeStyle = 'rgba(255,255,255,0.46)'
        ctx.lineWidth = Math.max(1.5, CELL * 0.009)
        ctx.setLineDash([9, 7])
        ctx.beginPath()
        draw(ctx, cx, cy, w, h)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.restore()
    }

    /** 칸 테두리 + 발이 닿는 선 (+ 엘리트 왕관 여백) */
    function cellFrame(ctx, x, y, CELL, groundY, crownY) {
      ctx.strokeStyle = 'rgba(255,255,255,0.20)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 6.5, y + 6.5, CELL - 13, CELL - 13)
      ctx.strokeStyle = 'rgba(255,209,102,0.42)'
      ctx.setLineDash([9, 9])
      ctx.beginPath(); ctx.moveTo(x + 12, groundY); ctx.lineTo(x + CELL - 12, groundY); ctx.stroke()
      if (crownY) {
        ctx.strokeStyle = 'rgba(140,200,255,0.34)'
        ctx.setLineDash([5, 9])
        ctx.beginPath(); ctx.moveTo(x + 12, crownY); ctx.lineTo(x + CELL - 12, crownY); ctx.stroke()
      }
      ctx.setLineDash([])
    }
    /** 격자가 시트에서 차지하는 넓이 비율 → 돌아올 셀 크기 예측 */
    const predict = (W, H, cols, rows, CELL) => {
      const f = (cols * CELL * rows * CELL) / (W * H)
      return { f: +f.toFixed(3), cell: Math.round(Math.sqrt(1.05e6 * f / (cols * rows))) }
    }

    /* 지난 사고 목록에서 뽑은 문구. tools/slice-sheet.mjs 의 설정 주석이 사고 기록이다.
     * 어느 시트에나 들어간다.                                                     */
    const COMMON = [
      '★ 배경은 완전한 단색 회색. 후광·빛번짐·그라디언트를 넣지 마세요',
      '★ 칸 안에 숫자·글씨를 절대 넣지 마세요',
      '   지난번에 1~5 번호와 영어 설명이 칸 안에 들어왔습니다',
      '★ 칸을 꽉 채워 그려주세요. 작게 그리면 화면에서 그만큼 흐려집니다',
      '전부 오른쪽을 보게. 왼쪽으로 갈 때는 코드가 좌우로 뒤집습니다',
      '칸마다 몸 크기와 발 높이를 똑같이 (노란 점선이 발이 닿는 높이)',
    ]
    // 피격 번쩍임·보호막·광폭화 고리는 적에게만 붙는다. 고양이 시트에 적으면
    // 있지도 않은 효과를 그리지 말라고 하는 셈이라 혼란만 준다.
    const PEST_ONLY = ['피격 번쩍임 · 보호막 · 광폭화 고리는 코드가 그립니다 — 그리지 마세요']

    // ── 고양이 시트 (2마리 × 5프레임) ─────────────────────────────────────
    function catSheet(pair, no, total) {
      const CELL = 330, PAD = 22, COLS = CAT_FRAMES.length
      const W = PAD * 2 + CELL * COLS
      const S = W / 1158                       // 지난 시트에서 읽히던 글씨 크기 기준
      const u = (n) => Math.round(n * S)

      const rules = [
        `★ 결과는 ${pair.length}행 × ${COLS}열, 총 ${pair.length * COLS}칸짜리 한 장입니다`,
        '★ 오른쪽 위와 치즈냥 띠는 이미 있는 그림 — 다시 그리지 마세요',
        '★ 앞을 보고 앉은 자세. 머리가 크고 몸이 둥근 비율 — 오른쪽 고양이들 그대로',
        '★ 옆으로 서 있는 사실적인 고양이로 그리지 마세요 (지난번에 그렇게 왔습니다)',
        '★ 다섯 칸은 한 마리의 연속 동작입니다. 같은 고양이여야 합니다',
        '★ 가능한 한 크게 — 칸 하나가 250×250px 이상이면 가장 좋습니다',
        ...COMMON,
        '바닥 그림자는 그림에 포함해 주세요 (기존 다섯 마리가 그렇습니다)',
      ]
      const RULE_COLS = 2
      const hRules = Math.ceil(rules.length / RULE_COLS) * u(27)
      // 제목과 화풍 참고를 같은 줄에 나란히 둔다. 위아래로 쌓으면 머리가 무거워져
      // 격자 비율(f)이 떨어지고, 그만큼 돌아올 그림이 작아진다.
      // 그림이 붙을수록 참고 고양이가 늘어난다(5 → 7 → 9). 오른쪽 절반을 넘지 않게
      // 크기를 줄여서 제목·부제를 덮지 않도록 한다 — 실제로 덮은 적이 있다.
      const refH = Math.round(Math.min(u(84), (W * 0.50) / (oldCats.length * 1.16)))
      const refPitch = refH * 1.16
      const refX = W - PAD - oldCats.length * refPitch
      const hTop = Math.max(u(40) + u(26), u(20) + refH)
      const hBand = u(26) + Math.round(CELL * 0.40) + u(48)
      const HEAD = PAD + hTop + u(18) + hRules + u(18) + hBand + u(50)
      const ROWLAB = u(42)
      const H = HEAD + pair.length * (ROWLAB + CELL) + PAD
      const { cv, ctx } = mk(W, H)

      let y = PAD + u(32)
      say(ctx, `고양이 그림 발주서 ${no}/${total} — ${pair.map((c) => c.name).join(' · ')}`, PAD, y, u(26), '#ffffff', '700')
      y += u(26)
      say(ctx, `이 ${pair.length}마리만 그림이 없어 도형으로 나옵니다. 오른쪽과 같은 화풍으로.`,
        PAD, y, u(15), '#c9c9c9', '600', 'left', false, refX - PAD - u(20))

      // 화풍 참고 — 기존 고양이들 실물. 오른쪽 끝에 붙인다.
      say(ctx, '이 화풍으로 (이미 있는 그림 · 다시 그리지 마세요)', W - PAD, PAD + u(24), u(14), '#8fd6b4', '700', 'right')
      oldCats.forEach((def, i) => {
        const bx = refX + refPitch * i
        clipped(ctx, bx, PAD + u(30), refPitch, refH + u(8), () => {
          drawUnit(ctx, def, {
            x: bx + refPitch * 0.5, y: PAD + u(34) + refH * 0.5,
            r: rBody(def, refH * 0.94, true), angle: 0, frame: 3, t: 0, seed: i,
          })
        })
      })
      y = PAD + hTop + u(18)

      y = ruleBlock(ctx, rules, PAD, y, (W - PAD * 2) / RULE_COLS, RULE_COLS, u(15), u(27)) + u(18)

      // 프레임 다섯 칸의 뜻 — 치즈냥 실물로 보여준다. 말로만 쓰면 안 지켜졌다.
      say(ctx, '다섯 칸의 뜻  (치즈냥의 실제 그림입니다)', PAD, y, u(15), '#8fd6b4', '700')
      y += u(12)
      const bandH = Math.round(CELL * 0.40)
      const demo = oldCats[0]
      CAT_FRAMES.forEach((f, i) => {
        const x = PAD + CELL * i
        ctx.fillStyle = 'rgba(0,0,0,0.16)'
        ctx.fillRect(x + 4, y, CELL - 8, bandH)
        clipped(ctx, x + 4, y, CELL - 8, bandH, () => {
          drawUnit(ctx, demo, {
            x: x + CELL / 2, y: y + bandH * 0.50, r: rBody(demo, bandH * 0.84, true),
            angle: 0, frame: i, t: 0, seed: 1,
          })
        })
        say(ctx, f.label, x + CELL / 2, y + bandH + u(20), u(17), '#ffffff', '700', 'center', false, CELL - u(16))
        say(ctx, f.note, x + CELL / 2, y + bandH + u(38), u(13), '#9a9a9a', '500', 'center', false, CELL - u(16))
      })
      y += bandH + u(48)

      // 여기부터가 격자다 — 굵은 선으로 확실히 가른다
      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = Math.max(2, u(3))
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
      say(ctx, `↓ 여기부터가 그려야 할 격자입니다 — ${pair.length}행 × ${COLS}열 = ${pair.length * COLS}칸`,
        PAD, y + u(26), u(17), '#ffd166', '700')
      y += u(54)

      pair.forEach((def, row) => {
        const top = y + row * (ROWLAB + CELL)
        const b = CAT_BRIEF[def.id] || {}
        const need = needPx(def, true)
        say(ctx, def.name, PAD, top + u(20), u(20), '#ffffff', '700')
        const nameW = ctx.measureText(def.name).width
        say(ctx, `${b.look || ''} · ${b.act || ''}`, PAD + nameW + u(14), top + u(20), u(14), '#e2c9a0', '600',
          'left', false, W - PAD * 2 - nameW - u(14))
        say(ctx, `${b.wrong || ''}`, PAD, top + u(39), u(13), '#ff9f9f', '500', 'left', false, W * 0.62)
        say(ctx, `art/cat-${def.id}.png · 화면 최대 ${need.px}px${need.measured ? '' : ' (추정)'}`,
          W - PAD, top + u(39), u(12), '#8a8a8a', '600', 'right', true)

        CAT_FRAMES.forEach((f, col) => {
          const x = PAD + CELL * col
          const cy = top + ROWLAB + CELL * 0.50
          const r = CELL * 0.30
          cellFrame(ctx, x, top + ROWLAB, CELL, footY(def, cy, r), 0)
          ctx.save()
          ctx.globalAlpha = 0.85           // 지금 도형 — 자리와 크기만 보여주는 밑그림
          // pose 를 지우고 몸만 그린다. 새 고양이의 pose 는 남의 것을 빌린 것이라
          // (고등어냥은 검은냥의 칼, 러시안블루냥은 샴냥의 눈빛) 그대로 깔면
          // 칼과 눈빛을 그려 달라고 주문하는 셈이 된다. 동작은 글과 치즈냥 예시가 말한다.
          // 줄무늬 없는 고양이는 밑그림에서도 줄무늬를 지운다. 글로 "줄무늬가 전혀
          // 없게"라고 써 놓고 줄무늬를 깔면 그림이 이긴다.
          const pal = b.noStripe ? { ...def.palette, stripe: def.palette.fur } : def.palette
          drawUnit(ctx, { ...def, pose: null }, {
            x: x + CELL / 2, y: cy, r, angle: 0, phase: f.phase, idle: !!f.idle, t: 0, seed: row + 2,
            palette: pal,
          })
          ctx.restore()
        })
      })

      const p = predict(W, H, COLS, pair.length, CELL)
      return { w: W, h: H, ...p, data: cv.toDataURL('image/png') }
    }

    // ── 해충 시트 (4종 × 3프레임) ─────────────────────────────────────────
    function pestSheet(list) {
      const CELL = 380, PAD = 22, COLS = PEST_FRAMES.length
      const W = PAD * 2 + CELL * COLS
      const S = W / 1158
      const u = (n) => Math.round(n * S)

      const rules = [
        `★ 결과는 ${list.length}행 × ${COLS}열, 총 ${list.length * COLS}칸짜리 한 장입니다`,
        '★ 맨 위 한 줄은 이미 있는 그림 — 다시 그리지 마세요',
        '★ 칸 안 점선은 형태·크기 안내입니다. 그 정도 크기로, 채색 일러스트로',
        '★ 위쪽 12%(파란 점선)는 비워둘 것 — 금색 왕관을 코드가 얹습니다',
        '★ 가능한 한 크게 — 칸 하나가 240×240px 이상이면 가장 좋습니다',
        ...COMMON, ...PEST_ONLY,
        '바닥 그림자는 그림에 포함해 주세요 (기존 다섯 종이 그렇습니다)',
      ]
      const RULE_COLS = 2
      const hRules = Math.ceil(rules.length / RULE_COLS) * u(26)
      const hStyle = u(26) + u(128)
      const HEAD = PAD + u(38) + u(26) + u(16) + hStyle + u(20) + hRules + u(20) + u(56) + u(52)
      const ROWLAB = u(46)
      const H = HEAD + list.length * (ROWLAB + CELL) + PAD
      const { cv, ctx } = mk(W, H)

      let y = PAD + u(32)
      say(ctx, '해충 그림 발주서 — 새 4종', PAD, y, u(27), '#ffffff', '700')
      y += u(26)
      say(ctx, '이 넷은 아직 그림이 없습니다. 아래 다섯 종과 같은 화풍으로 그려주세요.',
        PAD, y, u(15), '#c9c9c9', '600')

      y += u(16) + u(22)
      say(ctx, '이 화풍으로  (이미 있는 그림 · 다시 그리지 마세요)', PAD, y, u(14), '#8fd6b4', '700')
      y += u(10)
      const refH = u(120)
      const refPitch = (W - PAD * 2) / oldPests.length
      oldPests.forEach((def, i) => {
        const cx = PAD + refPitch * (i + 0.5)
        clipped(ctx, PAD + refPitch * i, y, refPitch, refH, () => {
          drawUnit(ctx, def, {
            x: cx, y: y + refH * 0.5, r: rBody(def, refH * 0.88, false),
            angle: 0, frame: 0, t: 0, seed: i,
          })
        })
        say(ctx, def.name, cx, y + refH + u(15), u(13), '#9a9a9a', '600', 'center', false, refPitch - u(8))
      })
      y += refH + u(26)

      y = ruleBlock(ctx, rules, PAD, y + u(18), (W - PAD * 2) / RULE_COLS, RULE_COLS, u(14), u(26)) + u(18)

      ctx.strokeStyle = '#ffd166'
      ctx.lineWidth = Math.max(2, u(3))
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
      say(ctx, `↓ 여기부터가 그려야 할 격자입니다 — ${list.length}행 × ${COLS}열 = ${list.length * COLS}칸`,
        PAD, y + u(26), u(17), '#ffd166', '700')
      y += u(52)

      PEST_FRAMES.forEach((f, i) => {
        say(ctx, f.label, PAD + CELL * i + CELL / 2, y + u(20), u(19), '#e6e6e6', '700', 'center', false, CELL - u(16))
        say(ctx, f.note, PAD + CELL * i + CELL / 2, y + u(38), u(13), '#9a9a9a', '500', 'center', false, CELL - u(16))
      })
      y += u(56)

      list.forEach((def, row) => {
        const top = y + row * (ROWLAB + CELL)
        const b = PEST_BRIEF[def.id] || {}
        const need = needPx(def, false)
        say(ctx, def.name, PAD, top + u(20), u(20), '#ffffff', '700')
        const nameW = ctx.measureText(def.name).width
        say(ctx, b.look || '', PAD + nameW + u(14), top + u(20), u(14), '#e2c9a0', '600',
          'left', false, W - PAD * 2 - nameW - u(14))
        say(ctx, b.wrong || '', PAD, top + u(39), u(13), '#ff9f9f', '500', 'left', false, W * 0.58)
        say(ctx, `art/enemy-${def.id}.png · 화면 최대 ${need.px}px${need.measured ? '' : ' (추정)'}`,
          W - PAD, top + u(39), u(12), '#8a8a8a', '600', 'right', true)

        PEST_FRAMES.forEach((f, col) => {
          const x = PAD + CELL * col
          const cy = top + ROWLAB + CELL * 0.52
          const r = CELL * 0.28
          const groundY = footY(def, cy, r)
          cellFrame(ctx, x, top + ROWLAB, CELL, groundY, top + ROWLAB + CELL * 0.12)
          // 지금 도형은 남의 것을 빌린 것이라 깔지 않는다. 크기만 알려준다.
          sizeGuide(ctx, def.id, x, top + ROWLAB, CELL, groundY)
        })
      })

      const p = predict(W, H, COLS, list.length, CELL)
      return { w: W, h: H, ...p, data: cv.toDataURL('image/png') }
    }

    // ── 보스 시트 (한 마리당 한 장 · 3프레임) ─────────────────────────────
    //
    // 빈 칸을 주지 않는다. 지금 그림을 크게 깔고 "이대로 더 선명하게"라고 한다.
    // 새로 그리는 게 아니라 같은 그림의 고해상도판을 받는 것이라 이게 가장
    // 정확한 지시이고, 참고 행을 따로 안 두니 격자 비율(f)도 가장 높다.
    function bossSheet(def) {
      const CELL = 520, PAD = 22, COLS = PEST_FRAMES.length
      const W = PAD * 2 + CELL * COLS
      const S = W / 1158
      const u = (n) => Math.round(n * S)
      const need = needPx(def, false)
      const rules = [
        `★ 결과는 1행 × ${COLS}열, 총 ${COLS}칸짜리 한 장입니다. ${def.name} 한 마리만`,
        '★ 칸 안 그림이 지금 쓰는 그림입니다. 같은 자세 그대로 더 크고 선명하게',
        `★ 지금 원본은 209px 뿐이라 화면에서 ${need.px}px 로 늘어나 흐립니다`,
        '★ 가능한 한 크게 — 칸 하나가 460px 이상이면 가장 좋습니다',
        '★ 바닥 그림자를 그리지 마세요 — 보스만은 코드가 그립니다',
        '★ 왕관·뿔·장신구는 그림에 포함해 주세요 (보스는 코드가 왕관을 안 얹습니다)',
        ...COMMON, ...PEST_ONLY,
      ]
      const RULE_COLS = 2
      const hRules = Math.ceil(rules.length / RULE_COLS) * u(27)
      const HEAD = PAD + u(38) + u(26) + u(20) + hRules + u(22) + u(56)
      const H = HEAD + CELL + PAD + u(10)
      const { cv, ctx } = mk(W, H)

      let y = PAD + u(32)
      say(ctx, `보스 그림 발주서 — ${def.name} (한 마리만)`, PAD, y, u(27), '#ffffff', '700')
      y += u(26)
      say(ctx, `${def.desc}`, PAD, y, u(15), '#c9c9c9', '600')
      y = ruleBlock(ctx, rules, PAD, y + u(24), (W - PAD * 2) / RULE_COLS, RULE_COLS, u(15), u(27)) + u(22)

      PEST_FRAMES.forEach((f, i) => {
        say(ctx, f.label, PAD + CELL * i + CELL / 2, y + u(20), u(19), '#e6e6e6', '700', 'center')
        say(ctx, f.note, PAD + CELL * i + CELL / 2, y + u(38), u(13), '#9a9a9a', '500', 'center')
      })
      y += u(56)

      // 그림자를 잠시 떼어 놓고 그린다. 이 시트만의 일이라 그린 뒤 되돌린다.
      const fs = reg.getFrameSet(def.frames)
      const keepShadow = fs && fs.shadow
      if (fs) delete fs.shadow
      PEST_FRAMES.forEach((f, col) => {
        const x = PAD + CELL * col
        const cy = y + CELL * 0.48
        // 지금 그림의 '몸'을 칸의 72%로 늘려 깐다. 빈 여백은 칸 밖으로 나가 잘린다.
        // 흐린 게 그대로 보이는 것이 이 시트의 요점이다.
        const r = rBody(def, CELL * 0.66, false)
        cellFrame(ctx, x, y, CELL, footY(def, cy, r), 0)
        clipped(ctx, x + 7, y + 7, CELL - 14, CELL - 14, () => {
          drawUnit(ctx, def, { x: x + CELL / 2, y: cy, r, angle: 0, t: f.t, seed: 5, flying: def.flying })
        })
      })
      if (fs && keepShadow) fs.shadow = keepShadow

      const p = predict(W, H, COLS, 1, CELL)
      return { w: W, h: H, ...p, data: cv.toDataURL('image/png') }
    }

    const pairs = []
    for (let i = 0; i < newCats.length; i += 2) pairs.push(newCats.slice(i, i + 2))
    const boss = {}
    for (const b of bosses) boss[b.id] = bossSheet(b)

    return {
      cats: pairs.map((p, i) => catSheet(p, i + 1, pairs.length)),
      pests: newPests.length > 0 ? pestSheet(newPests) : null,
      boss,
      counts: {
        newCats: newCats.map((c) => c.name), newPests: newPests.map((c) => c.name),
        pestSheet: newPests.length > 0,
        bosses: bosses.map((b) => b.id),
      },
      overflow,
    }
  }, { CAT_FRAMES, PEST_FRAMES, CAT_BRIEF, PEST_BRIEF })

  const save = async (name, o) => {
    await writeFile(join(outDir, name), Buffer.from(o.data.split(',')[1], 'base64'))
    console.log(`  ${name.padEnd(30)} ${String(o.w).padStart(5)}×${String(o.h).padStart(5)}` +
      `   격자비율 f=${o.f}   예상 셀 ${o.cell}px`)
  }

  if (made.overflow.length > 0) {
    console.error('■ 칸 밖으로 넘치는 글씨 — 문구를 줄이세요')
    for (const o of made.overflow) console.error('  ' + o)
    throw new Error(`글씨 ${made.overflow.length}줄이 폭을 넘습니다`)
  }
  console.log(`참고용 실물 그림 ${artKeys.length}장 · 새 고양이 ${made.counts.newCats.join('·')}` +
    ` · 새 해충 ${made.counts.newPests.join('·')}`)
  console.log('\n■ 보내는 순서')
  for (let i = 0; i < made.cats.length; i += 1) await save(`23-art-cats-${i + 1}.png`, made.cats[i])
  if (made.pests) await save('23-art-pests.png', made.pests)
  else console.log('  해충 4종은 그림이 다 붙어서 발주서를 만들지 않았습니다')
  for (const id of made.counts.bosses) await save(`23-art-boss-${id}.png`, made.boss[id])
} finally {
  await browser.close()
  server.close()
}
