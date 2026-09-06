import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nextVersion, applyVersion, TARGETS } from '../../tools/bump-version.mjs'
import { APP_VERSION } from '../../web/js/version.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('nextVersion: patch / minor / major / 명시 버전', () => {
  assert.equal(nextVersion('1.0.0', 'patch'), '1.0.1')
  assert.equal(nextVersion('1.0.9', 'minor'), '1.1.0')
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0')
  assert.equal(nextVersion('1.0.0', '1.2.3'), '1.2.3')
})

test('nextVersion: 뒤로 가거나 형식이 틀리면 던진다', () => {
  assert.throws(() => nextVersion('1.2.3', '1.2.3'), /크지 않다/)
  assert.throws(() => nextVersion('1.2.3', '1.1.9'), /크지 않다/)
  assert.throws(() => nextVersion('1.2.3', '1.100.0'), /100 미만/)
  assert.throws(() => nextVersion('1.2.3', 'nope'), /patch \| minor \| major/)
  assert.throws(() => nextVersion('v1', 'patch'), /x\.y\.z/)
})

test('applyVersion: 다섯 파일의 버전 줄만 바꾸고 나머지는 그대로다', () => {
  const texts = {
    'package.json': '{\n  "name": "x",\n  "version": "1.0.0",\n  "type": "module"\n}\n',
    'web/js/version.js': "// v\nexport const APP_VERSION = '1.0.0'\n",
    'android/app/build.gradle.kts': 'val webDir = 1\nval appVersion = "1.0.0"\nfun f() {}\n',
    'web/sw.js': "const CACHE_VERSION = 'catpaw-v1.0.0'\nconst ASSETS = []\n",
    'site/index.html': '<footer>\n<p><span class="ver">v1.0.0</span></p>\n</footer>\n',
  }
  const { texts: out, from } = applyVersion(texts, '1.0.1')
  assert.equal(from, '1.0.0')
  assert.equal(out['package.json'], texts['package.json'].replace('1.0.0', '1.0.1'))
  assert.equal(out['web/js/version.js'], "// v\nexport const APP_VERSION = '1.0.1'\n")
  assert.equal(out['android/app/build.gradle.kts'], 'val webDir = 1\nval appVersion = "1.0.1"\nfun f() {}\n')
  assert.equal(out['web/sw.js'], "const CACHE_VERSION = 'catpaw-v1.0.1'\nconst ASSETS = []\n")
  assert.equal(out['site/index.html'], '<footer>\n<p><span class="ver">v1.0.1</span></p>\n</footer>\n')
  // 원본은 안 건드린다
  assert.match(texts['web/sw.js'], /1\.0\.0/)
})

test('applyVersion: 버전이 이미 어긋나 있거나 줄이 없으면 던진다 (조용히 반쪽만 올리지 않는다)', () => {
  const ok = {
    'package.json': '"version": "1.0.0"',
    'web/js/version.js': "export const APP_VERSION = '1.0.0'",
    'android/app/build.gradle.kts': 'val appVersion = "1.0.0"',
    'web/sw.js': "const CACHE_VERSION = 'catpaw-v1.0.0'",
    'site/index.html': '<span class="ver">v1.0.0</span>',
  }
  assert.throws(() => applyVersion({ ...ok, 'web/sw.js': "const CACHE_VERSION = 'catpaw-v1.0.3'" }, '2.0.0'), /어긋나/)
  assert.throws(() => applyVersion({ ...ok, 'web/sw.js': "const CACHE_VERSION = 'catpaw-v18'" }, '2.0.0'), /못 찾았다/)
  assert.throws(() => applyVersion({ ...ok, 'web/sw.js': undefined }, '2.0.0'), /내용이 없다/)
  assert.throws(() => applyVersion(ok, '2.0'), /x\.y\.z/)
})

test('TARGETS 의 정규식이 실제 파일에 정확히 한 번씩 맞고 전부 APP_VERSION 이다', () => {
  const texts = Object.fromEntries(TARGETS.map((t) => [t.file, readFileSync(join(root, t.file), 'utf8')]))
  for (const t of TARGETS) {
    const hits = texts[t.file].match(new RegExp(t.re.source, 'g')) || []
    assert.equal(hits.length, 1, `${t.file}: 버전 줄이 ${hits.length}번 맞는다`)
  }
  const { from } = applyVersion(texts, '9.9.9')
  assert.equal(from, APP_VERSION)
})
