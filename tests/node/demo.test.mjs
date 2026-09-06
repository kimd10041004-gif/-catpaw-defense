/**
 * 데모 웹 빌드가 유료 콘텐츠를 흘리지 않는지 — **구운 결과를 열어서** 본다.
 *
 * 왜 소스가 아니라 결과물인가: 약속은 "site/play/ 에 유료 콘텐츠가 없다"이지 "코드가 그럴 작정이다"가 아니다.
 * demo-build.mjs 를 임시 폴더에 돌려 나온 파일을 전부 읽고, 유료 id 가 한 글자라도 있으면 빨개진다.
 * 새 유료 콘텐츠를 무료 파일에 섞어 넣으면 여기서 잡힌다 — content.test 의 "유료가 무료를 잠그지 않는다"의 짝이다.
 *
 * (실제로 부팅해서 챕터 18·도전 5·스킨 3·결제 disabled 인 것은 스모크가 본다 — 여기선 파일만.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { readdir, stat, rm, mkdtemp } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { buildDemo, strippedFiles, stripIndex, stripServiceWorker, demoManifest, contentFingerprint, DEMO_BUILD_JS } from '../../tools/demo-build.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** 데모에 절대 있으면 안 되는 것들 — 유료 콘텐츠의 id 와 그 안에서만 쓰는 이름 */
const PAID_MARKERS = [
  // 3막 챕터 여섯
  'ch19', 'ch20', 'ch21', 'ch22', 'ch23', 'ch24',
  // 도전 팩 2 다섯
  'no-sell', 'sprint', 'iron', 'drought', 'one-life',
  // 팩·보상 스킨 여덟
  'cheese-golden', 'calico-blossom', 'siamese-snow', 'chonk-mint',
  'black-midnight', 'mackerel-sunset', 'bluerussian-violet', 'tuxedo-rust',
]

/** 데모에도 반드시 있어야 하는 무료 콘텐츠 — 너무 많이 지우는 실수를 잡는다 */
const FREE_MARKERS = ['ch1', 'ch18', 'half-gold', 'air-only', 'cheese-ember', 'calico-ink', 'sphynx-obsidian']

async function walk(dir, base = dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p, base)))
    else out.push(relative(base, p))
  }
  return out
}

let built = null
async function demo() {
  if (!built) {
    const dir = await mkdtemp(join(tmpdir(), 'catpaw-demo-'))
    const out = join(dir, 'play')
    const info = await buildDemo(out)
    built = { dir, out, info, files: await walk(out) }
  }
  return built
}

test.after(async () => { if (built) await rm(built.dir, { recursive: true, force: true }) })

test('데모 빌드: 유료 콘텐츠 id 가 구운 파일 어디에도 없다', async () => {
  const { out, files } = await demo()
  const text = files.filter((f) => /\.(js|html|css|webmanifest|json)$/.test(f))
  const found = []
  for (const rel of text) {
    const src = readFileSync(join(out, rel), 'utf8')
    for (const id of PAID_MARKERS) {
      // 단어 경계로 본다 — 'iron' 이 'environment' 에 걸리지 않게
      if (new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`).test(src)) found.push(`${rel}: ${id}`)
    }
  }
  assert.deepEqual(found, [],
    `데모에 유료 콘텐츠가 남았다 — 무료 파일에 섞어 넣었는가? content/index.js 에 // demo:strip 표시를 붙인다`)
})

test('데모 빌드: 무료 콘텐츠는 그대로 다 있다', async () => {
  const { out, files } = await demo()
  const all = files.filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(out, f), 'utf8')).join('\n')
  for (const id of FREE_MARKERS) {
    assert.ok(new RegExp(`'${id}'`).test(all), `무료 콘텐츠 ${id} 이 데모에서 사라졌다 — 너무 많이 지웠다`)
  }
})

test('데모 빌드: 유료 파일 셋이 안 옮겨졌고 다른 건 다 옮겨졌다', async () => {
  const { out, info, files } = await demo()
  assert.equal(info.removed.length, 3, `뺀 파일이 ${info.removed.length}개다 — demo:strip 표시를 확인한다`)
  for (const rel of info.removed) {
    assert.ok(existsSync(join(root, 'web/js', rel)), `web/js/${rel} 이 없다 — 표시가 낡았다`)
    assert.ok(!existsSync(join(out, 'js', rel)), `${rel} 이 데모에 그대로 있다`)
  }
  const webCount = (await walk(join(root, 'web'))).length
  assert.equal(files.length, webCount - 3, '뺀 셋 말고 다른 파일이 빠지거나 늘었다')
})

test('데모 빌드: DEMO 가 true 이고 import 줄이 안 남았다', async () => {
  const { out } = await demo()
  const build = readFileSync(join(out, 'js/build.js'), 'utf8')
  assert.match(build, /export const DEMO = true/)
  assert.ok(!/DEMO = false/.test(build), 'build.js 가 안 갈렸다')

  const index = readFileSync(join(out, 'js/content/index.js'), 'utf8')
  for (const line of index.split('\n')) {
    if (line.trim().startsWith('import ')) {
      assert.ok(!/demo:strip/.test(line), `import 줄이 안 지워졌다: ${line.trim()}`)
    }
  }
  // 전체판은 그대로여야 한다 — 도구가 원본을 건드리면 안 된다
  assert.match(readFileSync(join(root, 'web/js/build.js'), 'utf8'), /export const DEMO = false/)
})

test('데모 빌드: sw.js ASSETS 가 실제로 있는 파일만 가리킨다', async () => {
  const { out } = await demo()
  const sw = readFileSync(join(out, 'sw.js'), 'utf8')
  assert.match(sw, /const CACHE_VERSION = 'catpaw-v[\d.]+-demo-[0-9a-f]{8}'/,
    '캐시 이름에 -demo-<지문> 이 없다 — 전체판 캐시와 섞이거나, 옛 캐시가 안 버려진다')
  const list = /const ASSETS = \[([\s\S]*?)\]/.exec(sw)
  assert.ok(list, 'ASSETS 를 못 찾았다')
  const paths = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './')
  for (const p of paths) {
    assert.ok(existsSync(join(out, p)), `sw.js 가 없는 파일을 캐시하려 한다: ${p} (데모에서 빠진 파일인가)`)
  }
})

test('데모 빌드: 매니페스트 이름과 id 가 전체판과 다르다', async () => {
  const { out } = await demo()
  const m = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'))
  const full = JSON.parse(readFileSync(join(root, 'web/manifest.webmanifest'), 'utf8'))
  assert.notEqual(m.id, full.id, '홈 화면에서 전체판과 같은 앱으로 취급된다')
  assert.match(m.name, /데모/)
  assert.equal(m.orientation, full.orientation, '세로 고정은 그대로여야 한다')
})

test('strippedFiles / stripIndex: 표시가 붙은 줄만 본다', () => {
  const src = [
    "import './a.js'    // 무료",
    "import './b.js'    // 유료   // demo:strip",
    "// demo:strip 이 붙은 줄은 유료다 — 이건 설명이지 import 가 아니다",
    "import './c.js'",
  ].join('\n')
  assert.deepEqual(strippedFiles(src), ['content/b.js'])
  const out = stripIndex(src)
  assert.ok(!/'\.\/b\.js'/.test(out))
  assert.ok(/'\.\/a\.js'/.test(out) && /'\.\/c\.js'/.test(out))
  assert.ok(/이건 설명이지/.test(out), '설명 줄까지 지웠다')
})

test('strippedFiles: 표시가 import 아닌 줄에 붙으면 던진다 (조용히 넘어가지 않는다)', () => {
  assert.throws(() => strippedFiles("const x = 1   // demo:strip"), /import 줄이 아니다/)
})

test('stripServiceWorker: 없는 항목을 지우라면 던진다', () => {
  const sw = "const CACHE_VERSION = 'catpaw-v1.2.3'\nconst ASSETS = [\n  'js/content/x.js',\n]\n"
  assert.match(stripServiceWorker(sw, ['content/x.js']), /catpaw-v1\.2\.3-demo/)
  assert.match(stripServiceWorker(sw, ['content/x.js'], 'abcd1234'), /catpaw-v1\.2\.3-demo-abcd1234/)
  assert.ok(!/content\/x\.js/.test(stripServiceWorker(sw, ['content/x.js'])))
  assert.throws(() => stripServiceWorker(sw, ['content/nope.js']), /ASSETS 에 js\/content\/nope\.js 이 없다/)
  assert.throws(() => stripServiceWorker("const ASSETS = []", []), /CACHE_VERSION/)
})

test('캐시 지문: 내용이 바뀌면 바뀌고, 같으면 그대로다', () => {
  /* 이게 없으면 배포는 초록인데 사람에겐 안 닿는다 — 서비스 워커가 캐시 우선이라
   * 캐시 이름이 그대로면 이미 방문한 사람은 새 빌드를 영영 못 받는다. 실제로 그랬다. */
  const a = [['js/a.js', 'hello'], ['js/b.js', 'world']]
  assert.equal(contentFingerprint(a), contentFingerprint([...a].reverse()), '순서가 지문을 바꾸면 안 된다')
  assert.notEqual(contentFingerprint(a), contentFingerprint([['js/a.js', 'hello!'], ['js/b.js', 'world']]),
    '내용이 바뀌었는데 지문이 같다')
  assert.notEqual(contentFingerprint(a), contentFingerprint([['js/c.js', 'hello'], ['js/b.js', 'world']]),
    '경로가 바뀌었는데 지문이 같다')
  // 경로와 내용의 경계가 흐리면 'ab'+'c' 와 'a'+'bc' 가 같은 지문이 된다
  assert.notEqual(contentFingerprint([['ab', 'c']]), contentFingerprint([['a', 'bc']]))
  assert.match(contentFingerprint(a), /^[0-9a-f]{8}$/)
})

test('캐시 지문: 실제 빌드에서 web/ 을 고치면 캐시 이름이 갈린다', async () => {
  const { out } = await demo()
  const sw = readFileSync(join(out, 'sw.js'), 'utf8')
  const fp = /catpaw-v[\d.]+-demo-([0-9a-f]{8})/.exec(sw)
  assert.ok(fp, '지문을 못 찾았다')
  // 같은 소스로 다시 구우면 같아야 한다(헛되이 캐시를 안 버린다)
  const again = await mkdtemp(join(tmpdir(), 'catpaw-demo2-'))
  try {
    const info = await buildDemo(join(again, 'play'))
    assert.equal(info.fingerprint, fp[1], '같은 소스인데 지문이 달라졌다 — 매 배포마다 캐시가 헛되이 버려진다')
  } finally {
    await rm(again, { recursive: true, force: true })
  }
})

test('demoManifest / DEMO_BUILD_JS: 전체판 주소를 그대로 들고 간다', () => {
  const m = JSON.parse(demoManifest('{"name":"x","id":"/a/","orientation":"portrait"}'))
  assert.equal(m.orientation, 'portrait')
  assert.match(m.name, /데모/)
  const full = readFileSync(join(root, 'web/js/build.js'), 'utf8')
  const url = /FULL_APP_URL = '([^']+)'/.exec(full)[1]
  assert.ok(DEMO_BUILD_JS.includes(url), '데모의 FULL_APP_URL 이 전체판과 다르다 — 상점 링크가 엉뚱한 데로 간다')
})
