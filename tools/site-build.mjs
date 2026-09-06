/**
 * 공식 사이트 자산 빌드 — `site/` 는 손으로 쓴 정적 HTML 이고, 이 도구는 그림과 파생 문서만 만든다.
 *
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/site-build.mjs
 *   → site/img/01-title.png … 08-settings.png (540×960)  ·  site/img/feature.png  ·  site/img/icon.png
 *
 * 왜 리사이즈하나: `store/` 는 Play 규격(1080×1920)이라 여덟 장에 6.2MB 다. 사이트는 폰으로 열므로
 * 반으로 줄여 올린다. 원본은 스토어 제출용으로 그대로 둔다(`tools/store-assets.mjs`).
 *
 * 개인정보처리방침(`--privacy`)은 **자리표시자가 남아 있으면 던진다.** 연락처가 정해지기 전에는
 * 사이트에 링크하지도 배포하지도 않는다 — `[연락처]` 라고 적힌 방침을 올리는 것보다 없는 게 낫다
 * (Play 도 연락처 없는 방침은 거부한다). 기계만 준비해 두고 스위치는 남겨 둔다.
 */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storeDir = join(root, 'store')
const siteDir = join(root, 'site')
const imgDir = join(siteDir, 'img')

/** 사이트에 올리는 스크린샷 크기 — store 원본(1080×1920)의 절반 */
export const SITE_SHOT_W = 540
export const SITE_SHOT_H = 960
/** `site/index.html` 이 참조하는 스크린샷 (store 의 같은 이름) */
export const SITE_SHOTS = ['01-title', '02-battle', '03-boss', '04-result', '05-codex', '06-chapters', '07-challenges', '08-settings']

/**
 * 마크다운 → 아주 작은 HTML. 개인정보처리방침 한 장에만 쓰므로 제목·표·목록·문단·강조만 안다.
 * 라이브러리를 들이지 않는 이유는 이 저장소의 의존성이 0이기 때문이다.
 */
export function miniMarkdown(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
  const out = []
  const lines = md.split('\n')
  let table = null
  const flushTable = () => {
    if (!table) return
    const [head, ...body] = table
    out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>')
    for (const r of body) out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>')
    out.push('</tbody></table>')
    table = null
  }
  for (const line of lines) {
    const row = /^\|(.+)\|\s*$/.exec(line)
    if (row) {
      const cells = row[1].split('|').map((c) => c.trim())
      if (cells.every((c) => /^-+$/.test(c))) continue      // 구분선은 버린다
      if (!table) table = []
      table.push(cells)
      continue
    }
    flushTable()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue }
    const li = /^[-*]\s+(.*)$/.exec(line)
    if (li) { out.push(`<li>${inline(li[1])}</li>`); continue }
    if (line.trim() === '') { out.push(''); continue }
    out.push(`<p>${inline(line)}</p>`)
  }
  flushTable()
  // 연달아 붙은 <li> 를 <ul> 로 감싼다
  return out.join('\n').replace(/(?:^|\n)((?:<li>.*<\/li>\n?)+)/g, (m, block) => `\n<ul>\n${block.trim()}\n</ul>\n`)
}

/**
 * 문서에 아직 안 채운 자리표시자가 남아 있나 — `[연락처]` · `[출시일]` 처럼 한글만 든 대괄호.
 * 바로 뒤에 `(` 가 오면 마크다운 링크(`[확장가이드](docs/…)`)라 자리표시자가 아니다.
 */
export function findPlaceholders(md) {
  return [...md.matchAll(/\[[가-힣 ]+\](?!\()/g)].map((m) => m[0])
}

const PRIVACY_SHELL = (body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>캣포 디펜스 개인정보처리방침</title>
<style>
  body { margin: 0 auto; max-width: 760px; padding: 40px 20px 80px; background: #0a0d14; color: #eef3fb;
         font: 16px/1.8 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; }
  h1 { font-size: 28px; } h2 { font-size: 20px; margin-top: 36px; }
  a { color: #6fe0b0; } code { background: #12161d; padding: 2px 6px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #232a36; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #12161d; }
  ul { padding-left: 22px; }
</style>
</head>
<body>
${body}
<p><a href="./">← 캣포 디펜스</a></p>
</body>
</html>
`

/** store/ 의 PNG 를 절반 크기로 다시 굽는다 (Playwright 로 — 저장소에 이미지 라이브러리를 안 들인다) */
async function resizeShots() {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const page = await browser.newPage({ viewport: { width: SITE_SHOT_W, height: SITE_SHOT_H } })
  const made = []
  for (const name of SITE_SHOTS) {
    const src = await readFile(join(storeDir, `${name}.png`))
    await page.setContent(
      `<style>html,body{margin:0;background:#0a0d14}img{display:block;width:${SITE_SHOT_W}px;height:${SITE_SHOT_H}px}</style>`
      + `<img src="data:image/png;base64,${src.toString('base64')}">`)
    await page.waitForLoadState('load')
    await page.locator('img').screenshot({ path: join(imgDir, `${name}.png`) })
    made.push(name)
  }
  // 기능 그래픽과 아이콘은 크기를 안 바꾸고 그대로 옮긴다 (각각 1024×500, 512×512)
  await writeFile(join(imgDir, 'feature.png'), await readFile(join(storeDir, 'feature-graphic.png')))
  await writeFile(join(imgDir, 'icon.png'), await readFile(join(root, 'web/icons/icon-512.png')))
  await browser.close()
  return made
}

async function dirSize(dir) {
  let total = 0
  for (const f of await readdir(dir)) total += (await stat(join(dir, f))).size
  return total
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(imgDir, { recursive: true })

  if (!process.argv.includes('--privacy-only')) {
    const made = await resizeShots()
    const before = await dirSize(storeDir)
    const after = await dirSize(imgDir)
    console.log(`스크린샷 ${made.length}장 + 기능 그래픽 + 아이콘 → site/img/`)
    console.log(`  ${(before / 1024 / 1024).toFixed(1)}MB (store 원본) → ${(after / 1024 / 1024).toFixed(1)}MB`)
  }

  // 개인정보처리방침 — 자리표시자가 남아 있으면 안 만든다
  if (process.argv.includes('--privacy') || process.argv.includes('--privacy-only')) {
    const md = await readFile(join(root, 'docs/개인정보처리방침.md'), 'utf8')
    const holes = findPlaceholders(md)
    if (holes.length) {
      console.error(`\n✗ 개인정보처리방침에 안 채운 자리가 있다: ${holes.join(' ')}`)
      console.error('  채우기 전에는 사이트에 올리지 않는다 — Play 도 연락처 없는 방침은 거부한다.')
      process.exit(1)
    }
    await writeFile(join(siteDir, 'privacy.html'), PRIVACY_SHELL(miniMarkdown(md)))
    console.log('site/privacy.html 생성')
  } else {
    console.log('개인정보처리방침은 안 만들었다 — 연락처가 정해지면 `--privacy` 로 켠다')
  }
}
