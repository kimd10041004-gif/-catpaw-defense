import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const store = join(root, 'store')
const SHOTS = ['01-title', '02-battle', '03-boss', '04-result', '05-codex', '06-chapters', '07-challenges', '08-settings']

/** PNG 헤더에서 폭·높이 (IHDR 은 항상 16바이트 자리에 있다) */
function pngSize(file) {
  const b = readFileSync(file)
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} 은 PNG 가 아니다`)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

// Play 는 폰 스크린샷을 9:16(또는 16:9), 각 변 320~3840px 로 요구한다.
// 스모크 캡처(824×1830, 9:20)를 그대로 올리면 거부된다 — 그래서 별도 도구와 이 검사가 있다.
test('스토어 스크린샷 8장이 있고 전부 1080×1920 (9:16) 이다', () => {
  for (const s of SHOTS) {
    const f = join(store, `${s}.png`)
    assert.ok(existsSync(f), `${s}.png 가 없다 — node tools/store-assets.mjs`)
    const { w, h } = pngSize(f)
    assert.equal(`${w}×${h}`, '1080×1920', s)
    assert.ok(Math.abs(w / h - 9 / 16) < 0.001)
  }
})

test('기능 그래픽은 1024×500 이다', () => {
  const f = join(store, 'feature-graphic.png')
  assert.ok(existsSync(f), 'feature-graphic.png 가 없다')
  assert.deepEqual(pngSize(f), { w: 1024, h: 500 })
})
