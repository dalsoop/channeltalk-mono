#!/usr/bin/env node
// 워크플로 실행 스모크 테스트 — syntax-check(node --check)가 못 잡는 *런타임* 에러를 잡는다.
// mock 하네스(agent/parallel/pipeline/log/phase/args)를 주입해 워크플로 본문을 실제로 끝까지 돌려보고,
// throw·undefined 참조·무한루프(타임아웃)를 검출한다. "잘 만듦"을 넘어 "실제로 도는가"의 결정적 게이트.
// 사용: node smoke_run.mjs <workflow.mjs>  → {ok:true} 또는 {ok:false,error}. 무한루프는 호출자가 타임아웃으로.
import fs from 'node:fs'

const file = process.argv[2]
if (!file) { console.log(JSON.stringify({ ok: false, error: 'no file' })); process.exit(2) }

// export 제거(모듈→함수 본문). meta 는 const 로.
const src = fs.readFileSync(file, 'utf8').replace(/^export\s+const\s+meta/m, 'const meta')

// mock 결과: 워크플로가 접근하는 필드에 그럴듯한 값(숫자/배열/객체/문자)을 돌려주는 Proxy.
const fake = () => new Proxy({}, {
  get(_, k) {
    if (k === 'then' || typeof k !== 'string') return undefined            // not thenable
    if (/cards|items|fixes|blockers|issues|steps|nodes|layers|variants|files|ranking|scenes|edits|points|hooks|instructions|patched_cards|fields/.test(k)) return []
    if (/score|weighted|count|round|reso|clarity|hook|fidelity|naturalness|accuracy|readability|best_q|winner|s1|s2|^V$|agent_score/.test(k)) return 8
    if (/verdict/.test(k)) return 'approve'
    if (/dims|sub|maker|review|judge|research|meta|spec|pkg|package/.test(k)) return {}
    return 't'
  },
})
const agent = async () => fake()
const parallel = async (thunks) => Promise.all((thunks || []).map((t) => (typeof t === 'function' ? t() : t)))
const pipeline = async (items, ...stages) => {
  let r = items || []
  for (const s of stages) r = await Promise.all((r || []).map((x, i) => s(x, x, i)))
  return r
}
const log = () => {}
const phase = () => {}
// 루프가 1회만 돌도록 max_rounds=1. args 는 JSON 문자열로 줘서 정규화 경로까지 실행.
const args = JSON.stringify({ topic: 'smoke', brief: { topic: 'smoke', points: ['p'], key_message: 'k' }, max_rounds: 1, cards: '5', gate: 9, srt_text: '1\n00:00:00,000 --> 00:00:02,000\n안녕\n' })

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
try {
  const body = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', src)
  await body(agent, parallel, pipeline, log, phase, args)
  console.log(JSON.stringify({ ok: true }))
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 200) }))
  process.exit(1)
}
