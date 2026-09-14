/**
 * 스토어 등록 문안(`docs/스토어-등록문안.md`)이 코드와 어긋나지 않게.
 *
 * 스토어 설명은 손으로 쓴 글이라 코드가 바뀌어도 아무도 모른다. 그래서 **숫자와 약속만** 기계가 본다:
 *   · 뽑기 확률 — `gacha.js` 의 `disclosureRows()` 가 게임 화면에 그리는 값과 같은 문자열이 있어야 한다.
 *     한국 게임산업법이 요구하는 건 "표를 띄워라"가 아니라 **띄운 값이 실제 값**이어야 한다는 것이다 — 스토어도 같다
 *   · 뽑기 비용과 10연 보장
 *   · 상품 8개의 sku — Play Console 상품 ID 와 같아야 하는 값이다
 *   · 무료 범위 약속 — README 의 문장 **그대로**. 두 글이 다르면 어느 쪽이 약속인지 모르게 된다
 *   · 짧은 설명 80자 상한
 *   · 약속의 **숫자**(자유 맵 n · 도전 n) — 레지스트리에서 센 값과 같아야 한다. '6맵 · 도전 5종'은 2026-09-05 에
 *     적힌 뒤 하루 만에 틀렸고(유리 온실 · J-4 의 무료 도전 둘) 아홉 곳에 그대로 복사돼 있었다 — 스토어까지 갈 뻔했다
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../../web/js/content/index.js'
import { disclosureRows, DRAW_COST_CATNIP, DRAW10_COST_CATNIP, PITY_AT } from '../../web/js/domain/gacha.js'
import { IAP_PRODUCTS } from '../../web/js/domain/shop.js'
import { listMaps, listChallenges } from '../../web/js/content/registry.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const md = readFileSync(join(root, 'docs/스토어-등록문안.md'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

test('스토어 문안: 뽑기 확률이 게임이 공개하는 값과 같다', () => {
  for (const row of disclosureRows()) {
    assert.ok(md.includes(row.percent), `${row.name} ${row.percent} 가 문안에 없다 — gacha.js 가 바뀌었으면 문안도 고친다`)
  }
  assert.ok(md.includes(`${DRAW_COST_CATNIP} 캣닢`), `1회 비용 ${DRAW_COST_CATNIP} 이 문안에 없다`)
  assert.ok(md.includes(`${DRAW10_COST_CATNIP} 캣닢`), `10연 비용 ${DRAW10_COST_CATNIP} 이 문안에 없다`)
  assert.equal(PITY_AT, 10, '10연 보장이 10 이 아니게 됐다 — 문안의 "10연은 상위 등급을 하나 보장" 을 고친다')
})

test('스토어 문안: 상품 8개의 sku 가 전부 있다', () => {
  const skus = IAP_PRODUCTS.map((p) => p.sku)
  assert.equal(skus.length, 8, `상품이 ${skus.length}개다 — 문안의 표를 맞춘다`)
  for (const sku of skus) assert.ok(md.includes(`\`${sku}\``), `${sku} 가 문안의 상품 표에 없다`)
  // 제출팩 §3 도 같은 표를 든다 — 2026-09-06 부터 Play 에 넣을 '상품 ID' 자리에 앱 안 이름(`id`)을 적고 있었다
  const pack = readFileSync(join(root, 'docs/플레이콘솔-제출팩.md'), 'utf8')
  for (const sku of skus) assert.ok(pack.includes(`| \`${sku}\` |`), `${sku} 가 제출팩 §3 의 상품 표에 없다 — Play Console 에는 sku 를 넣는다`)
  for (const p of IAP_PRODUCTS) assert.ok(!pack.includes(`| \`${p.id}\` |`), `제출팩 §3 이 앱 안 이름 ${p.id} 를 상품 ID 로 적고 있다`)
})

test('스토어 문안: 무료 범위 약속이 README 와 글자 그대로 같다', () => {
  const m = /\*\*무료 범위 \(약속\)\*\*: ([^\n]+)\n([^\n]+)\n\*\*유료\*\*: ([^\n]+)/.exec(readme)
  assert.ok(m, 'README 에서 무료 범위 약속 문장을 못 찾았다 — 형식이 바뀌었으면 이 검사를 맞춘다')
  for (const line of [m[1], m[2], m[3]]) {
    assert.ok(md.includes(line), `README 의 약속 문장이 문안에 그대로 없다:\n  ${line}`)
  }
})

test('약속의 숫자는 손으로 센 값이 아니다 — 자유 맵 수·무료 도전 수가 레지스트리와 같다', () => {
  const m = /\*\*무료 범위 \(약속\)\*\*: 자유 모드 (\d+)맵 · [^\n]*?도전 (\d+)종/.exec(readme)
  assert.ok(m, 'README 의 약속 문장에서 맵 수·도전 수를 못 읽었다')
  const maps = listMaps().length
  const free = listChallenges().filter((c) => !c.pack).length
  assert.equal(Number(m[1]), maps, `README 는 자유 모드 ${m[1]}맵이라는데 실제 자유 맵은 ${maps}개다`)
  assert.equal(Number(m[2]), free, `README 는 도전 ${m[2]}종이라는데 팩 없는 도전은 ${free}개다`)
  // 게임 안 상점 안내와 영어 사전도 같은 숫자를 말해야 한다 (스토어 문안은 위 검사가 README 와 글자 그대로 맞춘다)
  const ui = readFileSync(join(root, 'web/js/ui.js'), 'utf8')
  const en = readFileSync(join(root, 'web/js/i18n/en.js'), 'utf8')
  assert.ok(ui.includes(`자유 모드 ${maps}맵 · 1~2막 · 도전 ${free}종`), '상점의 무료 범위 안내가 레지스트리와 다르다 (ui.js)')
  assert.ok(en.includes(`${maps} free-mode maps · Acts 1–2 · ${free} challenges`), '영어 사전의 무료 범위 안내가 레지스트리와 다르다 (en.js)')
  // 같은 문장을 복사해 둔 문서 셋 — 맵 수만 본다(도전 수는 제출팩에 '도전 팩 2 = 5종' 행이 있어 문서에서는 못 센다)
  for (const doc of ['docs/실기기설치.md', 'docs/아이폰.md', 'docs/플레이콘솔-제출팩.md']) {
    const t = readFileSync(join(root, doc), 'utf8')
    for (const [, n] of t.matchAll(/자유 모드 (\d+)맵/g)) assert.equal(Number(n), maps, `${doc} 가 자유 모드 ${n}맵이라고 한다 — 실제 ${maps}`)
  }
})

test('스토어 문안: 짧은 설명이 80자를 안 넘는다', () => {
  const rows = [...md.matchAll(/^\| (한국어|English) \| (\d+) \| (.+?) \|$/gm)]
  assert.equal(rows.length, 2, '짧은 설명 표가 두 줄(한국어·English)이 아니다')
  for (const [, lang, claimed, text] of rows) {
    const n = [...text.trim()].length
    assert.ok(n <= 80, `${lang} 짧은 설명이 ${n}자 — 80자를 넘는다`)
    assert.equal(n, Number(claimed), `${lang} 짧은 설명의 글자 수 표기(${claimed})가 실제(${n})와 다르다`)
  }
})
