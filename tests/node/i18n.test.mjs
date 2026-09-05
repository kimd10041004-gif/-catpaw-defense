/**
 * 영어 지원 — 사전이 코드와 맞는지(도구가 센다), 번역 함수의 폴백·치환, 레지스트리 제자리 번역, 정적 HTML 번역.
 * 사전은 데이터라 문구가 늘면 검사도 저절로 는다: 감싸지 않은 한글 · 누락 · 미사용 · 자리표시자 · 값에 섞인 한글이 전부 0 이어야 한다.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanAll, tokenize, htmlKeys, FILES } from '../../tools/i18n-scan.mjs'
import { tr, fill, setLanguage, currentLanguage, resolveLanguage, locale, hasTranslation, localizeStatic, LANGUAGES } from '../../web/js/i18n/index.js'
import { EN } from '../../web/js/i18n/en.js'

test('resolveLanguage: 설정이 우선, auto 는 브라우저 언어, 모르면 한국어', () => {
  assert.equal(resolveLanguage('ko', 'en-US'), 'ko')
  assert.equal(resolveLanguage('en', 'ko-KR'), 'en')
  assert.equal(resolveLanguage('auto', 'ko-KR'), 'ko')
  assert.equal(resolveLanguage('auto', 'ko'), 'ko')
  assert.equal(resolveLanguage('auto', 'en-GB'), 'en')
  assert.equal(resolveLanguage('auto', 'ja-JP'), 'en')      // 한국어가 아니면 영어 — 사전이 둘뿐이다
  assert.equal(resolveLanguage('auto', ''), 'ko')
  assert.equal(resolveLanguage(undefined, undefined), 'ko')
  assert.equal(resolveLanguage('zz', 'en'), 'en')            // 모르는 설정값은 auto 취급
  assert.deepEqual(LANGUAGES, ['ko', 'en'])
})

test('tr: 사전에 없으면 원문 · {자리} 치환 · 함수 값 · 언어 전환', () => {
  setLanguage('ko')
  assert.equal(currentLanguage(), 'ko')
  assert.equal(locale(), 'ko-KR')
  assert.equal(tr('없는 문구다'), '없는 문구다')
  assert.equal(tr('웨이브 {n} 시작', { n: 3 }), '웨이브 3 시작')
  assert.equal(fill('{a}+{b}={c}', { a: 1, b: 2 }), '1+2={c}')   // 모르는 자리는 그대로 — 검사가 잡는다
  assert.equal(setLanguage('en'), 'en')
  assert.equal(locale(), 'en-US')
  assert.equal(tr('설정'), 'Settings')
  assert.equal(tr('없는 문구다'), '없는 문구다')                 // 정직한 폴백 — 빈 칸도 키 이름도 아니다
  assert.equal(tr('{v}판', { v: 1 }), '1 run')                   // 함수 값 — 복수형
  assert.equal(tr('{v}판', { v: 4 }), '4 runs')
  assert.equal(tr('캣닢 부족 ({catnip}/{price})', { catnip: 3, price: 120 }), 'Not enough catnip (3/120)')
  assert.ok(hasTranslation('설정'))
  assert.ok(!hasTranslation('없는 문구다'))
  assert.equal(setLanguage('xx'), 'ko')                          // 모르는 언어는 한국어
  setLanguage('ko')
})

test('tokenize: 주석 · 정규식 · 템플릿 ${ } 안의 문자열을 구분하고 tr( 로 감쌌는지 안다', () => {
  const src = [
    "const a = '가' // '나'",
    "/* '다' */ const r = /'[가-힣]/g; tr('라'); tr( '마' )",
    "const t = `바 ${x ? '사' : 'z'} 아`",
    'const u = `자`',
    "str('차')",
  ].join('\n')
  const toks = tokenize(src)
  const texts = toks.map((t) => `${t.kind}:${t.text}:${t.wrapped ? 'W' : '-'}:${t.line}`)
  assert.deepEqual(texts, [
    // 템플릿 토큰이 그 안의 문자열보다 앞이다(시작 위치 순)
    'str:가:-:1', 'str:라:W:2', 'str:마:W:2', 'tpl:바 ${…} 아:-:3', 'str:사:-:3', 'str:z:-:3', 'str:자:-:4', 'str:차:-:5',
  ])
})

test('htmlKeys: data-i18n 텍스트(아이콘 제외) · data-i18n-attr 속성 · <title>', () => {
  const html = `<title>캣포 디펜스</title>
<button id="b" data-i18n><svg class="i"><use href="#x"/></svg>도감</button>
<h1 class="title" data-i18n>캣포 디펜스</h1>
<h1 class="other">아님</h1>
<div title="목숨" data-i18n-attr="title" aria-label="x"></div>
<button title="일시정지" aria-label="일시정지" data-i18n-attr="title,aria-label"></button>`
  const keys = htmlKeys(html).map((k) => `${k.line}:${k.key}`)
  assert.deepEqual(keys, ['2:도감', '3:캣포 디펜스', '5:목숨', '6:일시정지', '6:일시정지', '1:캣포 디펜스'])
})

test('사전: 감싸지 않은 한글 0 · 템플릿 0 · 누락 0 · 미사용 0 · 자리표시자 일치 · 값에 한글 없음', async () => {
  const r = await scanAll({ dict: EN })
  assert.ok(FILES.wrap.length + FILES.key.length >= 13, '스캔 파일 목록이 비었다')
  for (const [kind, list] of Object.entries(r.problems)) {
    assert.deepEqual(list.slice(0, 20), [], `${kind} ${list.length}건`)
  }
  assert.ok(r.keys >= 340, `사전 키 ${r.keys}개`)
})

test('사전 값은 문자열 아니면 함수, 함수는 문장을 돌려준다', () => {
  for (const [k, v] of Object.entries(EN)) {
    assert.ok(typeof v === 'string' || typeof v === 'function', k)
    if (typeof v === 'function') assert.equal(typeof v({ v: 2, count: 2, v2: 2, mapName: 'm' }), 'string', k)
  }
})

test('registry.localizeAll: 이름·설명·챕터 제목·컷신 대사를 제자리에서 바꾸고 개수를 센다', async () => {
  await import('../../web/js/content/index.js')
  const reg = await import('../../web/js/content/registry.js')
  const before = reg.getTower('cheese').name
  const n = reg.localizeAll((s) => `[${s}]`)
  assert.ok(n > 300, `바꾼 문구 ${n}개`)
  assert.equal(reg.getTower('cheese').name, `[${before}]`)
  assert.ok(reg.getEnemy('mouse').desc.startsWith('['))
  assert.ok(reg.listChapters()[0].title.startsWith('['))
  assert.ok(reg.listChapters()[0].intro[0].text.startsWith('['))
  assert.ok(reg.listSkins()[0].name.startsWith('['))
  assert.ok(reg.listChallenges()[0].name.startsWith('['))
  // 두 번째 호출 — 이미 바뀐 문구는 그대로(사전에 없으면 원문을 돌려주는 tr 과 같은 계약)
  assert.equal(reg.localizeAll((s) => (s.startsWith('[') ? s : `[${s}]`)), 0)
})

test('localizeStatic: 텍스트 노드만 바꾸고 아이콘은 두며, 지정 속성과 title 을 번역한다', () => {
  const text = { nodeType: 3, data: '  설정 ' }
  const svg = { nodeType: 1 }
  const btn = { childNodes: [svg, text] }
  const back = { attrs: { 'aria-label': '뒤로', 'data-i18n-attr': 'aria-label' }, getAttribute(k) { return this.attrs[k] }, setAttribute(k, v) { this.attrs[k] = v } }
  const html = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v } }
  const doc = { title: '캣포 디펜스', documentElement: html, querySelectorAll: (sel) => (sel === '[data-i18n]' ? [btn] : [back]) }
  setLanguage('ko')
  assert.equal(localizeStatic(doc), 0)
  assert.equal(text.data, '  설정 ')
  setLanguage('en')
  assert.equal(localizeStatic(doc), 3)
  assert.equal(text.data, `  ${EN['설정']} `)
  assert.equal(back.attrs['aria-label'], EN['뒤로'])
  assert.equal(doc.title, EN['캣포 디펜스'])
  assert.equal(html.attrs.lang, 'en')
  setLanguage('ko')
})
