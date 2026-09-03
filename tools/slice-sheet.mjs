/**
 * 포즈 시트를 프레임 스트립 PNG 로 굽는다.
 *
 * 사용자가 준 그림(art-src/pose-sheet-cats.png)은 5×5 격자에 고양이 5마리 ×
 * 프레임 5장이 한 장으로 들어 있고 **알파 채널이 없다**(colortype 2, 회색 배경이
 * 박혀 있음). 게임에서 쓰려면 잘라내고 배경을 파내야 한다.
 *
 * ImageMagick·PIL·ffmpeg 바이너리가 이 환경에 없다. Chromium 은 있어서
 * tools/screenshot.mjs 와 같은 방식으로 Playwright + canvas 로 픽셀을 다룬다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/slice-sheet.mjs
 *
 * 결과물
 *   web/art/cat-*.png        845×169 (프레임 5장 가로 스트립) × 5마리
 *   tools/out/14-slice-check.png   체커보드에 얹은 확인용 격자
 *
 * 알파가 있는 원본이 오면 --keep-alpha 로 키잉을 건너뛴다.
 */
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'tools/out')
const artDir = join(root, 'web/art')
mkdirSync(outDir, { recursive: true })
mkdirSync(artDir, { recursive: true })

const keepAlpha = process.argv.includes('--keep-alpha')
const srcPath = join(root, 'art-src/pose-sheet-cats.png')

/* ── 실측한 격자 (tools 로 배경 대비 밝은 테두리선의 열/행 프로파일 피크를 잡았다) ──
 * 1092×976, 셀 171×171, 셀 간격 11~12px.
 * COLS/ROWS 는 테두리선 자체의 좌표라서 +1 부터가 셀 내부다.                        */
const COLS = [185, 368, 550, 733, 915]
const ROWS = [69, 251, 434, 617, 799]
const SIZE = 169

/** 행 순서는 시트에 적힌 이름 순서 그대로 — 치즈냥 · 삼색냥 · 샴냥 · 검은냥 · 뚱냥 */
const ROW_KEYS = ['cat-cheese', 'cat-calico', 'cat-siamese', 'cat-black', 'cat-chonk']

const b64 = (await readFile(srcPath)).toString('base64')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

try {
  await page.goto('about:blank')
  const result = await page.evaluate(async (args) => {
    const { b64, COLS, ROWS, SIZE, ROW_KEYS, keepAlpha } = args

    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()

    const sheet = document.createElement('canvas')
    sheet.width = img.naturalWidth
    sheet.height = img.naturalHeight
    const sctx = sheet.getContext('2d', { willReadFrequently: true })
    sctx.drawImage(img, 0, 0)
    const src = sctx.getImageData(0, 0, sheet.width, sheet.height)

    /* 배경을 파내는 4단계.
     *
     * 단순 임계값 키잉은 안 된다. 배경 회색이 평탄하지 않고(외곽 60 / 셀 안 68,
     * 노이즈 ±2), 하필 뚱냥의 회색 먼지와 잔상이 배경 회색과 가깝다. 임계값을
     * 올리면 먼지가 사라지고, 내리면 테두리에 회색 띠가 남는다.
     *
     * 그래서 "값"이 아니라 "위치"로 판단한다. 프레임 가장자리에서 flood fill 로
     * 배경과 이어진 영역만 배경으로 확정하고, 이어지지 않은 배경색 픽셀
     * (= 실루엣 안쪽의 먼지·잔상)은 그대로 남긴다. 이게 핵심이다.               */
    const RING = 3      // 테두리선을 확실히 지우는 폭 (2 로는 선의 안티에일리어싱이 남았다)
    const LO = 6        // 노이즈 바닥. 이하는 완전 투명
    const FILL_T = 14   // 이 차이를 넘으면 flood fill 이 통과하지 못한다

    function keyCell(x0, y0) {
      const N = SIZE * SIZE
      const out = new Uint8ClampedArray(N * 4)
      const at = (i, j) => ((y0 + j) * src.width + (x0 + i)) * 4

      // 1단계 — 셀별 지역 배경. 테두리선 안쪽 링(inset 3..7)의 채널별 중앙값.
      const samples = [[], [], []]
      for (let j = 3; j < SIZE - 3; j++) {
        for (let i = 3; i < SIZE - 3; i++) {
          if (i > 7 && i < SIZE - 8 && j > 7 && j < SIZE - 8) continue
          const k = at(i, j)
          samples[0].push(src.data[k])
          samples[1].push(src.data[k + 1])
          samples[2].push(src.data[k + 2])
        }
      }
      const bg = samples.map((s) => {
        s.sort((a, b) => a - b)
        return s[s.length >> 1]
      })

      // 2단계 — 배경과의 차이
      const diff = new Uint8ClampedArray(N)
      for (let j = 0; j < SIZE; j++) {
        for (let i = 0; i < SIZE; i++) {
          const k = at(i, j)
          diff[j * SIZE + i] = Math.max(
            Math.abs(src.data[k] - bg[0]),
            Math.abs(src.data[k + 1] - bg[1]),
            Math.abs(src.data[k + 2] - bg[2]),
          )
        }
      }

      // 3단계 — 가장자리에서 flood fill. 닿은 곳만 "확실한 배경".
      const outside = new Uint8Array(N)
      const queue = new Int32Array(N)
      let head = 0, tail = 0
      const push = (p) => { if (!outside[p]) { outside[p] = 1; queue[tail++] = p } }
      const spread = () => {
        while (head < tail) {
          const p = queue[head++]
          const i = p % SIZE, j = (p - i) / SIZE
          if (i > 0 && diff[p - 1] < FILL_T) push(p - 1)
          if (i < SIZE - 1 && diff[p + 1] < FILL_T) push(p + 1)
          if (j > 0 && diff[p - SIZE] < FILL_T) push(p - SIZE)
          if (j < SIZE - 1 && diff[p + SIZE] < FILL_T) push(p + SIZE)
        }
      }
      for (let j = 0; j < SIZE; j++) {
        for (let i = 0; i < SIZE; i++) {
          if (i < RING || j < RING || i >= SIZE - RING || j >= SIZE - RING) push(j * SIZE + i)
        }
      }
      spread()

      // 그림에 둘러싸여 가장자리와 안 이어진 배경도 있다 — 삼색냥의 룬 원 안쪽이
      // 그렇다. 그냥 두면 불투명한 검은 원반으로 남는다(실제로 그렇게 나왔다).
      // 그렇다고 '배경값과 같은 픽셀'을 전부 배경으로 치면 검은냥의 회색 털
      // 하이라이트까지 뚫려 몸에 구멍이 생긴다(이것도 실제로 겪었다).
      // 그래서 배경값과 같은 픽셀 중 **넓게 뭉친 덩어리**만 배경으로 인정한다.
      const MIN_HOLE = 200
      const seen = new Uint8Array(N)
      const blob = new Int32Array(N)
      for (let start = 0; start < N; start++) {
        if (outside[start] || seen[start] || diff[start] > LO) continue
        let bh = 0, bt = 0
        seen[start] = 1
        blob[bt++] = start
        while (bh < bt) {
          const p = blob[bh++]
          const i = p % SIZE, j = (p - i) / SIZE
          const near = (q) => { if (!seen[q] && !outside[q] && diff[q] <= LO) { seen[q] = 1; blob[bt++] = q } }
          if (i > 0) near(p - 1)
          if (i < SIZE - 1) near(p + 1)
          if (j > 0) near(p - SIZE)
          if (j < SIZE - 1) near(p + SIZE)
        }
        if (bt >= MIN_HOLE) {
          for (let k = 0; k < bt; k++) push(blob[k])
          spread()
        }
      }

      // 4단계 — 알파를 정하고 언프리멀티플라이해서 회색 띠를 뺀다.
      let opaque = 0, soft = 0, edgeTouch = 0
      let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1
      for (let j = 0; j < SIZE; j++) {
        for (let i = 0; i < SIZE; i++) {
          const p = j * SIZE + i
          const k = at(i, j), o = p * 4
          const forced = i < RING || j < RING || i >= SIZE - RING || j >= SIZE - RING
          let a
          if (forced) a = 0
          else if (!outside[p]) a = 1                                   // 실루엣 안쪽
          else a = Math.min(1, Math.max(0, (diff[p] - LO) / (FILL_T - LO)))

          if (a <= 0) { out[o + 3] = 0; continue }
          for (let c = 0; c < 3; c++) {
            out[o + c] = a >= 1 ? src.data[k + c]
              : bg[c] + (src.data[k + c] - bg[c]) / a
          }
          out[o + 3] = Math.round(a * 255)
          if (a >= 1) opaque++; else soft++
          if (i < minX) minX = i
          if (j < minY) minY = j
          if (i > maxX) maxX = i
          if (j > maxY) maxY = j
          if (i <= RING + 1 || j <= RING + 1 || i >= SIZE - RING - 2 || j >= SIZE - RING - 2) edgeTouch++
        }
      }
      return { out, bg, opaque, soft, edgeTouch, box: [minX, minY, maxX, maxY] }
    }

    function rawCell(x0, y0) {
      const N = SIZE * SIZE
      const out = new Uint8ClampedArray(N * 4)
      for (let j = 0; j < SIZE; j++) {
        for (let i = 0; i < SIZE; i++) {
          const k = ((y0 + j) * src.width + (x0 + i)) * 4, o = (j * SIZE + i) * 4
          out[o] = src.data[k]; out[o + 1] = src.data[k + 1]
          out[o + 2] = src.data[k + 2]; out[o + 3] = src.data[k + 3]
        }
      }
      return { out, bg: [0, 0, 0], opaque: N, soft: 0, edgeTouch: 0, box: [0, 0, SIZE - 1, SIZE - 1] }
    }

    // 확인용 체커보드 격자
    const chk = document.createElement('canvas')
    chk.width = SIZE * COLS.length
    chk.height = SIZE * ROWS.length
    const cctx = chk.getContext('2d')
    for (let y = 0; y < chk.height; y += 12) {
      for (let x = 0; x < chk.width; x += 12) {
        cctx.fillStyle = ((x / 12 + y / 12) | 0) % 2 ? '#c8cdd6' : '#8f96a3'
        cctx.fillRect(x, y, 12, 12)
      }
    }

    const strips = [], report = []
    for (let row = 0; row < ROWS.length; row++) {
      const strip = document.createElement('canvas')
      strip.width = SIZE * COLS.length
      strip.height = SIZE
      const tctx = strip.getContext('2d')
      for (let col = 0; col < COLS.length; col++) {
        const cell = keepAlpha
          ? rawCell(COLS[col] + 1, ROWS[row] + 1)
          : keyCell(COLS[col] + 1, ROWS[row] + 1)
        const id = new ImageData(cell.out, SIZE, SIZE)
        tctx.putImageData(id, SIZE * col, 0)
        cctx.putImageData(id, SIZE * col, SIZE * row)   // 체커보드 위에는 합성해야 한다
        report.push({
          key: ROW_KEYS[row], frame: col, bg: cell.bg.join('/'),
          opaquePct: +(cell.opaque / (SIZE * SIZE) * 100).toFixed(1),
          softPct: +(cell.soft / (SIZE * SIZE) * 100).toFixed(1),
          edgeTouch: cell.edgeTouch, box: cell.box.join(','),
        })
      }
      strips.push({ key: ROW_KEYS[row], data: strip.toDataURL('image/png') })
    }

    // putImageData 는 합성하지 않고 덮어쓴다 → 체커보드가 지워졌다. 다시 그린다.
    const chk2 = document.createElement('canvas')
    chk2.width = chk.width; chk2.height = chk.height
    const c2 = chk2.getContext('2d')
    for (let y = 0; y < chk2.height; y += 12) {
      for (let x = 0; x < chk2.width; x += 12) {
        c2.fillStyle = ((x / 12 + y / 12) | 0) % 2 ? '#c8cdd6' : '#8f96a3'
        c2.fillRect(x, y, 12, 12)
      }
    }
    for (let row = 0; row < strips.length; row++) {
      const im = new Image()
      im.src = strips[row].data
      await im.decode()
      c2.drawImage(im, 0, SIZE * row)
    }

    return { strips, report, check: chk2.toDataURL('image/png'), sheet: [sheet.width, sheet.height] }
  }, { b64, COLS, ROWS, SIZE, ROW_KEYS, keepAlpha })

  const write = async (path, dataUrl) =>
    writeFile(path, Buffer.from(dataUrl.split(',')[1], 'base64'))

  for (const s of result.strips) await write(join(artDir, `${s.key}.png`), s.data)
  await write(join(outDir, '14-slice-check.png'), result.check)

  console.log(`원본 ${result.sheet.join('×')} · 프레임 ${SIZE}×${SIZE} · ${keepAlpha ? '알파 유지' : '회색 키잉'}\n`)
  console.log('키       프레임  지역배경   불투명%  반투명%  프레임끝닿음  내용박스')
  for (const r of result.report) {
    console.log(
      r.key.padEnd(12), String(r.frame).padEnd(6), r.bg.padEnd(10),
      String(r.opaquePct).padStart(6), String(r.softPct).padStart(8),
      String(r.edgeTouch).padStart(12), '  ' + r.box,
    )
  }
  console.log('\n확인용:', join(outDir, '14-slice-check.png'))
} finally {
  await browser.close()
}
