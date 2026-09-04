/**
 * 시트를 프레임 스트립 PNG 로 굽는다.
 *
 * 사용자가 준 그림은 격자 한 장에 캐릭터 여러 마리 × 프레임 여러 장이 들어 있고
 * **알파 채널이 없다**(colortype 2, 배경이 박혀 있음). 게임에서 쓰려면 셀로 잘라내고
 * 배경을 파내야 한다. 시트가 늘어나므로 격자와 키잉 설정을 SHEETS 표로 뺐다.
 *
 * ImageMagick·PIL·ffmpeg 바이너리가 이 환경에 없다. Chromium 은 있어서
 * tools/screenshot.mjs 와 같은 방식으로 Playwright + canvas 로 픽셀을 다룬다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/slice-sheet.mjs
 *
 * 결과물
 *   web/art/*.png                    프레임을 가로로 붙인 스트립
 *   tools/out/14-slice-check-*.png   체커보드에 얹은 확인용 격자 (눈으로 보는 용도)
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

/* ── 실측한 격자 ──────────────────────────────────────────────────────────────
 * 배경 대비 밝은 테두리선의 열/행 프로파일에서 피크를 잡아 구했다.
 * cols/rows 는 테두리선 자체의 좌표라서 +1 부터가 셀 내부다.
 * size 는 다음 테두리선에 닿지 않는 크기로 잡는다 — 보스 시트는 마지막 행이
 * 원본에서 3px 잘려 있어서 209 로 맞췄다.                                        */
const SHEETS = [
  {
    name: '고양이',
    src: 'art-src/pose-sheet-cats.png',
    cols: [185, 368, 550, 733, 915], rows: [69, 251, 434, 617, 799],
    x0: 1, y0: 1, size: 169, ring: 3,
    keys: ['cat-cheese', 'cat-calico', 'cat-siamese', 'cat-black', 'cat-chonk'],
    check: '14-slice-check-cats.png',
  },
  {
    name: '일반 해충',
    src: 'art-src/enemy-sheet-normal.png',
    cols: [159, 380, 599], rows: [189, 409, 629, 849, 1069],
    x0: 1, y0: 1, size: 209, ring: 6,
    keys: ['enemy-mouse', 'enemy-roach', 'enemy-rat', 'enemy-bat', 'enemy-mole'],
    dropSmallParts: true,
    // 발주서에 적어 보낸 안내 문구가 마지막 행 셀 안까지 들어왔다. 글자끼리 붙어
    // 하나의 큰 덩어리가 되므로 크기 필터로는 안 걸린다. 좌표로 지운다.
    // (두더지의 실제 그림은 y=1236 에서 끝난다 — 재보고 정한 값이다)
    masks: [[0, 1240, 816, 1285]],
    check: '14-slice-check-enemies.png',
  },
  {
    name: '보스',
    src: 'art-src/enemy-sheet-boss.png',
    cols: [138, 361, 584], rows: [208, 430, 652, 874, 1095],
    x0: 1, y0: 1, size: 209, ring: 6,
    keys: ['enemy-ratking', 'enemy-molelord', 'enemy-roachqueen', 'enemy-batlord', 'enemy-demonking'],
    // 셀마다 프레임 번호(1·2·3…)가 찍혀 나왔다. 마왕 쥐의 뿔이 같은 높이까지 올라와서
    // 위쪽을 잘라내면 뿔이 날아간다 — 그래서 위치가 아니라 덩어리 크기로 거른다.
    dropSmallParts: true,
    // 이 시트만 배경이 평탄하지 않다. 캐릭터 뒤에 푸른 후광이 깔려 있어서 기본
    // 설정으로는 검은 원반처럼 통째로 남는다(실제로 그렇게 나왔다). 실측하니
    // 후광은 배경차이 12~48 · 저채도이고 캐릭터 몸은 60 이상이라, flood fill 이
    // 후광을 통과하도록 fillT 를 크게 올리고(45) 알파 램프는 좁게(hi 22) 둔 뒤,
    // 실루엣에서 2px 넘게 떨어진 곳은 아예 투명으로 만든다.
    lo: 8, hi: 22, fillT: 45, aaRadius: 2,
    // 그 결과 그림에 구워진 바닥 그림자도 같이 지워진다. 코드가 대신 그린다
    // (박쥐왕 그림자가 딱딱한 검은 막대로 나오던 것도 이걸로 없어진다).
    shadow: true,
    check: '14-slice-check-bosses.png',
  },
]

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

try {
  await page.goto('about:blank')

  /** 시트 한 장을 잘라 스트립 data URL 들과 확인용 격자를 돌려준다 (브라우저 안에서 돈다) */
  const sliceSheet = async (args) => {
    const { b64, keepAlpha, cfg } = args
    const COLS = cfg.cols, ROWS = cfg.rows, SIZE = cfg.size
    const ROW_KEYS = cfg.keys, RING = cfg.ring, DROP_SMALL = !!cfg.dropSmallParts
    const MASKS = cfg.masks || []

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
    const LO = cfg.lo ?? 6          // 노이즈 바닥. 이하는 완전 투명
    const HI = cfg.hi ?? 14         // 이 이상이면 알파 1 (실루엣 가장자리 램프)
    const FILL_T = cfg.fillT ?? 14  // 이 차이를 넘으면 flood fill 이 통과하지 못한다
    // fill 이 닿은 곳 중 실루엣에서 이만큼 넘게 떨어지면 무조건 투명.
    // 배경에 후광이 깔린 시트에서 후광이 반투명하게 남는 것을 막는다.
    const AA_R = cfg.aaRadius ?? 0   // 0 = 제한 없음

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

      /** (i,j) 가 실루엣(fill 이 못 들어간 영역)에서 AA_R 픽셀 안에 있는가 */
      const nearSilhouette = (i, j) => {
        for (let dj = -AA_R; dj <= AA_R; dj++) {
          const jj = j + dj
          if (jj < 0 || jj >= SIZE) continue
          for (let di = -AA_R; di <= AA_R; di++) {
            const ii = i + di
            if (ii < 0 || ii >= SIZE) continue
            if (!outside[jj * SIZE + ii]) return true
          }
        }
        return false
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
          else if (AA_R > 0 && !nearSilhouette(i, j)) a = 0
          else a = Math.min(1, Math.max(0, (diff[p] - LO) / (HI - LO)))

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
      // 5단계(선택) — 캐릭터와 이어지지 않은 작은 조각을 떨어낸다.
      //
      // 발주서 시트에는 셀마다 프레임 번호가 찍혀 나오고 안내 문구가 셀 안까지
      // 들어오기도 한다. 위치로 자르면(위쪽 N% 마스킹) 마왕 쥐의 뿔처럼 같은 높이의
      // 진짜 그림이 같이 날아간다. 그래서 '가장 큰 덩어리 대비 얼마나 작은가'로 거른다.
      if (DROP_SMALL) dropSmallParts(out)
      // 시트 좌표로 지정한 영역(발주서 안내 문구 등)을 지운다
      for (const [mx0, my0, mx1, my1] of MASKS) {
        for (let j = 0; j < SIZE; j++) {
          const sy = y0 + j
          if (sy < my0 || sy >= my1) continue
          for (let i = 0; i < SIZE; i++) {
            const sx = x0 + i
            if (sx >= mx0 && sx < mx1) out[(j * SIZE + i) * 4 + 3] = 0
          }
        }
      }

      return { out, bg, opaque, soft, edgeTouch, box: [minX, minY, maxX, maxY] }
    }

    /** 불투명한 픽셀을 연결 성분으로 묶고, 가장 큰 덩어리의 4% 미만인 것을 지운다. */
    function dropSmallParts(out) {
      const N = SIZE * SIZE
      const label = new Int32Array(N).fill(-1)
      const sizes = []
      const stack = new Int32Array(N)
      for (let start = 0; start < N; start++) {
        if (out[start * 4 + 3] < 24 || label[start] >= 0) continue
        const id = sizes.length
        let sp = 0, n = 0
        label[start] = id; stack[sp++] = start
        while (sp > 0) {
          const q = stack[--sp]; n++
          const i = q % SIZE, j = (q - i) / SIZE
          const push = (t) => { if (out[t * 4 + 3] >= 24 && label[t] < 0) { label[t] = id; stack[sp++] = t } }
          if (i > 0) push(q - 1)
          if (i < SIZE - 1) push(q + 1)
          if (j > 0) push(q - SIZE)
          if (j < SIZE - 1) push(q + SIZE)
        }
        sizes.push(n)
      }
      if (sizes.length <= 1) return
      const biggest = Math.max(...sizes)
      const min = Math.max(60, biggest * 0.04)
      for (let p = 0; p < N; p++) {
        if (label[p] >= 0 && sizes[label[p]] < min) { out[p * 4 + 3] = 0 }
      }
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
          ? rawCell(COLS[col] + cfg.x0, ROWS[row] + cfg.y0)
          : keyCell(COLS[col] + cfg.x0, ROWS[row] + cfg.y0)
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
  }

  const write = async (path, dataUrl) =>
    writeFile(path, Buffer.from(dataUrl.split(',')[1], 'base64'))

  for (const cfg of SHEETS) {
    const b64 = (await readFile(join(root, cfg.src))).toString('base64')
    const result = await page.evaluate(sliceSheet, { b64, keepAlpha, cfg })

    for (const s of result.strips) await write(join(artDir, `${s.key}.png`), s.data)
    await write(join(outDir, cfg.check), result.check)

    console.log(`\n■ ${cfg.name} — 원본 ${result.sheet.join('×')} · 프레임 ${cfg.size}×${cfg.size}`
      + ` × ${cfg.cols.length}장 · ${keepAlpha ? '알파 유지' : '배경 키잉'}`)
    console.log('  키               프레임  지역배경   불투명%  반투명%  끝닿음  내용박스')
    for (const r of result.report) {
      console.log(
        ' ', r.key.padEnd(18), String(r.frame).padEnd(6), r.bg.padEnd(10),
        String(r.opaquePct).padStart(6), String(r.softPct).padStart(8),
        String(r.edgeTouch).padStart(7), '  ' + r.box,
      )
    }
    console.log('  확인용:', join(outDir, cfg.check))
  }
} finally {
  await browser.close()
}
