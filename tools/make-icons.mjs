/**
 * PWA 아이콘 PNG 생성기 — 헤드리스 크로미움으로 SVG를 렌더해 PNG로 저장한다.
 * 아이콘 모양을 바꾸려면 web/icons/icon.svg만 고치고 이 스크립트를 다시 돌리면 된다.
 *   NODE_PATH=/opt/node22/lib/node_modules node tools/make-icons.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// playwright는 개발 도구일 뿐이라 프로젝트 의존성에 넣지 않는다.
// CommonJS require는 NODE_PATH를 따르므로 전역 설치본도 찾아낸다.
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'web/icons/icon.svg'), 'utf8')

/** 마스커블 아이콘 — 원형으로 잘려도 발바닥이 살아남도록 배경을 꽉 채우고 여백을 크게 준다 */
const maskable = svg
  .replace('<rect width="512" height="512" rx="112"', '<rect width="512" height="512" rx="0"')
  .replace('<g fill="url(#pad)">', '<g fill="url(#pad)" transform="translate(256 256) scale(0.66) translate(-256 -256)">')

/** 완전한 원형 아이콘 — 안드로이드 round 런처용 */
const round = svg.replace('<rect width="512" height="512" rx="112"', '<rect width="512" height="512" rx="256"')

const targets = [
  { dir: 'web/icons', name: 'icon-192.png', size: 192, source: svg },
  { dir: 'web/icons', name: 'icon-512.png', size: 512, source: svg },
  { dir: 'web/icons', name: 'icon-maskable-512.png', size: 512, source: maskable },
]

// 안드로이드 API 24~25는 적응형 아이콘(XML)을 못 읽으므로 밀도별 PNG가 따로 필요하다.
const ANDROID_RES = 'android/app/src/main/res'
for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  targets.push({ dir: `${ANDROID_RES}/mipmap-${density}`, name: 'ic_launcher.png', size, source: svg })
  targets.push({ dir: `${ANDROID_RES}/mipmap-${density}`, name: 'ic_launcher_round.png', size, source: round })
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
try {
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.source}`,
    )
    const buf = await page.screenshot({ omitBackground: true })
    mkdirSync(join(root, t.dir), { recursive: true })
    writeFileSync(join(root, t.dir, t.name), buf)
    console.log(`${t.dir}/${t.name} (${t.size}x${t.size}) ${buf.length} bytes`)
    await page.close()
  }
} finally {
  await browser.close()
}
