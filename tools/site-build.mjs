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
 *
 * 확률 정보(`site/odds.html`)는 **매번 굽는다**(`--odds-only` 로 그것만). 게임산업법은 확률형 아이템의 확률을
 * 게임 안·**홈페이지**·광고 셋에 공개하라고 한다 — 사이트에는 W 전까지 없었다. 숫자는 게임 화면과 같은 함수
 * (`gacha.js` 의 `disclosureRows`·`itemOdds`·`pityOdds`)에서 오고, `site.test` 가 커밋된 파일이 지금 계산과
 * 글자 그대로 같은지 본다 — 표를 고치고 이 페이지를 안 구우면 빨개진다.
 */
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../web/js/content/index.js'
import { cardPools, getTower } from '../web/js/content/registry.js'
import {
  disclosureRows, itemOdds, pityOdds, formatOdds, PITY_AT, DRAW_COST_CATNIP, DRAW10_COST_CATNIP,
  SHARDS_PER_CARD, SHARDS_PER_DUPLICATE,
} from '../web/js/domain/gacha.js'
import { ELEMENT_NAMES } from '../web/js/domain/elements.js'

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

/** 사이트 문서 한 장의 껍데기 — 개인정보처리방침과 같은 모양 */
const DOC_SHELL = (title, body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0 auto; max-width: 760px; padding: 40px 20px 80px; background: #0a0d14; color: #eef3fb;
         font: 16px/1.8 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; }
  h1 { font-size: 28px; } h2 { font-size: 20px; margin-top: 36px; }
  a { color: #6fe0b0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #232a36; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #12161d; }
  td.p { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  ul { padding-left: 22px; }
  .dim { color: #9aa6b8; }
</style>
</head>
<body>
${body}
<p><a href="./">← 캣포 디펜스</a></p>
</body>
</html>
`

/** 낱개 아이템 → 사람이 읽는 이름 (사이트는 한국어) */
function oddsName(o) {
  if (o.kind === 'cat') { const t = getTower(o.id); return t ? t.name : o.id }
  if (o.kind === 'rune') return `${ELEMENT_NAMES[o.id]} 룬`
  return `카드 조각 ${o.amount}개`
}

/**
 * 확률 정보 페이지 — 게임 화면과 **같은 함수**에서 만든다. 날짜·버전을 안 넣는다: 넣으면 확률이 그대로여도
 * 버전을 올릴 때마다 이 파일이 바뀌어 검사가 빨개진다. 확률이 바뀌면 이 파일이 바뀐다 — 그게 이력이다(git).
 */
export function renderOddsPage() {
  const pools = cardPools()
  const tierName = Object.fromEntries(disclosureRows().map((r) => [r.id, r.name]))
  const rows = (items) => items.map((o) => `<tr><td>${tierName[o.tier] || o.tier}</td><td>${oddsName(o)}</td><td class="p">${formatOdds(o.p)}</td></tr>`).join('\n')
  const pity = pityOdds(pools)
  const body = `<h1>캣포 디펜스 확률형 아이템 정보</h1>
<p>이 게임에는 <strong>확률형 아이템(고양이 카드 뽑기)</strong>이 있다. 뽑기는 티켓이나 캣닢으로 한다 —
티켓은 출석·원정 보상으로만 얻고 팔지 않는다. 캣닢은 플레이로 모이고, 앱 안에서 돈으로도 산다.
그래서 이 뽑기는 게임산업법이 말하는 유료 확률형 아이템이고, 확률을 여기와 게임 안 뽑기 화면에 똑같이 공개한다.</p>
<p>한 장 ${DRAW_COST_CATNIP} 캣닢(또는 티켓 1장) · ${PITY_AT}연 ${DRAW10_COST_CATNIP} 캣닢(한 장 값의 9배 — 한 장은 덤).</p>

<h2>등급별 확률</h2>
<table><thead><tr><th>등급</th><th>나오는 것</th><th>확률</th></tr></thead><tbody>
${disclosureRows().map((r) => `<tr><td>${r.name}</td><td>${r.desc}</td><td class="p">${r.percent}</td></tr>`).join('\n')}
</tbody></table>

<h2>아이템별 확률 (한 장마다)</h2>
<p class="dim">등급 안에서는 고르게 나온다 — 등급 확률을 그 등급의 아이템 수로 나눈 값이다.</p>
<table><thead><tr><th>등급</th><th>아이템</th><th>확률</th></tr></thead><tbody>
${rows(itemOdds(pools))}
</tbody></table>

<h2>${PITY_AT}연 보장 — 확률이 바뀌는 경우</h2>
<p>${PITY_AT}연의 마지막 장은, <strong>앞 ${PITY_AT - 1}장에 새 고양이(전설·희귀)가 한 장도 없을 때만</strong> 아래 확률로 바뀐다.
그럴 확률은 ${formatOdds(pity.chance)} 다. 앞 ${PITY_AT - 1}장에 이미 나왔으면 마지막 장도 위의 보통 확률 그대로다.</p>
<table><thead><tr><th>등급</th><th>아이템</th><th>확률</th></tr></thead><tbody>
${rows(pity.items)}
</tbody></table>

<h2>그 밖에</h2>
<ul>
<li>이미 가진 고양이가 또 나오면 카드 조각 ${SHARDS_PER_DUPLICATE}개로 바뀐다.</li>
<li>카드 조각 ${SHARDS_PER_CARD}개로 원하는 고양이 카드를 직접 바꿀 수 있다 — 운이 나빠도 결국 닿는다.</li>
<li>뽑기에서만 나오는 고양이는 진행을 막지 않는다. 기존 아홉 마리는 시나리오 보상으로 전부 무료로 얻는다.</li>
<li>표시 확률은 소수점 셋째 자리에서 반올림했다. 합이 반올림 때문에 100% 와 조금 다를 수 있다.</li>
<li>이 페이지는 게임이 실제로 굴리는 확률 표에서 자동으로 만든다. 확률이 바뀌면 게임과 이 페이지가 함께 바뀐다.</li>
</ul>`
  return DOC_SHELL('캣포 디펜스 확률 정보', body)
}

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

  // 확률 정보 — 늘 굽는다(그림과 달리 기다릴 것이 없다). 검사가 커밋된 파일과 대조한다
  await writeFile(join(siteDir, 'odds.html'), renderOddsPage())
  console.log('site/odds.html 생성 (확률 정보 — gacha.js 의 표에서)')
  if (process.argv.includes('--odds-only')) process.exit(0)

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
