/**
 * 데모 웹 빌드 — `web/` 을 `site/play/` 로 굽는다. **유료 콘텐츠를 빼고.**
 *
 *   node tools/demo-build.mjs          → site/play/ (기본)
 *   node tools/demo-build.mjs --out X  → 다른 곳으로 (검사가 임시 폴더에 굽는 데 쓴다)
 *
 * 왜 있나: 아이폰에는 앱이 없다(맥·애플 개발자 계정이 필요하다). 웹앱(PWA)이 유일한 길인데
 * `web/` 을 그대로 올리면 '데모 결제'가 3막·스킨 팩을 공짜로 열어 준다 — 파는 물건을 나눠 주는 셈이다.
 * 그래서 **유료 콘텐츠가 아예 없는 빌드**를 따로 굽는다. 잠가 두는 게 아니라 파일이 없다.
 *
 * 어떻게 빼나 (둘 다 **줄·파일 단위**다 — 소스를 잘라 고치지 않는다. 한 글자 어긋나면 조용히 틀린 빌드가 나온다):
 *   1. `web/js/content/index.js` 에서 `// demo:strip` 이 붙은 import 줄을 지우고, 그 줄이 가리키는 파일을 안 옮긴다
 *   2. `web/js/build.js` 를 통째로 다시 쓴다 (`DEMO = true`) → billing.js 가 DisabledBillingProvider 를 고른다
 *   3. `domain/shop.js` 의 `// demo:empty-start` … `-end` 구간(IAP_PRODUCTS)을 빈 배열로 — 결제 상품 목록도 안 싣는다
 * 그리고 sw.js 의 ASSETS 에서 빠진 파일을 지우고 캐시 이름에 `-demo` 를 붙인다(전체판 캐시와 안 섞이게).
 *
 * **웨이브셋(`gauntlet20`·`mixed25`)은 일부러 안 뺀다.** 지금은 3막만 쓰지만 그건 표일 뿐 파는 물건이 아니고,
 * 나중에 무료 챕터가 같은 표를 쓰면 뺐던 게 사고가 된다. 파는 것(챕터·도전·스킨·상품)만 뺀다.
 *
 * **산출물은 커밋하지 않는다**(.gitignore). `web/` 을 그대로 복사한 것이라 저장소가 두 배가 되고
 * web/ 을 고칠 때마다 100개 넘는 파일이 diff 에 뜬다. `pages.yml` 이 배포 직전에 굽는다.
 *
 * 이 도구가 지키는 약속은 `tests/node/demo.test.mjs` 가 **구운 결과를 열어** 검사한다 —
 * 유료 id 가 한 글자도 없고, 무료 콘텐츠는 그대로 있고, ASSETS 가 실제 파일과 맞는지.
 */
import { readFile, writeFile, mkdir, readdir, stat, rm, copyFile } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDir = join(root, 'web')

/** `// demo:strip` 이 붙은 import 줄에서 파일 경로를 뽑는다 → ['content/scenario-act3.js', …] */
export function strippedFiles(indexSrc) {
  const out = []
  for (const line of indexSrc.split('\n')) {
    if (!/\/\/\s*demo:strip\s*$/.test(line)) continue
    const m = /^import\s+'\.\/([^']+)'/.exec(line.trim())
    if (!m) throw new Error(`demo:strip 이 붙었는데 import 줄이 아니다: ${line.trim()}`)
    out.push(`content/${m[1]}`)
  }
  return out
}

/** `// demo:strip` 줄을 지운 content/index.js */
export function stripIndex(indexSrc) {
  return indexSrc
    .split('\n')
    .filter((line) => !/\/\/\s*demo:strip\s*$/.test(line))
    .join('\n')
}

/** ASSETS 목록에서 빠진 파일을 지우고 캐시 이름에 -demo 를 붙인 sw.js */
export function stripServiceWorker(swSrc, removed) {
  let out = swSrc.replace(/(const CACHE_VERSION = 'catpaw-v[\d.]+)'/, "$1-demo'")
  if (out === swSrc) throw new Error('sw.js 의 CACHE_VERSION 줄을 못 찾았다')
  for (const rel of removed) {
    const before = out
    out = out.replace(new RegExp(`^\\s*'js/${rel.replace(/[.]/g, '\\.')}',\\n`, 'm'), '')
    if (out === before) throw new Error(`sw.js ASSETS 에 js/${rel} 이 없다 — 넣고 다시 굽는다`)
  }
  return out
}

/**
 * `// demo:empty-start` … `// demo:empty-end` 사이의 배열을 빈 배열로 갈아 끼운다.
 * 데모는 실제 결제 상품을 하나도 싣지 않는다 — 살 수 없는 목록을 들고 다닐 이유가 없고,
 * 상품 이름에 유료 스킨 id 가 들어 있어 그것까지 같이 나간다(demo.test 가 확인한다).
 * 표시 줄을 못 찾으면 조용히 넘어가지 않고 던진다.
 */
export function emptyMarkedArray(src) {
  const lines = src.split('\n')
  const a = lines.findIndex((l) => l.trim().startsWith('// demo:empty-start'))
  const b = lines.findIndex((l) => l.trim() === '// demo:empty-end')
  if (a < 0 || b < 0 || b < a) throw new Error('demo:empty-start / demo:empty-end 표시를 못 찾았다')
  const decl = lines.slice(a, b).find((l) => /^export const \w+ = \[/.test(l.trim()))
  if (!decl) throw new Error('demo:empty 구간에 `export const X = [` 줄이 없다')
  const name = /^export const (\w+) = \[/.exec(decl.trim())[1]
  return [...lines.slice(0, a), `export const ${name} = []   // 데모 빌드: 결제 상품 없음`, ...lines.slice(b + 1)].join('\n')
}

/** 데모 빌드의 build.js — 통째로 갈아 끼운다 */
export const DEMO_BUILD_JS = `/**
 * 이 파일은 tools/demo-build.mjs 가 만들었다. 손으로 고치지 않는다 —
 * 전체판(web/js/build.js)을 고치고 다시 구우면 된다.
 */

export const DEMO = true

export const FULL_APP_URL = 'https://kimd10041004-gif.github.io/-catpaw-defense/'
`

/** 데모 매니페스트 — 홈 화면에서 전체판과 헷갈리지 않게 이름과 id 를 다르게 */
export function demoManifest(src) {
  const m = JSON.parse(src)
  m.name = '캣포 디펜스 (데모)'
  m.short_name = '캣포 데모'
  m.id = '/-catpaw-defense/play/'
  return `${JSON.stringify(m, null, 2)}\n`
}

async function walk(dir, base = dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p, base)))
    else out.push(relative(base, p))
  }
  return out
}

export async function buildDemo(outDir) {
  const indexSrc = await readFile(join(webDir, 'js/content/index.js'), 'utf8')
  const removed = strippedFiles(indexSrc)
  if (!removed.length) throw new Error('demo:strip 이 붙은 줄이 하나도 없다 — 표시가 지워졌는가')

  const skip = new Set(removed.map((r) => join('js', r)))
  await rm(outDir, { recursive: true, force: true })

  const files = await walk(webDir)
  let copied = 0
  for (const rel of files) {
    if (skip.has(rel)) continue
    const dest = join(outDir, rel)
    await mkdir(dirname(dest), { recursive: true })
    if (rel === 'js/content/index.js') await writeFile(dest, stripIndex(indexSrc))
    else if (rel === 'js/build.js') await writeFile(dest, DEMO_BUILD_JS)
    else if (rel === 'sw.js') await writeFile(dest, stripServiceWorker(await readFile(join(webDir, rel), 'utf8'), removed))
    else if (rel === 'manifest.webmanifest') await writeFile(dest, demoManifest(await readFile(join(webDir, rel), 'utf8')))
    else if (rel === 'js/domain/shop.js') await writeFile(dest, emptyMarkedArray(await readFile(join(webDir, rel), 'utf8')))
    else await copyFile(join(webDir, rel), dest)
    copied += 1
  }
  return { copied, removed }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out')
  const outDir = i > 0 ? join(root, process.argv[i + 1]) : join(root, 'site/play')
  const { copied, removed } = await buildDemo(outDir)
  console.log(`데모 빌드 → ${relative(root, outDir)}/`)
  console.log(`  파일 ${copied}개 · 뺀 유료 콘텐츠 ${removed.length}개: ${removed.join(' ')}`)
  console.log('  결제 없음 (build.js DEMO=true → DisabledBillingProvider)')
}
