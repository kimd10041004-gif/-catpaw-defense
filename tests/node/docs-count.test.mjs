/**
 * **문서가 말하는 개수는 레지스트리에서 센 값이어야 한다.**
 *
 * `store-listing.test` 가 이미 '자유 맵 수 · 무료 도전 수'를 이렇게 지킨다. 이 파일은 같은 그물을
 * 나머지 개수로 넓힌 것이다 — V 에서 이런 것들이 한꺼번에 나왔다:
 *
 *   · README·속성과카드·확장가이드 여섯 곳이 **"사다리 셋"** 이라고 했다. U-4 에서 넷이 된 지 한나절 뒤였다
 *   · README 가 **"시나리오 18장"** 이라고 했다. 두 줄 아래에서는 25~30장 얘기를 하고 있었다
 *   · 확장가이드 §6 의 웨이브셋 표에 **12개**만 있었다. 실제 등록은 17개 (3막 둘 · 온실 · 4막 둘이 빠졌다)
 *   · README 가 **"프레임 아트 스트립 29장"** 이라고 했다. 실제 `web/art/` 는 50장
 *
 * 전부 "그때는 맞았던 숫자"다. 세는 사람이 없으면 콘텐츠가 늘 때마다 조용히 틀린다.
 *
 * ── 안 세는 것 ─────────────────────────────────────────────────────────────
 * 번들 크기와 모듈 수는 여기서 안 본다. `tools/bundle.mjs` 를 실제로 돌려야 나오는 값이라
 * 검사에 넣으면 `npm test` 가 10초 이상 늘어난다(U-3 이 줄인 만큼을 도로 쓴다). 대신 **README 에서
 * 그 숫자를 지웠다** — 도구가 돌 때마다 마지막 줄에 찍으므로 손으로 적을 이유가 없다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../../web/js/content/index.js'
import {
  listExpeditions, listChapters, listWaveSets, listTowers, listSpecials,
} from '../../web/js/content/registry.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const readme = read('README.md')
const guide = read('docs/확장가이드.md')
const cards = read('docs/속성과카드.md')

/** 한국어 수사 — 문서가 "사다리 넷" 처럼 쓴다 */
const WORDS = ['영', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열']

test('문서: README 의 원정 사다리 수가 등록된 수와 같다', () => {
  const n = listExpeditions().length
  const m = /\*\*사다리 (\S+?)\*\*\(([^)]+)\)/.exec(readme)
  assert.ok(m, 'README 의 속성 원정 줄에서 "**사다리 X**(…)" 를 못 찾았다 — 형식이 바뀌었으면 이 검사를 맞춘다')
  assert.equal(m[1], WORDS[n], `README 는 사다리 ${m[1]}이라는데 등록된 사다리는 ${n}개다`)
  // 괄호 안의 이름 목록도 같은 수여야 한다 — 수사만 고치고 이름을 안 넣은 채 넘어가는 것을 막는다
  const named = m[2].split('→').length
  assert.equal(named, n, `README 가 사다리 이름을 ${named}개만 적었다 — 등록은 ${n}개다`)
  for (const exp of listExpeditions()) {
    assert.ok(readme.includes(exp.name), `README 의 사다리 목록에 '${exp.name}' 이 없다`)
  }
})

test('문서: 속성과카드의 사다리 표에 사다리마다 칸이 있다', () => {
  for (const exp of listExpeditions()) {
    assert.ok(cards.includes(exp.name), `docs/속성과카드.md 에 '${exp.name}' 이 없다 — 사다리를 더하면 표도 넓힌다`)
  }
  // "지금 밸런스" 표의 머리줄 — 사다리 수만큼 열이 있어야 한다
  const head = /### 지금 밸런스[^\n]*\n\n\| 덱 \|([^\n]*)\|\n/.exec(cards)
  assert.ok(head, '속성과카드의 "지금 밸런스" 표 머리줄을 못 찾았다')
  const cols = head[1].split('|').map((s) => s.trim()).filter(Boolean)
  assert.equal(cols.length, listExpeditions().length,
    `"지금 밸런스" 표가 ${cols.length}열인데 사다리는 ${listExpeditions().length}개다`)
})

test('문서: README 의 시나리오 장 수가 등록된 챕터 수와 같다', () => {
  const n = listChapters().length
  const m = /\*\*시나리오 (\d+)장/.exec(readme)
  assert.ok(m, 'README 에서 "**시나리오 N장" 을 못 찾았다')
  assert.equal(Number(m[1]), n, `README 는 시나리오 ${m[1]}장이라는데 등록된 챕터는 ${n}장이다`)
})

test('문서: 확장가이드 §6 의 웨이브셋 표가 등록된 셋을 전부 적는다', () => {
  const sec = /### 지금 등록된 것[^\n]*\n([\s\S]*?)\n### /.exec(guide)
  assert.ok(sec, '확장가이드의 웨이브셋 표("### 지금 등록된 것 …")를 못 찾았다')
  const listed = new Set([...sec[1].matchAll(/`([a-z][a-z0-9]*\d+)`/g)].map((x) => x[1]))
  const registered = listWaveSets().map((w) => w.id)
  for (const id of registered) {
    assert.ok(listed.has(id), `확장가이드 §6 의 표에 웨이브셋 '${id}' 이 없다 — 새 셋을 만들면 표에도 한 줄 적는다`)
  }
  for (const id of listed) {
    assert.ok(registered.includes(id), `확장가이드 §6 의 표가 등록되지 않은 웨이브셋 '${id}' 을 적고 있다`)
  }
})

test('문서: README 의 고양이·필살기 수가 레지스트리와 같다', () => {
  const towers = listTowers().length
  const specials = listSpecials().length
  const mt = /### 고양이 (\d+)종/.exec(readme)
  const ms = /### 필살기 (\d+)종/.exec(readme)
  assert.ok(mt && ms, 'README 에서 "### 고양이 N종" · "### 필살기 N종" 제목을 못 찾았다')
  assert.equal(Number(mt[1]), towers, `README 는 고양이 ${mt[1]}종이라는데 등록은 ${towers}종이다`)
  assert.equal(Number(ms[1]), specials, `README 는 필살기 ${ms[1]}종이라는데 등록은 ${specials}종이다`)
})

test('문서: README 의 프레임 아트 장 수가 web/art 의 파일 수와 같다', () => {
  const n = readdirSync(join(root, 'web/art')).filter((f) => f.endsWith('.png')).length
  const m = /프레임 아트 스트립 (\d+)장/.exec(readme)
  assert.ok(m, 'README 의 폴더 설명에서 "프레임 아트 스트립 N장" 을 못 찾았다')
  assert.equal(Number(m[1]), n, `README 는 아트 ${m[1]}장이라는데 web/art 의 png 는 ${n}장이다`)
})
