/**
 * 원정 사다리 — 구조 검사와 "사다리마다 측정 파일이 있다".
 *
 * 판을 실제로 돌리는 검사(첫 칸 · 룬의 효과 · 도배 · 끝 · 순서)는 `lib/expedition.mjs` 의 `runLadderTests(id)` 가
 * 사다리마다 한 파일씩(`balance-sim-expedition.<id>.test.mjs`) 등록한다 — U-3 에서 파일 단위 병렬을 위해 나눴다.
 * 그래서 새 사다리를 등록하고 측정 파일을 안 만들면 여기서 빨개진다 — 안 재는 사다리는 주장이 아니다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../../web/js/content/index.js'
import { listExpeditions } from '../../web/js/content/registry.js'

test('원정: 칸이 여섯 속성을 전부 쓴다 (도배에 약점을 만드는 구조 조건)', () => {
  for (const exp of listExpeditions()) {
    assert.equal(new Set(exp.stages.map((s) => s.element)).size, 6, `${exp.name}`)
  }
})

test('원정: 사다리마다 측정 파일이 있다 (새 사다리를 넣고 안 재는 일이 없게)', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  for (const exp of listExpeditions()) {
    const file = `balance-sim-expedition.${exp.id}.test.mjs`
    assert.ok(existsSync(join(dir, file)),
      `${exp.name}(${exp.id}): tests/node/${file} 이 없다 — import { runLadderTests } from './lib/expedition.mjs'; runLadderTests('${exp.id}') 두 줄이면 된다`)
  }
})
