/**
 * 버전을 한 번에 올린다 — 다섯 곳이 늘 같아야 한다:
 *   package.json                     "version": "x.y.z"
 *   web/js/version.js                export const APP_VERSION = 'x.y.z'
 *   android/app/build.gradle.kts     val appVersion = "x.y.z"      (versionCode 는 여기서 계산한다)
 *   web/sw.js                        const CACHE_VERSION = 'catpaw-vx.y.z'
 *   site/index.html                  <span class="ver">vx.y.z</span>   (공식 사이트 푸터)
 *
 *   node tools/bump-version.mjs patch        1.0.0 → 1.0.1
 *   node tools/bump-version.mjs minor        1.0.1 → 1.1.0
 *   node tools/bump-version.mjs major        1.1.0 → 2.0.0
 *   node tools/bump-version.mjs 1.4.2        그 값으로
 *
 * 정책: 배포마다 최소 patch 를 올린다 — 에셋(그림·CSS)만 바뀌어도. sw.js 의 캐시 이름이 버전을 따르므로
 * 버전을 안 올리면 설치된 PWA 가 옛 파일을 계속 서빙한다. tests/node/version.test.mjs 가 다섯 곳을 대조한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

/** 다음 버전. kind 는 patch|minor|major 또는 x.y.z 문자열. */
export function nextVersion(current, kind) {
  const m = SEMVER.exec(current)
  if (!m) throw new Error(`현재 버전이 x.y.z 꼴이 아니다: ${current}`)
  const [major, minor, patch] = m.slice(1).map(Number)
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  if (kind === 'major') return `${major + 1}.0.0`
  if (SEMVER.test(kind)) {
    const [a, b, c] = kind.split('.').map(Number)
    if (b >= 100 || c >= 100) throw new Error(`minor·patch 는 100 미만이어야 versionCode 로 접힌다: ${kind}`)
    if (compare(kind, current) <= 0) throw new Error(`새 버전 ${kind} 이(가) 현재 ${current} 보다 크지 않다`)
    return kind
  }
  throw new Error(`patch | minor | major | x.y.z 중 하나여야 한다 (받은 값: ${kind})`)
}

function compare(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

/** 파일별 치환 규칙. 각 정규식은 정확히 한 번 맞아야 한다 — 0번이면 파일 형식이 바뀐 것이다. */
export const TARGETS = [
  { file: 'package.json', re: /("version":\s*")(\d+\.\d+\.\d+)(")/ },
  { file: 'web/js/version.js', re: /(export const APP_VERSION = ')(\d+\.\d+\.\d+)(')/ },
  { file: 'android/app/build.gradle.kts', re: /(val appVersion = ")(\d+\.\d+\.\d+)(")/ },
  { file: 'web/sw.js', re: /(const CACHE_VERSION = 'catpaw-v)(\d+\.\d+\.\d+)(')/ },
  { file: 'site/index.html', re: /(<span class="ver">v)(\d+\.\d+\.\d+)(<\/span>)/ },
]

/**
 * 텍스트 묶음에 새 버전을 적용한다 (순수 — 파일은 안 건드린다).
 * @param {Record<string,string>} texts  { 파일경로: 내용 }
 * @returns {{ texts: Record<string,string>, from: string }}
 */
export function applyVersion(texts, version) {
  if (!SEMVER.test(version)) throw new Error(`x.y.z 꼴이 아니다: ${version}`)
  const out = {}
  let from = null
  for (const t of TARGETS) {
    const src = texts[t.file]
    if (typeof src !== 'string') throw new Error(`${t.file} 내용이 없다`)
    const m = t.re.exec(src)
    if (!m) throw new Error(`${t.file} 에서 버전 줄을 못 찾았다 — 형식이 바뀌었으면 TARGETS 를 고친다`)
    if (from === null) from = m[2]
    else if (m[2] !== from) throw new Error(`버전이 이미 어긋나 있다: ${t.file} 은 ${m[2]}, 앞 파일은 ${from}`)
    out[t.file] = src.replace(t.re, `$1${version}$3`)
  }
  return { texts: out, from }
}

/** CLI */
function main() {
  const kind = process.argv[2]
  if (!kind) { console.error('사용법: node tools/bump-version.mjs patch|minor|major|x.y.z'); process.exit(2) }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const texts = Object.fromEntries(TARGETS.map((t) => [t.file, readFileSync(join(root, t.file), 'utf8')]))
  const current = TARGETS[0].re.exec(texts['package.json'])[2]
  const version = nextVersion(current, kind)
  const { texts: next } = applyVersion(texts, version)
  for (const t of TARGETS) writeFileSync(join(root, t.file), next[t.file])
  console.log(`${current} → ${version}  (${TARGETS.map((t) => t.file).join(' · ')})`)
  console.log('npm test 로 다섯 곳이 같은지 확인한 뒤 커밋한다')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
