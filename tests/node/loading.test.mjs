import test from 'node:test'
import assert from 'node:assert/strict'
import { expect, finish, subscribe, whenComplete, snapshot, _reset } from '../../web/js/loading.js'

test.beforeEach(() => _reset())

test('등록한 만큼 finish 하면 완료 콜백이 정확히 한 번 돈다', () => {
  let n = 0
  whenComplete(() => { n += 1 })
  expect(3)
  finish(); finish()
  assert.equal(n, 0, '아직 하나 남았다')
  finish()
  assert.equal(n, 1)
  finish()   // 넘치게 불러도
  assert.equal(n, 1, '두 번 돌면 안 된다')
})

test('두 로더가 따로 등록해도 합을 다 채워야 완료다', () => {
  // framesets(23) 와 mapart(18) 가 각자 expect 를 부른다. 첫 로더가 등록한 직후
  // 완료가 조기 발화하면 두 번째 로더는 세지지 않는다.
  let n = 0
  whenComplete(() => { n += 1 })
  expect(2)
  expect(3)
  for (let i = 0; i < 4; i += 1) finish()
  assert.equal(n, 0)
  finish()
  assert.equal(n, 1)
  assert.deepEqual(snapshot(), { done: 5, total: 5, ratio: 1 })
})

test('finish 가 total 을 넘어도 done 은 total 에 고정된다', () => {
  expect(2)
  finish(); finish(); finish()
  assert.equal(snapshot().done, 2)
  assert.equal(snapshot().ratio, 1)
})

test('등록할 게 없으면 즉시 완료다 (Node 검사·그림 없는 빌드)', () => {
  let n = 0
  whenComplete(() => { n += 1 })
  assert.equal(n, 0, 'expect 도 finish 도 안 불렸으면 아직 아무 판단도 안 한다')
  expect(0)
  assert.equal(n, 1, '0개를 등록하는 순간 기다릴 게 없다')
  assert.equal(snapshot().ratio, 1)
})

test('subscribe 는 등록 즉시 현재값을 한 번 주고 그 뒤 매 변화마다 준다', () => {
  const seen = []
  expect(2)
  subscribe((s) => seen.push(`${s.done}/${s.total}`))
  finish()
  finish()
  assert.deepEqual(seen, ['0/2', '1/2', '2/2'])
})

test('이미 완료된 뒤 whenComplete 를 걸면 즉시 부른다', () => {
  expect(1); finish()
  let n = 0
  whenComplete(() => { n += 1 })
  assert.equal(n, 1)
})
