/**
 * 공식 사이트(`site/`)가 깨진 채로 배포되지 않게.
 *
 * 사이트는 손으로 쓴 정적 HTML 이라 컴파일러가 없다. 그래서 사람이 놓치기 쉬운 것만 기계가 본다:
 * **참조한 그림이 실제로 있나 · 다운로드 링크가 고정 주소인가 · 버전이 다른 곳과 같나.**
 * (링크가 살아 있는지는 여기서 못 본다 — 네트워크가 필요하다. 배포 뒤 `curl` 로 따로 확인한다.)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SITE_SHOTS, miniMarkdown, findPlaceholders } from '../../tools/site-build.mjs'
import { FULL_APP_URL } from '../../web/js/build.js'

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

test('사이트: 다운로드 링크가 버전 안 박힌 고정 주소이고, 사이트 밖으로 안 나간다', () => {
  /* 버전이 박힌 주소를 걸면 버전을 올릴 때마다 사이트의 다운로드가 죽는다.
   * release.yml 이 `catpaw-defense-latest.apk` 별칭을 같이 올리는 이유다.
   *
   * **사이트 밖으로 안 나가는 것도 같이 못 박는다 (R).** 전에는 이 버튼이 GitHub 릴리스를
   * 가리켰는데, 사이트에서 가장 많이 눌리는 버튼이라 누르는 순간 주소창에 계정 이름이 떴다.
   * 주소창을 도메인으로 가려 놔도 이 버튼 하나로 도로 새기 때문에 검사로 막는다.
   * APK 는 `pages.yml` 이 배포 직전에 받아 site/ 에 같이 올린다. */
  const m = /id="download"[^>]*\shref="([^"]+)"/.exec(html)
  assert.ok(m, '다운로드 링크가 없다')
  assert.equal(m[1], 'catpaw-defense-latest.apk',
    `다운로드가 사이트 밖을 가리키거나 버전이 박혔다: ${m[1]}`)
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

test('사이트: 브라우저판(play/)을 걸고, 거기 없는 것을 숨기지 않는다', () => {
  /* 아이폰은 APK 를 못 깐다. 그래서 site/play/ 가 아이폰의 유일한 길이고, 링크가 빠지면 아이폰은 갈 곳이 없다.
   * 그 빌드에는 유료 콘텐츠가 없으므로(demo.test 가 구운 결과로 확인한다) 사이트가 그 사실을 적어야 한다 —
   * '앱은 없다'만 적고 브라우저판을 광고하면 반쪽짜리 정직이다. */
  assert.ok(/href="play\/"/.test(html), '브라우저판(play/) 링크가 없다 — 아이폰은 이 길뿐이다')
  assert.ok(/파일이 없다/.test(html), '데모에 유료 콘텐츠가 없다는 사실이 사이트에 없다')
  assert.ok(/홈 화면에 추가/.test(html), '아이폰에서 앱처럼 까는 방법이 사이트에 없다')
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

/* ──────────────────────────────────────────────────────────────────────────
 * 계정 이름이 받는 사람에게 새지 않는다 (R)
 *
 * 사용자가 **"주소가 너무 적나라하다"** 고 했다. 공식 사이트가
 * `https://<계정>.github.io/-catpaw-defense/` 라서 게임을 받는 사람이 주소창에서
 * 개인 아이디를 그대로 본다 — 그 아이디는 이메일 앞부분과 같다.
 *
 * 주소창 자체는 도메인을 사야 바뀐다(코드로는 못 한다). 코드가 할 수 있는 것은 둘이다:
 *   1. 주소를 **한 곳에만** 두어서 도메인이 오면 한 줄로 끝나게 한다
 *   2. 그 한 곳 말고 다른 데로 **다시 새지 않게** 막는다  ← 이 검사
 *
 * 계정 이름을 검사 파일에 그대로 적으면 그것도 새는 것이라, 주소에서 뽑아 쓴다.
 * ────────────────────────────────────────────────────────────────────────── */

/** 지금 사이트 주소의 호스트 앞부분 = GitHub 계정 이름. 도메인을 붙이면 이 값이 계정 이름이 아니게 되고,
 *  그때 아래 두 검사는 **저절로 더 세진다**(찾을 문자열이 없어지므로 0건이 된다). */
const ACCOUNT = new URL(FULL_APP_URL).hostname.split('.')[0]

/** 디렉터리를 훑어 텍스트 파일 경로를 낸다 (그림·소리는 건너뛴다) */
function walkText(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name)
    if (statSync(f).isDirectory()) walkText(f, out)
    else if (/\.(js|mjs|json|html|css|webmanifest|txt|md)$/.test(name)) out.push(f)
  }
  return out
}

test('주소: 게임(web/) 안에서 계정 이름은 FULL_APP_URL 한 곳에만 있다', () => {
  /* 줄 번호로 못 박으면 위 주석이 한 줄만 늘어도 빨개진다 — 파일과 횟수로 본다. */
  const counts = new Map()
  for (const f of walkText(join(root, 'web'))) {
    const n = readFileSync(f, 'utf8').split(ACCOUNT).length - 1
    if (n > 0) counts.set(relative(root, f).replaceAll('\\', '/'), n)
  }
  assert.deepEqual([...counts.entries()], [['web/js/build.js', 1]],
    `계정 이름이 FULL_APP_URL 말고 다른 곳에도 있다: ${[...counts].map(([f, n]) => `${f}(${n})`).join(' · ')}\n`
    + '주소는 build.js 한 곳에서만 온다 — 도메인을 붙일 때 한 줄로 끝나야 한다')
})

test('주소: 사이트에서 계정 이름은 GitHub 소스 링크에만 있다 (다운로드는 자기 주소를 쓴다)', () => {
  /* 받는 사람이 가장 많이 누르는 버튼이 다운로드다. 거기가 GitHub 을 가리키면
   * 주소창을 도메인으로 가려 놔도 그 한 번에 도로 샌다 — 그래서 그 버튼은 사이트가 직접 준다.
   * 남는 둘(설치 방법 · 소스와 이슈)은 **일부러** GitHub 으로 간다. 소스를 보러 가는 링크다. */
  for (const m of html.matchAll(new RegExp(`href="([^"]*${ACCOUNT}[^"]*)"`, 'g'))) {
    assert.ok(m[1].startsWith('https://github.com/'),
      `계정 이름이 GitHub 소스 링크가 아닌 곳에 있다: ${m[1]}`)
  }
  assert.ok(!/<a[^>]*id="download"[^>]*github\.com/.test(html),
    '다운로드 버튼이 GitHub 을 가리킨다 — 누르는 순간 주소창에 계정 이름이 뜬다')
})
