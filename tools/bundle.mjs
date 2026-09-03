/**
 * 단일 HTML 번들러 — ES 모듈 여러 개를 파일 하나로 합친다.
 *
 * 왜 필요한가: 게임은 ES 모듈이라 HTTP 서버가 있어야 돌아간다(file://에서는 CORS로 막힌다).
 * 서버 없이 그냥 열어서 바로 해보고 싶을 때, 그리고 Artifact처럼 단일 파일만 받는 곳에
 * 올릴 때 쓴다.
 *
 * 방식: 각 모듈을 함수로 감싸 자체 스코프를 주고 작은 require 구현으로 잇는다.
 * 이름을 그냥 이어붙이면 모듈 간 지역 변수(blob, shadow, scale 등)가 충돌하는데,
 * 함수로 감싸면 그 문제가 원천적으로 없어진다.
 *
 *   node tools/bundle.mjs
 *   → dist/catpaw-defense.html  (그냥 열면 되는 완전 독립 파일)
 *   → dist/artifact.html        (Artifact용 — html/head/body 껍데기 없음)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'web')
const entry = join(webRoot, 'js/main.js')

/** 모듈 경로를 번들 안에서 쓸 짧은 id로 */
const idOf = (abs) => relative(webRoot, abs).split('\\').join('/')

const modules = new Map()   // id → { code, deps }
const order = []            // 위상 정렬 결과 (의존 대상이 앞에 온다)

/** import 구문에서 { a, b as c } 를 구조분해 문법으로 바꾼다 */
function bindings(spec) {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(\S+)\s+as\s+(\S+)$/)
      return m ? `${m[1]}: ${m[2]}` : s
    })
    .join(', ')
}

function load(absPath) {
  const id = idOf(absPath)
  if (modules.has(id)) return id
  modules.set(id, null)   // 순환 방지 표시

  let src = readFileSync(absPath, 'utf8')
  const dir = dirname(absPath)
  const deps = []
  const exported = new Set()

  const dep = (spec) => {
    const abs = resolve(dir, spec)
    const depId = load(abs)
    deps.push(depId)
    return depId
  }

  // export { a, b } from './x.js'  — 재수출
  src = src.replace(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) => {
    const depId = dep(spec)
    const lines = names.split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => {
        const m = n.match(/^(\S+)\s+as\s+(\S+)$/)
        const [from, to] = m ? [m[1], m[2]] : [n, n]
        return `__x.${to} = __m.${from};`
      })
    return `{ const __m = __req(${JSON.stringify(depId)}); ${lines.join(' ')} }`
  })

  // import * as ns from './x.js'   (네임스페이스 임포트)
  src = src.replace(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"];?/g, (_, ns, spec) =>
    `const ${ns} = __req(${JSON.stringify(dep(spec))});`)

  // import { a, b } from './x.js'   (여러 줄 포함)
  src = src.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g, (_, names, spec) =>
    `const { ${bindings(names)} } = __req(${JSON.stringify(dep(spec))});`)

  // import './x.js'   (부수효과만)
  src = src.replace(/import\s*['"]([^'"]+)['"];?/g, (_, spec) =>
    `__req(${JSON.stringify(dep(spec))});`)

  // export function / const / let / var / class → 선언만 남기고 이름을 모은다
  src = src.replace(/^export\s+(async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_, asyncKw, kind, name) => {
      exported.add(name)
      return `${asyncKw || ''}${kind} ${name}`
    })

  // export { a, b }   (지역 이름 재수출)
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => {
    for (const n of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      const m = n.match(/^(\S+)\s+as\s+(\S+)$/)
      exported.add(m ? m[2] : n)
    }
    return ''
  })

  if (/^export\s/m.test(src)) {
    throw new Error(`${id}: 처리하지 못한 export 구문이 남았습니다`)
  }
  // import 가 하나라도 남으면 번들 안에서 문법 오류가 나고 페이지가 통째로 죽는다.
  // 조용히 지나가지 않게 여기서 멈춘다.
  const leftover = src.match(/^import\s.*$/m)
  if (leftover) {
    throw new Error(`${id}: 처리하지 못한 import 구문이 남았습니다 → ${leftover[0].trim()}`)
  }

  const tail = [...exported].map((n) => `__x.${n} = ${n};`).join('\n  ')
  modules.set(id, { code: src, tail, deps })
  order.push(id)
  return id
}

load(entry)

const runtime = `
// ── 작은 모듈 런타임 ──────────────────────────────────────────────────────
// 각 모듈이 자기 함수 스코프를 가지므로 모듈 간 지역 이름이 절대 충돌하지 않는다.
const __defs = {};
const __cache = {};
function __req(id) {
  if (__cache[id]) return __cache[id];
  const __x = {};
  __cache[id] = __x;          // 순환 참조가 생겨도 부분 객체를 돌려주고 멈추지 않는다
  __defs[id](__x, __req);
  return __x;
}
`

const body = order.map((id) => `__defs[${JSON.stringify(id)}] = function (__x, __req) {
${modules.get(id).code}
  ${modules.get(id).tail}
};`).join('\n\n')

const bundleJs = `${runtime}\n${body}\n\n__req(${JSON.stringify(idOf(entry))});\n`

// ── HTML 조립 ─────────────────────────────────────────────────────────────
const css = readFileSync(join(webRoot, 'css/style.css'), 'utf8')
const svg = readFileSync(join(webRoot, 'icons/icon.svg'), 'utf8')
const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`

let html = readFileSync(join(webRoot, 'index.html'), 'utf8')
const inner = html.slice(html.indexOf('<div id="app">'), html.indexOf('</body>'))
  .replace('src="icons/icon.svg"', `src="${svgDataUri}"`)
  .replace(/<script type="module"[^>]*><\/script>/, '')

const page = (standalone) => {
  const head = `<title>캣포 디펜스</title>
<style>
${css}
</style>`
  const content = `${head}
${inner}
<script type="module">
${bundleJs}
</script>`
  if (!standalone) return content
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#12161d">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" href="${svgDataUri}">
${head}
</head>
<body>
${inner}
<script type="module">
${bundleJs}
</script>
</body>
</html>
`
}

mkdirSync(join(root, 'dist'), { recursive: true })
const standalonePath = join(root, 'dist/catpaw-defense.html')
const artifactPath = join(root, 'dist/artifact.html')
writeFileSync(standalonePath, page(true))
writeFileSync(artifactPath, page(false))

const kb = (p) => `${Math.round(readFileSync(p).length / 1024)}KB`
console.log(`모듈 ${order.length}개를 합쳤습니다`)
console.log(`  dist/catpaw-defense.html  ${kb(standalonePath)}  (그냥 열면 되는 독립 파일)`)
console.log(`  dist/artifact.html        ${kb(artifactPath)}  (Artifact용)`)
