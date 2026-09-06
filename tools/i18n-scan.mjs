#!/usr/bin/env node
/**
 * 한국어 문구 스캔 — 영어 사전(web/js/i18n/en.js)이 코드와 맞는지 센다.
 *
 *   node tools/i18n-scan.mjs          사람용 보고
 *   node tools/i18n-scan.mjs --json   검사용 JSON
 *
 * 파일마다 모드가 있다(FILES):
 *   wrap  사용자에게 보이는 문구를 그 자리에서 만드는 파일(ui·main·game·shop…).
 *         한글 리터럴은 전부 tr(...) 의 첫 인자여야 한다 — 그래야 실행 때 번역된다.
 *   key   문구를 데이터로 들고 있다가 나중에 번역하는 파일(콘텐츠·설정 스키마·팁).
 *         한글 리터럴은 사전의 키여야 한다(registry.localizeAll 이나 표시하는 쪽의 tr 이 번역한다).
 *   두 모드 다 템플릿 리터럴(`…${x}…`)에 한글이 있으면 안 된다 — 실행 때 이미 문장이 완성돼 사전 키가 될 수 없다.
 *   tr('… {x} …', { x }) 로 바꾼다.
 * 목록에 없는 파일은 개발자용(레지스트리 오류 · 도구 · 검사 · 콘솔 안내)이라 보지 않는다.
 * wrap 파일 안에서도 부팅 전에 평가되는 모듈 상수 표(배치 실패 사유 · 상품 목록)는 그 줄에 `// i18n-key` 를 붙이거나
 * `// i18n-keys:start` … `// i18n-keys:end` 로 감싸면 key 로 본다 — 표시하는 쪽이 tr(표.값) 으로 감싼다.
 *
 * 보고 종류:
 *   unwrapped   wrap 파일에서 tr 로 감싸지 않은 한글 리터럴
 *   template    한글이 든 템플릿 리터럴
 *   missing     코드에는 있는데 사전에 없는 키
 *   unused      사전에만 있는 키(코드에서 사라진 문구)
 *   placeholder 키와 값의 {자리표시자} 집합이 다름
 *   hangul      영어 값에 한글이 섞임
 *
 * 토크나이저는 주석 · 정규식 · 템플릿 ${ } 안의 식을 구분하는 작은 상태 기계다 — 파서를 들이지 않는다(의존성 0).
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webJs = join(root, 'web/js')

/** 스캔 대상 — 묶음이 끝날 때마다 늘어난다. 없는 파일은 개발자용이다. */
export const FILES = {
  wrap: ['ui.js', 'main.js', 'game.js', 'render.js', 'domain/shop.js', 'domain/billing.js', 'domain/save.js', 'domain/growth.js', 'domain/daily.js', 'domain/tips.js',
    'content/effects.js', 'content/enemyAbilities.js', 'content/specials.js', 'content/objectives.js'],
  key: ['domain/settings.js', 'domain/targeting.js', 'domain/hints.js', 'domain/elements.js',
    'content/towers.js', 'content/enemies.js', 'content/maps.js', 'content/combos.js', 'content/pets.js', 'content/specialCombos.js',
    'content/achievements.js', 'content/challenges.js', 'content/challenges-pack2.js',
    'content/skins.js', 'content/skins-paid.js', 'content/waveSets.js', 'content/scenario.js', 'content/scenario-act3.js'],
}

export const HANGUL = /[가-힣]/

const IDENT = /[A-Za-z0-9_$]/
const ESC = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' }

/** 직전 의미 있는 글자들이 tr( 인가 — str( 같은 긴 이름은 아니다 */
function wrappedAt(src, pos) {
  let j = pos - 1
  while (j >= 0 && /\s/.test(src[j])) j -= 1
  if (src[j] !== '(') return false
  j -= 1
  while (j >= 0 && /\s/.test(src[j])) j -= 1
  if (j < 1 || src[j] !== 'r' || src[j - 1] !== 't') return false
  return !(j - 2 >= 0 && IDENT.test(src[j - 2]))
}

/** / 가 나눗셈이 아니라 정규식 시작인가 — 앞이 연산자·괄호·키워드면 정규식 */
function regexAllowed(src, pos) {
  let j = pos - 1
  while (j >= 0 && /[ \t]/.test(src[j])) j -= 1
  if (j < 0) return true
  const c = src[j]
  if ('(,=:[!&|?{};+-*%<>~^\n'.includes(c)) return true
  const word = src.slice(Math.max(0, j - 6), j + 1)
  return /(^|[^A-Za-z0-9_$])(return|typeof|case|in|of|do|else)$/.test(word)
}

function skipRegex(src, pos) {
  let j = pos + 1
  let cls = false
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') { j += 2; continue }
    if (c === '\n') break
    if (cls) { if (c === ']') cls = false }
    else if (c === '[') cls = true
    else if (c === '/') { j += 1; break }
    j += 1
  }
  while (j < src.length && /[a-z]/.test(src[j])) j += 1
  return j
}

function readString(src, pos, quote) {
  let j = pos + 1
  let text = ''
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') { const e = src[j + 1]; text += Object.prototype.hasOwnProperty.call(ESC, e) ? ESC[e] : e; j += 2; continue }
    if (src[j] === '\n') break                         // 깨진 문자열 — 줄 끝에서 멈춘다
    text += src[j]; j += 1
  }
  return { text, end: j + 1 }
}

/**
 * 코드를 훑으며 문자열·템플릿 토큰을 out 에 쌓는다.
 * stopAtBrace 면 깊이 0 의 '}' 에서 멈춘다 — 템플릿 ${ } 안의 식을 훑을 때.
 */
function scanCode(src, pos, stopAtBrace, out) {
  let depth = 0
  let i = pos
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
    if (c === '\'' || c === '"') {
      const r = readString(src, i, c)
      out.push({ kind: 'str', text: r.text, pos: i, wrapped: wrappedAt(src, i) })
      i = r.end; continue
    }
    if (c === '`') {
      const r = readTemplate(src, i, out)
      out.push({ kind: r.hasExpr ? 'tpl' : 'str', text: r.text, pos: i, wrapped: wrappedAt(src, i) })
      i = r.end; continue
    }
    if (c === '/' && regexAllowed(src, i)) { i = skipRegex(src, i); continue }
    if (stopAtBrace) {
      if (c === '{') depth += 1
      else if (c === '}') { if (depth === 0) return i + 1; depth -= 1 }
    }
    i += 1
  }
  return i
}

function readTemplate(src, pos, out) {
  let j = pos + 1
  let text = ''
  let hasExpr = false
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { const e = src[j + 1]; text += Object.prototype.hasOwnProperty.call(ESC, e) ? ESC[e] : e; j += 2; continue }
    if (src[j] === '$' && src[j + 1] === '{') { hasExpr = true; text += '${…}'; j = scanCode(src, j + 2, true, out); continue }
    text += src[j]; j += 1
  }
  return { text, hasExpr, end: j + 1 }
}

/** 소스 → 토큰 [{ kind: 'str'|'tpl', text, line, wrapped }] (등장 순서) */
export function tokenize(src) {
  const out = []
  scanCode(src, 0, false, out)
  out.sort((a, b) => a.pos - b.pos)
  const starts = [0]
  for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1)
  const lineOf = (pos) => {
    let lo = 0, hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
  return out.map((t) => ({ kind: t.kind, text: t.text, line: lineOf(t.pos), wrapped: t.wrapped }))
}

/** `// i18n-keys:start` … `// i18n-keys:end` 로 감싼 줄 범위 — 모듈 상수 표(PLACE_FAIL · 상품 목록 · 힌트)가 쓴다 */
function keyRegions(src) {
  const out = []
  let open = null
  src.split('\n').forEach((line, i) => {
    if (/\/\/ i18n-keys:start/.test(line)) open = i + 1
    else if (/\/\/ i18n-keys:end/.test(line) && open !== null) { out.push([open, i + 1]); open = null }
  })
  if (open !== null) out.push([open, Infinity])
  return out
}

/** index.html 에서 번역 대상 문구를 뽑는다 — localizeStatic 이 보는 것과 같은 규칙(태그 안 텍스트 노드 · 지정 속성 · title) */
export function htmlKeys(html) {
  const out = []
  const lineOf = (pos) => html.slice(0, pos).split('\n').length
  const attrOf = (attrs, name) => { const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null }
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*\sdata-i18n(?=[\s=>])[^>]*)>([\s\S]*?)<\/\1>/g)) {
    const text = m[3].replace(/<[^>]+>[\s\S]*?<\/[^>]+>|<[^>]+>/g, '').trim()
    if (text) out.push({ key: text, line: lineOf(m.index) })
  }
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*\sdata-i18n-attr="([^"]+)"[^>]*)>/g)) {
    for (const a of m[3].split(',')) { const v = attrOf(m[2], a.trim()); if (v && v.trim()) out.push({ key: v.trim(), line: lineOf(m.index) }) }
  }
  const title = html.match(/<title>([^<]*)<\/title>/)
  if (title && title[1].trim()) out.push({ key: title[1].trim(), line: lineOf(title.index) })
  return out.filter((x) => HANGUL.test(x.key))
}

const placeholders = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x))

/**
 * 전체 스캔. dict 를 안 주면 web/js/i18n/en.js 를 읽는다(동적 import — 도구가 사전을 고친 직후에도 새로 읽게).
 * @returns {{ files: string[], problems: Record<string, string[]>, used: Set<string>, keys: number }}
 */
export async function scanAll({ files = FILES, dict = null } = {}) {
  const en = dict || (await import(join(webJs, 'i18n/en.js') + `?t=${Date.now()}`)).EN
  const has = (k) => Object.prototype.hasOwnProperty.call(en, k)
  const problems = { unwrapped: [], template: [], missing: [], unused: [], placeholder: [], hangul: [] }
  const used = new Set()
  const scanned = []
  const missingSeen = new Set()
  for (const mode of ['wrap', 'key']) {
    for (const rel of files[mode] || []) {
      const src = readFileSync(join(webJs, rel), 'utf8')
      scanned.push(rel)
      const lines = src.split('\n')
      const regions = keyRegions(src)
      for (const tk of tokenize(src)) {
        if (!HANGUL.test(tk.text)) continue
        const where = `${rel}:${tk.line}`
        // wrap 파일 안의 데이터 표(부팅 전에 평가되는 모듈 상수)는 표시하는 쪽이 tr 로 감싼다 — 키만 맞으면 된다
        const asKey = mode === 'key' || / i18n-key\b/.test(lines[tk.line - 1] || '') || regions.some(([a, b]) => tk.line >= a && tk.line <= b)
        if (tk.kind === 'tpl') { problems.template.push(`${where} \`${tk.text}\``); continue }
        if (!asKey && !tk.wrapped) { problems.unwrapped.push(`${where} '${tk.text}'`); continue }
        used.add(tk.text)
        if (!has(tk.text) && !missingSeen.has(tk.text)) { missingSeen.add(tk.text); problems.missing.push(`${where} '${tk.text}'`) }
      }
    }
  }
  // index.html — data-i18n 텍스트와 data-i18n-attr 속성값, <title>, <meta description> 도 사전 키다
  for (const { key, line } of htmlKeys(readFileSync(join(root, 'web/index.html'), 'utf8'))) {
    used.add(key)
    if (!has(key) && !missingSeen.has(key)) { missingSeen.add(key); problems.missing.push(`index.html:${line} '${key}'`) }
  }
  for (const [k, v] of Object.entries(en)) {
    if (!used.has(k)) problems.unused.push(`'${k}'`)
    if (typeof v === 'function') continue
    if (HANGUL.test(v)) problems.hangul.push(`'${k}' → '${v}'`)
    if (!sameSet(placeholders(k), placeholders(v))) problems.placeholder.push(`'${k}' → '${v}'`)
  }
  return { files: scanned, problems, used, keys: Object.keys(en).length }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = process.argv.includes('--json')
  const r = await scanAll()
  if (json) {
    console.log(JSON.stringify({ files: r.files, keys: r.keys, used: r.used.size, problems: r.problems }, null, 2))
  } else {
    console.log(`파일 ${r.files.length}개 · 사전 키 ${r.keys}개 · 코드가 쓰는 문구 ${r.used.size}개`)
    for (const [k, list] of Object.entries(r.problems)) {
      console.log(`  ${list.length === 0 ? '✓' : '✗'} ${k} ${list.length}건`)
      for (const x of list.slice(0, 40)) console.log(`      ${x}`)
      if (list.length > 40) console.log(`      … ${list.length - 40}건 더`)
    }
    const bad = Object.values(r.problems).reduce((a, l) => a + l.length, 0)
    process.exitCode = bad ? 1 : 0
  }
}
