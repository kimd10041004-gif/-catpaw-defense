#!/usr/bin/env node
/**
 * `npm test` — node 의 내장 테스트 러너를 **코어 수만큼** 병렬로 돌린다.
 *
 * node --test 의 기본 병렬도는 `availableParallelism() - 1` 이다(주 프로세스 몫을 하나 남긴다). 그런데 주 프로세스는
 * 결과를 받아 적을 뿐이라 놀고, 이 저장소의 검사는 밸런스 시뮬레이션이 대부분이라 CPU 가 곧 시간이다.
 * 4코어에서 3 → 4 는 그대로 25% 다. 사람이 고쳐 쓸 것은 없다 — 코어 수를 읽어서 넘긴다.
 *
 * U-3 (2026-09) 시간, 이 개발 세션의 4코어 기준 (`npm test` 전체 · 674개):
 *   전:  88초 — balance-sim.test 한 파일이 105초 CPU 라 혼자 남아 돌았다
 *   후:  54초 — 셋을 같이 했다. 시뮬레이터 최적화(mods.js matchCombo 가지치기 · game.js loadout 기억 · 봇이
 *        쿨다운·마나로 거르기 — 덱 봇 한 판이 52% 빨라졌고 결과는 바이트 단위로 같다, tools/balance-sim 지문 대조)
 *        + 무거운 파일 분할(밸런스 셋 · 원정 사다리마다 하나) + 병렬도 3 → 4.
 *   목표는 절반(44초)이었다. 남은 차이는 CPU 총량이다 — 판 수를 안 줄이는 한 더 줄이려면 시뮬레이터가 더 빨라져야 한다.
 *   (U-3 커밋 메시지의 "파티클은 시드 난수를 같이 쓴다"는 틀렸다 — spawnParticle 은 Math.random 을 쓴다. 헤드리스에서
 *   연출을 건너뛰면 결과는 그대로이고 몇 % 더 줄일 수 있다. 다만 프로파일에서 연출은 3% 안팎이라 아직 안 했다.)
 *
 * 인자는 그대로 넘어간다: `npm test -- --test-name-pattern=밸런스`.
 */
import { spawn } from 'node:child_process'
import { availableParallelism } from 'node:os'

const workers = Math.max(1, availableParallelism())
const args = ['--test', '--test-reporter=tap', `--test-concurrency=${workers}`, ...process.argv.slice(2), 'tests/node/**/*.test.mjs']
const child = spawn(process.execPath, args, { stdio: 'inherit' })
child.on('exit', (code, signal) => { process.exit(signal ? 1 : (code ?? 1)) })
