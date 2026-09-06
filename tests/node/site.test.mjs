/**
 * 공식 사이트(`site/`)가 깨진 채로 배포되지 않게.
 *
 * 사이트는 손으로 쓴 정적 HTML 이라 컴파일러가 없다. 그래서 사람이 놓치기 쉬운 것만 기계가 본다:
 * **참조한 그림이 실제로 있나 · 다운로드 링크가 고정 주소인가 · 버전이 다른 곳과 같나.**
 * (링크가 살아 있는지는 여기서 못 본다 — 네트워크가 필요하다. 배포 뒤 `curl` 로 따로 확인한다.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SITE_SHOTS, miniMarkdown, findPlaceholders } from '../../tools/site-build.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const html = readFileSync(join(root, 'site/index.html'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('사이트: 참조한 그림이 전부 실제로 있다', () => {
  const srcs = [...html.matchAll(/(?:src|href)="(img\/[^"]+)"/g)].map((m) => m[1])
  assert.ok(srcs.length >= SITE_SHOTS.length + 1, `참조한 그림 ${srcs.length}개 — 너무 적다`)
  for (const src of new Set(srcs)) {
    assert.ok(existsSync(join(root, 'site', src)),
      `${src} 가 없다 — \`node tools/site-build.mjs\` 를 돌리고 커밋했는가`)
  }
})

test('사이트: 스크린샷 여덟 장을 다 건다', () => {
  for (const name of SITE_SHOTS) {
    assert.ok(html.includes(`img/${name}.png`), `${name} 이 사이트에 안 걸려 있다`)
  }
})

test('사이트: 다운로드 링크가 버전 안 박힌 고정 주소다', () => {
  /* 버전이 박힌 주소를 걸면 버전을 올릴 때마다 사이트의 다운로드가 죽는다.
   * release.yml 이 `catpaw-defense-latest.apk` 별칭을 같이 올리는 이유다. */
  const m = /href="(https:\/\/github\.com\/[^"]*\.apk)"/.exec(html)
  assert.ok(m, '다운로드 링크가 없다')
  assert.ok(m[1].endsWith('/catpaw-defense-latest.apk'),
    `버전이 박힌 주소다: ${m[1]} — release.yml 의 별칭(latest)을 걸어야 한다`)
})

test('사이트: 버전이 package.json 과 같다', () => {
  const m = /<span class="ver">v(\d+\.\d+\.\d+)<\/span>/.exec(html)
  assert.ok(m, '푸터에 버전이 없다 — bump-version.mjs 의 TARGETS 형식과 맞춰야 한다')
  assert.equal(m[1], pkg.version, 'site/index.html 의 버전이 package.json 과 다르다 (bump-version.mjs 로 함께 올린다)')
})

test('사이트: 안드로이드만이라는 것과 결제가 진짜가 아니라는 것을 숨기지 않는다', () => {
  // 약속을 코드가 지킨다 — README·상점 머리말과 같은 원칙(content.test 의 "유료가 무료를 잠그지 않는다"와 같은 결).
  assert.ok(/아이폰용 앱은 없다/.test(html), '아이폰이 없다는 사실이 사이트에 없다')
  assert.ok(/정직하게 실패한다/.test(html), '결제가 아직 진짜가 아니라는 사실이 사이트에 없다')
})

test('개인정보처리방침: 자리표시자가 남아 있으면 사이트로 안 나간다', () => {
  /* [연락처]·[출시일] 이 안 채워진 방침을 올리는 것보다 없는 게 낫다 — Play 도 연락처 없는 방침은 거부한다.
   * 지금은 실제로 비어 있고, 그래서 site/privacy.html 도 없다. 연락처가 정해지면 이 검사가 저절로 뒤집힌다. */
  const md = readFileSync(join(root, 'docs/개인정보처리방침.md'), 'utf8')
  const holes = findPlaceholders(md)
  if (holes.length > 0) {
    assert.ok(!existsSync(join(root, 'site/privacy.html')),
      `방침에 ${holes.join(' ')} 가 비었는데 site/privacy.html 이 있다 — 지우거나 자리를 채운다`)
    assert.ok(!/privacy\.html/.test(html), '방침이 미완인데 사이트가 링크하고 있다')
  } else {
    assert.ok(existsSync(join(root, 'site/privacy.html')),
      '방침이 다 채워졌다 — `node tools/site-build.mjs --privacy` 로 만들어 커밋한다')
  }
})

test('개인정보처리방침 변환기: 제목·표·목록·링크를 HTML 로 바꾼다', () => {
  const out = miniMarkdown([
    '# 제목',
    '',
    '본문 **굵게** 와 [링크](https://example.com).',
    '',
    '| 항목 | 값 |',
    '|---|---|',
    '| 가 | 나 |',
    '',
    '- 하나',
    '- 둘',
  ].join('\n'))
  assert.match(out, /<h1>제목<\/h1>/)
  assert.match(out, /<strong>굵게<\/strong>/)
  assert.match(out, /<a href="https:\/\/example\.com">링크<\/a>/)
  assert.match(out, /<th>항목<\/th><th>값<\/th>/)
  assert.match(out, /<td>가<\/td><td>나<\/td>/)
  assert.match(out, /<ul>\n<li>하나<\/li>\n<li>둘<\/li>\n<\/ul>/)
  assert.ok(!/---/.test(out), '표 구분선이 그대로 남았다')
})

test('개인정보처리방침 변환기: HTML 을 이스케이프한다', () => {
  const out = miniMarkdown('본문 <script>alert(1)</script> 끝')
  assert.ok(!/<script>/.test(out), '태그가 그대로 들어갔다')
  assert.match(out, /&lt;script&gt;/)
})

test('자리표시자 찾기: 링크는 자리표시자가 아니다', () => {
  assert.deepEqual(findPlaceholders('시행일: [출시일]\n문의: [연락처]'), ['[출시일]', '[연락처]'])
  assert.deepEqual(findPlaceholders('[확장가이드](docs/확장가이드.md) 참고'), [])
  assert.deepEqual(findPlaceholders('시행일: 2026-09-06'), [])
})
