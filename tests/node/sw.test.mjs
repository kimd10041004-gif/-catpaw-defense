import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const WEB = new URL('../../web/', import.meta.url).pathname

/** web/ 안의 실제 파일 목록 (재귀) */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(relative(WEB, full).split(sep).join('/'))
  }
  return out
}

/** sw.js 의 ASSETS 배열에 적힌 경로 */
function swAssets() {
  const src = readFileSync(join(WEB, 'sw.js'), 'utf8')
  const block = src.slice(src.indexOf('const ASSETS'), src.indexOf(']', src.indexOf('const ASSETS')))
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

test('서비스 워커가 모든 자바스크립트 모듈을 프리캐시한다 (오프라인 구동)', () => {
  const listed = new Set(swAssets())
  const missing = walk(WEB)
    .filter((f) => f.startsWith('js/') && f.endsWith('.js'))
    .filter((f) => !listed.has(f))

  assert.deepEqual(missing, [],
    `sw.js 의 ASSETS 에 빠진 파일이 있다 — 오프라인에서 게임이 부팅되지 않는다.\n`
    + `빠진 파일: ${missing.join(', ')}\n`
    + `web/sw.js 의 ASSETS 에 추가하고 CACHE_VERSION 을 올려야 한다.`)
})

test('서비스 워커가 없는 파일을 프리캐시하려 하지 않는다', () => {
  const actual = new Set(walk(WEB))
  const ghosts = swAssets().filter((a) => a !== './' && !actual.has(a))
  assert.deepEqual(ghosts, [],
    `sw.js 가 존재하지 않는 파일을 캐시하려 한다 — install 단계가 전부 실패한다: ${ghosts.join(', ')}`)
})

test('핵심 정적 파일도 목록에 있다', () => {
  const listed = new Set(swAssets())
  for (const f of ['index.html', 'css/style.css', 'manifest.webmanifest']) {
    assert.ok(listed.has(f), `${f} 가 sw.js ASSETS 에 없다`)
  }
})

test('서비스 워커가 프레임 아트를 프리캐시한다', () => {
  // 그림이 빠지면 오프라인에서 고양이만 벡터로 떨어진다. 게임은 돌지만
  // 온라인에서 본 것과 다른 그림이 나오므로 버그로 보인다.
  // .png 만 걸면 화면 배경(.jpg)이 이 그물을 통째로 빠져나간다 — ASSETS 에서
  // 빠뜨려도 아무도 못 잡는다. 확장자를 늘릴 때마다 여기도 같이 늘려야 한다.
  const listed = new Set(swAssets())
  const missing = walk(WEB)
    .filter((f) => f.startsWith('art/') && /\.(png|jpe?g)$/.test(f))
    .filter((f) => !listed.has(f))

  assert.deepEqual(missing, [],
    `sw.js 의 ASSETS 에 빠진 그림이 있다 — 오프라인에서 벡터로 떨어진다.\n`
    + `빠진 파일: ${missing.join(', ')}\n`
    + `web/sw.js 의 ASSETS 에 추가하고 CACHE_VERSION 을 올려야 한다.`)
})
