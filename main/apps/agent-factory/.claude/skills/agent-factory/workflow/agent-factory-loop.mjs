export const meta = {
  name: 'agent-factory-loop',
  description: '에이전트를 만드는 에이전트의 결정적 루프. brief→spec→generate(architect, maker)→inspect(inspector, 신선 checker, 6축 9/10 게이트)→keep-best→재생성. 생성물은 maker+checker(검사도구)+스키마+게이트 루프를 갖춘 패키지. 반환=패키지 manifest+ledger (디스크 쓰기·실측 검증은 호출자).',
  phases: [
    { title: 'Spec' },
    { title: 'Build' },
  ],
}

// args 는 런타임에서 JSON 문자열로 도착할 수 있다 → 항상 객체로 정규화
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()

// ── 바인딩 (A override) ──────────────────────────────
const BRIEF = A.brief || '한 줄 에이전트 요청'
const SPEC_IN = A.spec ? A.spec : null                 // 이미 구조화된 spec이면 Spec 단계 건너뜀
const MAX_ROUNDS = A.max_rounds || 4
const GATE = A.gate || 9.0                             // agent_score >=

// ── 스키마 ────────────────────────────────────────────────
const SPEC_SCHEMA = {
  type: 'object', required: ['name', 'purpose', 'maker', 'success_conditions', 'checkers'], additionalProperties: true,
  properties: {
    name: { type: 'string' }, purpose: { type: 'string' }, domain_ssot: { type: 'string' },
    maker: { type: 'object' },
    success_conditions: { type: 'array', items: { type: 'object' } },
    checkers: { type: 'array', items: { type: 'object' } },
    render_or_run: { type: 'string' }, max_rounds: { type: 'integer' },
  },
}
const PACKAGE_SCHEMA = {
  type: 'object', required: ['files'], additionalProperties: true,
  properties: {
    files: { type: 'array', items: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } } } },
    notes: { type: 'string' }, rewrite_note: { type: 'string' },
  },
}
const VERDICT_SCHEMA = {
  type: 'object', required: ['agent_score', 'dims', 'verdict'], additionalProperties: true,
  properties: {
    agent_score: { type: 'number' }, dims: { type: 'object' },
    verdict: { type: 'string', enum: ['ship', 'revise'] },
    blockers: { type: 'array', items: { type: 'object' } },
  },
}

// ── 역할 프롬프트 (정본: .claude/agents/agent-*.md 압축) ──
const specPrompt = (brief) =>
`너는 에이전트 공장의 spec 작성자다. 한 줄 요청을 maker→checker 에이전트 팀 spec으로 구조화한다(schemas/agent-spec).
요청: "${brief}"
- name(kebab 슬러그), purpose(한 줄), maker{role,input,output}.
- success_conditions[]: 이 산출이 '좋다'의 실측 조건 2~4개. 각 {name,metric,direction,gate}. 이게 곧 생성될 검사도구의 채점축이다.
- checkers[]: 그 조건을 다른 렌즈로 보는 신선 체커 2~3개. 각 {name(<x>-...-reviewer),lens}. maker는 절대 자기 채점 안 함.
- domain_ssot(있으면), render_or_run, max_rounds.
지어내기 금지·범위 정직. 출력: spec JSON만.`

const architectPrompt = (spec) =>
`너는 에이전트 공장의 아키텍트(maker)다. 아래 spec을 **검증까지 갖춘 에이전트 팀 패키지**(파일 manifest)로 만든다. 정본 references/agent-factory-philosophy.md.
[spec]
${JSON.stringify(spec, null, 2)}
철칙: maker만 찍지 말 것 — maker 1 + checker(검사도구) ≥1 + 채점 스키마 + **게이트 있는 워크플로 루프**(keep-best·run ledger·종료조건). 게이트는 실측 수치(느낌 합격 금지). maker≠checker. 슬림·지시형·결정적 출력. 사실/범위 보존 명시. 워크플로는 인라인 역할로 spawn(top-level return 허용, Date.now/Math.random/fs 금지).
파일: agents/<x>-<maker>.md, agents/<x>-<checker>.md×N, skills/<x>-team/SKILL.md, schemas/<cond>-verdict.schema.json, references/<x>-philosophy.md, workflow/<x>-loop.mjs, examples/<x>.run.example.yaml. content는 완성본(플레이스홀더 금지).
출력 JSON: {files:[{path,content}], notes}.`

const reArchitectPrompt = (bestPkg, blockers) =>
`너는 아키텍트(maker)다. 아래 best 패키지를 inspector의 blockers만 반영해 재생성한다. blocker가 짚은 파일만 고치고 통과분은 유지.
[best files]
${JSON.stringify(bestPkg.files)}
[inspector blockers]
${JSON.stringify(blockers || [])}
정본 references/agent-factory-philosophy.md. 출력 JSON: {files:[{path,content}], notes, rewrite_note}.`

const inspectorPrompt = (pkg, round) =>
`너는 에이전트 공장의 검사관(checker)다. 받은 패키지를 신선하게 6축 채점만(후하게 금지). 정본 references/agent-factory-philosophy.md.
각 0~10: S 구조(frontmatter·레이아웃·SKILL 섹션), R 역할(maker 한 역할·입출력·maker≠checker 분리), V 검증설계(실측 게이트·스키마·keep-best·ledger·종료조건 — 핵심, 없으면 7미만), P 프롬프트(슬림·결정적·지어내기 금지 명시), G 정직(신선 checker·실측·큰재작성 감점), U 실행성(스키마 파싱·워크플로 문법·이름 해소·플레이스홀더 없음).
agent_score=(S+R+V×2+P+G+U)/7. >=${GATE} 이고 V>=7 이면 "ship", 아니면 "revise". 막는 결함마다 {file,problem,fix,tell(F-#)}.
[package · round ${round}]
${JSON.stringify(pkg.files.map(f => ({ path: f.path, content: f.content })))}
출력 JSON: {agent_score,dims:{structure,role_clarity,verification_design,prompt_quality,anti_gaming,runnability},verdict,blockers:[{file,problem,fix,tell}]}`

// ── 1) Spec ───────────────────────────────────────────────
phase('Spec')
let spec = SPEC_IN
if (!spec) {
  spec = await agent(specPrompt(BRIEF), { label: 'spec', phase: 'Spec', schema: SPEC_SCHEMA })
  log(`spec: ${spec ? spec.name : 'n/a'} — checkers ${spec && spec.checkers ? spec.checkers.length : 0}`)
} else {
  log(`시드 spec 사용: ${spec.name}`)
}

// ── 2) Build (generate→inspect, keep-best, ledger, 종료조건) ─
phase('Build')
const gen0 = await agent(architectPrompt(spec), { label: 'architect:draft', phase: 'Build', schema: PACKAGE_SCHEMA })
let cur = gen0 && gen0.files ? gen0 : { files: [] }
log(`초안 패키지 파일 ${cur.files.length}개`)

let best = { pkg: cur, q: -1e9 }
const ledger = []
let prevQ = null, noImprove = 0
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const iv = await agent(inspectorPrompt(cur, round), { label: `inspect:R${round}`, phase: 'Build', schema: VERDICT_SCHEMA })
  const score = iv ? (iv.agent_score || 0) : 0
  const V = iv && iv.dims ? (iv.dims.verification_design || 0) : 0
  // q = gain − penalty (philosophy: q=Σgain−Σpenalty). 큰 재작성은 감점(Goodhart: 표적 맞추기 방어).
  const szOf = (p) => (p && p.files ? JSON.stringify(p.files).length : 1)
  const churn = best.pkg && best.pkg.files ? Math.max(0, (szOf(cur) - szOf(best.pkg) * 1.3) / szOf(best.pkg)) : 0
  const q = score - churn
  const entry = { round, score, V, churn: Math.round(churn * 100) / 100, q: Math.round(q * 100) / 100, verdict: iv ? iv.verdict : 'n/a' }
  ledger.push(entry)
  log(`R${round}  점수 ${score} · 검증설계 ${V} · q ${entry.q} · ${entry.verdict}`)

  if (q > best.q) best = { pkg: cur, q }                     // keep-best

  if (score >= GATE && V >= 7) { log(`R${round} ✓ 9/10 게이트 통과 — 출하 준비`); break }
  if (prevQ !== null && q <= prevQ + 0.3) noImprove++; else noImprove = 0
  prevQ = q
  if (noImprove >= 2) { log('조기 종료 (2R 비개선) — best 채택'); break }
  if (round === MAX_ROUNDS) { log('max 라운드 도달 — best 채택'); break }

  const rw = await agent(reArchitectPrompt(best.pkg, iv && iv.blockers), { label: `architect:R${round}`, phase: 'Build', schema: PACKAGE_SCHEMA })
  cur = rw && rw.files ? rw : best.pkg                       // 재생성도 best에서 출발
}

// 반환: 호출자(SKILL)가 best.pkg.files 를 디스크에 쓰고 quick_validate.py·node --check·JSON.parse 로 실측한 뒤 출하.
return { spec, package: best.pkg, ledger, agent_score: best.q }
