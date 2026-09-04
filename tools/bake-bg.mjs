/**
 * 화면 배경을 JPEG 으로 굽는다.
 *
 * 배경은 알파가 필요 없고 사진이라 PNG 로 두면 장당 1MB 가 넘는다. web/art/ 가
 * 이미 5.3MB 라 그대로 넣으면 두 배가 된다. JPEG 이면 한참 작다.
 *
 * ImageMagick·sharp 가 이 환경에 없다. slice-sheet.mjs 와 같은 방식으로
 * Playwright + 캔버스 toDataURL('image/jpeg', q) 를 쓴다.
 *
 * 원본은 업로드 폴더에서 읽고 결과물만 커밋한다 — 캐릭터 시트를 전부 그렇게 했다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/bake-bg.mjs
 *
 * 결과물: web/art/bg-*.jpg
 */
import { createRequire } from 'node:module'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artDir = join(root, 'web/art')
mkdirSync(artDir, { recursive: true })

const UP = '/root/.claude/uploads/318017ee-cb7b-59bd-ab2a-e00c2f1dab25'

/* ── 굽을 것 ──────────────────────────────────────────────────────────────────
 * 받은 그림은 832×1296 (9:14, 오차 0.14%) 이라 자르지 않는다.
 *
 * bg-select 는 받은 그림을 안 쓴다. 생성기가 시안의 '어두운 띠'를 납작한 회색
 * 사각형으로 그려 버려서 아래 27%가 못 쓰게 나왔다(y 0.735~0.93 에서 평균 RGB
 * (14,20,26)→(54,59,63), 가로 표준편차 2.57). 선택 화면은 카드가 불투명해서
 * 배경이 좌우 여백·카드 틈·목록 아래로만 드러나는데, 하필 그 아래가 회색 판
 * 자리였다. 그래서 타이틀 원본을 크게 흐려 쓴다 — '타이틀은 선명, 선택은
 * 아웃포커스'가 되어 오히려 한 세계로 읽힌다.                                   */
const BACKGROUNDS = [
  { key: 'bg-title', src: `${UP}/94c69923-image.png`, quality: 0.82 },
  { key: 'bg-story', src: `${UP}/7171030f-image.png`, quality: 0.82 },
  { key: 'bg-select', src: `${UP}/94c69923-image.png`, quality: 0.78, scale: 0.5, blur: 18, darken: 0.22 },
]

for (const cfg of BACKGROUNDS) {
  if (!existsSync(cfg.src)) {
    throw new Error(`배경 원본이 없습니다 → ${cfg.src}\n`
      + `  (${cfg.key}. 업로드 폴더가 비워졌다면 그림을 다시 받아야 합니다)`)
  }
}

/** 브라우저 안에서 도는 굽기. 한 장을 받아 JPEG data URL 과 실측값을 돌려준다. */
function bakeOne({ b64, cfg }) {
  return (async () => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()

    const sw = img.naturalWidth, sh = img.naturalHeight
    const w = Math.round(sw * (cfg.scale || 1))
    const h = Math.round(sh * (cfg.scale || 1))

    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const c = cv.getContext('2d', { willReadFrequently: true })
    c.imageSmoothingQuality = 'high'

    // JPEG 에는 알파가 없다. 혹시 투명이 남아도 검게 굳지 않도록 바탕을 먼저 깐다.
    c.fillStyle = '#0a0d14'
    c.fillRect(0, 0, w, h)

    if (cfg.blur) {
      /* blur 커널이 캔버스 밖(투명 검정)을 물어와 테두리에 검은 띠가 생긴다.
       * 원본을 커널 반경만큼 크게·가운데 정렬로 그려 커널이 진짜 가장자리에
       * 못 닿게 한다. 넘치는 부분은 캔버스 밖으로 잘린다.                     */
      const over = 1 + (cfg.blur * 3) / Math.min(w, h)
      const dw = w * over, dh = h * over
      c.filter = `blur(${cfg.blur}px)`
      c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
      c.filter = 'none'
    } else {
      c.drawImage(img, 0, 0, w, h)
    }

    if (cfg.darken) {
      c.fillStyle = `rgba(6,9,14,${cfg.darken})`
      c.fillRect(0, 0, w, h)
    }

    /** 세로 구간의 평균 밝기. 스크림 세기를 눈대중이 아니라 숫자로 정하려고 잰다. */
    const bandLum = (a, z) => {
      const y0 = Math.round(h * a), y1 = Math.max(y0 + 1, Math.round(h * z))
      const d = c.getImageData(0, y0, w, y1 - y0).data
      let s = 0
      for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      return Math.round(s / (d.length / 4))
    }

    return {
      data: cv.toDataURL('image/jpeg', cfg.quality),
      src: [sw, sh],
      out: [w, h],
      bands: [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]].map(([a, z]) => bandLum(a, z)),
    }
  })()
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()

try {
  await page.goto('about:blank')
  console.log('배경 굽기 — 원본 PNG → web/art/*.jpg\n')
  console.log('  키          원본        결과        품질   용량      구간별 평균밝기 (위→아래)')

  let total = 0
  for (const cfg of BACKGROUNDS) {
    const b64 = (await readFile(cfg.src)).toString('base64')
    const r = await page.evaluate(bakeOne, { b64, cfg })

    const dst = join(artDir, `${cfg.key}.jpg`)
    await writeFile(dst, Buffer.from(r.data.split(',')[1], 'base64'))
    const kb = Math.round((await stat(dst)).size / 1024)
    total += kb

    const how = [cfg.scale ? `축소 ${cfg.scale}` : null, cfg.blur ? `흐림 ${cfg.blur}px` : null,
      cfg.darken ? `어둡게 ${cfg.darken}` : null].filter(Boolean).join(' · ')
    console.log(' ', cfg.key.padEnd(11), r.src.join('×').padEnd(11), r.out.join('×').padEnd(11),
      String(cfg.quality).padEnd(6), `${String(kb).padStart(4)}KB`,
      '  ' + r.bands.map((v) => String(v).padStart(3)).join(' '), how ? `  ← ${how}` : '')
  }

  const pngKb = Math.round(
    (await Promise.all(BACKGROUNDS.map(async (c) => (await stat(c.src)).size))).reduce((a, b) => a + b) / 1024)
  console.log(`\n합계 ${total}KB (원본 PNG ${pngKb}KB → ${Math.round(100 - total / pngKb * 100)}% 절감)`)
} finally {
  await browser.close()
}
