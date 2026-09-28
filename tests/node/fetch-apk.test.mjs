/**
 * `tools/fetch-apk.mjs` — Vercel 빌드가 APK 를 사이트에 넣는 스크립트.
 *
 * 왜 검사가 필요한가: 이 스크립트는 **여기서 실제로 못 돌려 본다.** 이 세션의 프록시가 api.github.com 을
 * 익명으로는 403, 세션 토큰으로는 401 로 막는다. 그래서 네트워크 없이 로직만 본다 — fetch 를 가짜로 바꿔서.
 * 지키는 것: 자산을 찾아 그대로 쓴다 · 잘린 파일은 거부한다 · 자산이 없으면 던진다 · 토큰 거부(401)는
 * 토큰 없음과 다른 말로 던진다 · 저장소를 모르면 던진다. 죽은 다운로드 버튼을 올리는 길을 전부 막는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { fetchApk } from '../../tools/fetch-apk.mjs'

const BYTES = Buffer.from('not-really-an-apk-but-bytes-are-bytes')
const release = (assets) => ({ ok: true, status: 200, json: async () => ({ assets }) })
const asset = (over = {}) => ({ name: 'catpaw-defense-latest.apk', size: BYTES.length, url: 'https://api.example/asset/1', ...over })

/** fetch 를 갈아 끼우고 호출 기록을 남긴다 */
function fakeFetch(onRelease, onAsset) {
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), headers: opts.headers })
    return String(url).includes('/releases/tags/') ? onRelease() : onAsset()
  }
  return calls
}
const realFetch = globalThis.fetch
test.afterEach(() => { globalThis.fetch = realFetch })

test('fetch-apk: 릴리스에서 자산을 찾아 그대로 쓴다', async () => {
  const calls = fakeFetch(() => release([asset()]), () => ({ ok: true, status: 200, arrayBuffer: async () => BYTES }))
  const out = mkdtempSync(join(tmpdir(), 'catpaw-apk-'))
  const r = await fetchApk({ repo: 'o/r', token: 'tok', outDir: out })
  assert.equal(r.size, BYTES.length)
  assert.deepEqual(readFileSync(r.out), BYTES, '받은 바이트가 그대로 안 쓰였다')
  assert.ok(calls[0].url.endsWith('/repos/o/r/releases/tags/dev'), `릴리스 주소가 틀렸다: ${calls[0].url}`)
  assert.equal(calls[0].headers.Authorization, 'Bearer tok', '토큰이 헤더로 안 갔다')
  assert.equal(calls[1].headers.Accept, 'application/octet-stream', '자산 본문은 octet-stream 을 요구해야 온다')
})

test('fetch-apk: 잘린 파일은 거부한다 (크기가 릴리스와 다르면 안 쓴다)', async () => {
  fakeFetch(() => release([asset({ size: BYTES.length + 7 })]), () => ({ ok: true, status: 200, arrayBuffer: async () => BYTES }))
  await assert.rejects(fetchApk({ repo: 'o/r', outDir: mkdtempSync(join(tmpdir(), 'catpaw-apk-')) }), /잘린 파일/)
})

test('fetch-apk: 자산이 없으면 던진다 (release.yml 이 별칭을 안 올렸을 때)', async () => {
  fakeFetch(() => release([asset({ name: 'catpaw-defense-1.0.0-release.apk' })]), () => { throw new Error('여기 오면 안 된다') })
  await assert.rejects(fetchApk({ repo: 'o/r', outDir: tmpdir() }), /별칭을 안 올렸다/)
})

test('fetch-apk: 토큰이 거부된 것(401)과 토큰이 없는 것을 다른 말로 던진다', async () => {
  fakeFetch(() => ({ ok: false, status: 401 }), () => null)
  await assert.rejects(fetchApk({ repo: 'o/r', token: 'bad', outDir: tmpdir() }), /토큰이 거부됐다/)
  // `token: undefined` 로는 안 된다 — 기본값 인자가 그 자리에 process.env.GH_TOKEN 을 넣는다(이 세션에는 그게 있다).
  // 빈 문자열이 "토큰 없음"이다.
  fakeFetch(() => ({ ok: false, status: 404 }), () => null)
  await assert.rejects(fetchApk({ repo: 'o/r', token: '', outDir: tmpdir() }), /GH_TOKEN 이 필요하다/)
})

test('fetch-apk: 저장소를 모르면 던진다 — 코드에 계정 이름을 안 적으므로 환경이 줘야 한다', async () => {
  fakeFetch(() => { throw new Error('여기 오면 안 된다') }, () => null)
  await assert.rejects(fetchApk({ repo: null, outDir: tmpdir() }), /저장소를 모른다/)
})
