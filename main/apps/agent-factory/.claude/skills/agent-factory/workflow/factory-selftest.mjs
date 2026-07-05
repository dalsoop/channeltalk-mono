export const meta = {
  name: 'factory-selftest',
  description: '공장 자기검증 회귀 하네스. ① teeth(양쪽): 망가뜨린 패키지는 떨구고(bad<9) 잘 만든 패키지는 수용(good>=7)하며 둘을 변별(good−bad>=3)하는지 agent-inspector로 확인 ② audit: factory-auditor가 결정적 감사(audit_agents.mjs)+dogfood로 공장을 검증. 공장을 바꿀 때마다 돌린다. 통과 = inspector에 이빨 있음(양쪽) + 공장 건전.',
  phases: [{ title: 'Teeth' }, { title: 'Audit' }],
}

// args 정규화
const A = (() => { try { return typeof args === 'string' ? JSON.parse(args) : (args || {}) } catch (e) { return {} } })()
const ROOT = A.root || '/Users/jeonghan/Documents/WORK/WORKSPACE/apps/agent-creator-mono/main/apps'

const VERDICT = {
  type: 'object', required: ['agent_score', 'verdict'], additionalProperties: true,
  properties: { agent_score: { type: 'number' }, dims: { type: 'object' }, verdict: { type: 'string', enum: ['ship', 'revise'] }, blockers: { type: 'array', items: { type: 'object' } } },
}
const AUDIT = {
  type: 'object', required: ['overall'], additionalProperties: true,
  properties: { deterministic_pass: { type: 'boolean' }, dogfooding: { type: 'object' }, teeth: { type: 'object' }, independence: { type: 'boolean' }, overall: { type: 'string', enum: ['sound', 'flawed'] }, findings: { type: 'array', items: { type: 'object' } } },
}

// 음성 사례(teeth): checker 없는 maker만 + 자기채점 + 게이트/keep-best/ledger/종료조건 전무.
const BAD_PKG = {
  files: [
    { path: 'agents/foo-maker.md', content: '---\nname: foo-maker\ndescription: foo를 만든다.\ntools: Read\nmodel: sonnet\n---\n너는 foo maker다. foo를 만들고 스스로 좋으면 내보낸다. 출력: foo 텍스트.' },
    { path: 'skills/foo-team/SKILL.md', content: '---\nname: foo-team\ndescription: foo를 만드는 팀.\n---\n# Foo Team\nfoo-maker를 호출해 만들고, maker가 스스로 만족하면 끝.' },
    { path: 'skills/foo-team/workflow/foo-loop.mjs', content: "export const meta={name:'foo-loop',description:'foo',phases:[]}\nconst r = await agent('foo를 잘 만들어라. 스스로 만족스러우면 끝.')\nreturn { foo: r }" },
  ],
  notes: 'foo를 생성한다(독립 checker·게이트·keep-best·ledger·종료조건 없음).',
}

// 양성 대조(positive control): maker+신선 checker+스키마+게이트 루프(keep-best·ledger·종료0.3·rewrite 페널티)+철학+예제.
const GOOD_PKG = {
  files: [
    { path: 'agents/bar-maker.md', content: '---\nname: bar-maker\ndescription: 재료로 bar 초안/재작성 (maker). 심판 fixes만 반영해 재작성.\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n너는 bar maker다. 재료로 bar를 쓴다. maker≠checker — 내 글을 내가 채점하지 않는다. 사실 보존(지어내기 금지)·범위 정직(못 담으면 솔직히 좁힌다). 재작성 라운드면 심판 fixes만 반영, 통과분 유지. 출력 JSON {items:[...]}.' },
    { path: 'agents/bar-quality-reviewer.md', content: '---\nname: bar-quality-reviewer\ndescription: bar 품질을 신선 채점 (checker, score>=8 게이트).\ntools: Read\nmodel: sonnet\n---\n너는 bar 품질 심판(checker)다. maker≠checker, 자기 글 채점 금지, 후하게 금지(직전보다 나빠졌으면 낮게). 0~10 채점, >=8 pass 미만 revise+fixes. 사실·수치 불변. 출력 JSON {score,verdict,fixes:[{where,problem,fix}]}.' },
    { path: 'skills/bar-team/schemas/quality-verdict.schema.json', content: '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "required": ["score", "verdict"],\n  "additionalProperties": false,\n  "properties": {\n    "score": { "type": "number", "minimum": 0, "maximum": 10 },\n    "verdict": { "type": "string", "enum": ["pass", "revise"] },\n    "fixes": { "type": "array", "items": { "type": "object" } }\n  }\n}' },
    { path: 'skills/bar-team/references/bar-philosophy.md', content: '# Bar Philosophy (SSOT)\n\n믿음: 좋은 bar = 실측 신호로 채점해 기준선까지 민 것.\n\n## 성공조건\n- quality(0~10): 재료에 충실하고 군더더기 없는가. 게이트 >=8.\n\n## 규율\n- maker≠checker, keep-best, run ledger, 종료조건(max_rounds·2R<0.3 조기종료). 지어내기 금지.' },
    { path: 'skills/bar-team/examples/bar.run.example.yaml', content: 'gate:\n  quality: { metric: score, direction: maximize, threshold: 8 }\n  quality_score: "score - rewrite_penalty"\nguardrails: { max_rounds: 3, early_stop_no_improve: 2 }\npolicy: { shape: maker_checker, keep_best: true, maker_ne_checker: true }\nroles: { maker: bar-maker, checker: bar-quality-reviewer }\nledger: { fields: [round, score, q], relay: "R1 7 → R2 8.5 ✓" }' },
    { path: 'skills/bar-team/SKILL.md', content: '---\nname: bar-team\ndescription: 재료 → bar를 maker→checker 루프(score>=8 게이트)로 만드는 팀. 트리거 "bar 만들어줘". 정본 references/bar-philosophy.md.\n---\n# Bar Team\n너는 오케스트레이터다. 루프는 워크플로가 결정적으로 돈다.\n## 서브에이전트\n- bar-maker (maker)\n- bar-quality-reviewer (checker, score>=8)\n## 실행\nWorkflow({scriptPath: "workflow/bar-loop.mjs", args:{brief, gate, max_rounds}}) → {best_q, ledger}\nkeep-best·run ledger·종료조건. 역할 정본은 agents/*.md, 워크플로는 압축본을 인라인 spawn(의도된 컨벤션). 사실 보존.' },
    { path: 'skills/bar-team/workflow/bar-loop.mjs', content: "export const meta={name:'bar-loop',description:'bar maker→checker, keep-best, ledger, 종료조건, rewrite 페널티',phases:[{title:'Make'},{title:'Debate'}]}\nconst A=(()=>{try{return typeof args==='string'?JSON.parse(args):(args||{})}catch(e){return {}}})()\nconst GATE=A.gate||8, MAX=A.max_rounds||3\nconst MK={type:'object',required:['items'],properties:{items:{type:'array'}}}\nconst CK={type:'object',required:['score','verdict'],properties:{score:{type:'number'},verdict:{type:'string'},fixes:{type:'array'}}}\nconst makePrompt=(s)=>`너는 bar maker다. 재료로 bar를 쓴다(지어내기 금지). 출력 {items:[...]}.\\n${s||''}`\nconst rewritePrompt=(b,f)=>`너는 bar maker다. best를 fixes만 반영해 재작성(통과분 유지).\\n[best]${JSON.stringify(b)}\\n[fixes]${JSON.stringify(f||[])}`\nconst ckPrompt=(it)=>`너는 bar 품질 심판(checker)다. 신선 채점만(후하게 금지). 0~10, >=${GATE} pass.\\n${JSON.stringify(it)}\\n출력 {score,verdict,fixes}`\nphase('Make')\nlet cur=(await agent(makePrompt(A.brief),{schema:MK}))?.items||[]\nphase('Debate')\nlet best={cur,q:-1e9}; const ledger=[]; let prev=null,no=0\nfor(let r=1;r<=MAX;r++){\n  const v=await agent(ckPrompt(cur),{schema:CK}); const s=v?v.score||0:0\n  const pen=Math.max(0,(JSON.stringify(cur).length-JSON.stringify(best.cur).length*1.3)/Math.max(1,JSON.stringify(best.cur).length))*2 // 큰 재작성 감점(Goodhart)\n  const q=s-pen; ledger.push({round:r,score:s,q:Math.round(q*100)/100})\n  if(q>best.q)best={cur,q}\n  if(s>=GATE)break\n  if(prev!==null&&q<=prev+0.3)no++;else no=0; prev=q\n  if(no>=2)break; if(r===MAX)break\n  const rw=await agent(rewritePrompt(best.cur,v&&v.fixes),{schema:MK}); cur=rw?.items||best.cur\n}\nreturn {best_q:best.q, ledger, finalItems:best.cur}" },
  ],
  notes: 'maker 1 + 신선 checker 1 + 스키마 + 철학(SSOT) + 예제 + 실측 게이트(score>=8) 루프(keep-best·ledger·0.3 종료·rewrite 페널티).',
}

const inspectPrompt = (pkg) =>
`너는 에이전트 공장의 검사관(checker)이다. 아래 패키지를 6축 장인성 루브릭으로 신선하게 채점만(후하게 금지). 정본 references/agent-factory-philosophy.md.
각 0~10: S 구조·R 역할(maker≠checker)·V 검증설계(실측 게이트·스키마·keep-best·ledger·종료조건; 없으면 7미만)·P 프롬프트·G 정직·U 실행성. agent_score=(S+R+V×2+P+G+U)/7. >=9 이고 V>=7 이면 ship, 아니면 revise. 막는 결함마다 {file,problem,fix,tell(F-#)}.
[package]
${JSON.stringify(pkg.files)}
출력 JSON: {agent_score,dims:{structure,role_clarity,verification_design,prompt_quality,anti_gaming,runnability},verdict,blockers}`

const auditorPrompt = (teeth) =>
`너는 공장 감사관(meta-checker)이다. agent-factory(공장) 자체를 검증한다. architect·inspector와 별개 렌즈. 정본 references/agent-factory-philosophy.md.
1) 결정적 기계 검사 — Bash로 실제 실행:
   node ${ROOT}/agent-factory/.claude/skills/agent-factory/scripts/audit_agents.mjs ${ROOT}/agent-factory/.claude ${ROOT}/cardnews-creator/.claude ${ROOT}/shorts-creator/.claude
   → pass 여야 한다(아니면 deterministic_pass=false).
2) dogfooding — ${ROOT}/agent-factory/.claude 의 agents/agent-architect.md·agent-inspector.md·workflow/agent-factory-loop.mjs 를 Read해서 공장이 자기 규율(maker≠checker·실측 게이트·keep-best·ledger·종료조건·Goodhart 2겹)을 지키는지 본다.
3) teeth — 아래는 inspector가 음성 사례(checker 없는 maker만)와 양성 사례(maker+checker+게이트 루프)를 채점한 결과다. 검증기에 이빨이 있으려면 ① 나쁜 건 떨구고(bad<9, F-1류) ② 좋은 건 수용하며(good>=7) ③ 둘을 변별(good−bad>=3)해야 한다. 다 만족하면 teeth.verdict="pass"(나쁜 걸 통과시키거나 좋은 걸 떨구면 inspector 고장):
   ${JSON.stringify(teeth)}
4) 독립성 — 공장을 공장 inspector로 자기채점하지 않는다(F-2 회피).
네 항목 모두 ok면 overall="sound", 아니면 "flawed". 근거는 명령 출력·file:줄로. 출력은 JSON만:
{deterministic_pass,dogfooding:{maker_ne_checker,real_gates,goodhart,verdict},teeth:{rejects_bad,accepts_good,discriminates,verdict},independence,overall,findings:[{area,problem,fix}]}`

// ── 1) Teeth (양쪽: 나쁜 거 거부 + 좋은 거 수용 + 변별) ─────
phase('Teeth')
const [bad, good] = await parallel([
  () => agent(inspectPrompt(BAD_PKG),  { label: 'teeth:bad',  phase: 'Teeth', agentType: 'agent-inspector', schema: VERDICT }),
  () => agent(inspectPrompt(GOOD_PKG), { label: 'teeth:good', phase: 'Teeth', agentType: 'agent-inspector', schema: VERDICT }),
])
const badScore  = bad  ? (bad.agent_score  != null ? bad.agent_score  : 99) : 99
const goodScore = good ? (good.agent_score != null ? good.agent_score : 0)  : 0
const rejectsBad   = badScore < 9               // 나쁜 패키지 떨굼
const acceptsGood  = goodScore >= 7             // 좋은 패키지는 '망가짐' 영역(<7) 밖
const discriminates = (goodScore - badScore) >= 3  // 좋은 게 나쁜 것보다 확실히 높음
log(`teeth: 나쁜 ${badScore} · 좋은 ${goodScore} · reject_bad ${rejectsBad} · accept_good ${acceptsGood} · 변별 ${(Math.round((goodScore-badScore)*10)/10)}`)

// ── 2) Audit ──────────────────────────────────────────────
phase('Audit')
const teeth = { bad_score: badScore, good_score: goodScore, rejects_bad: rejectsBad, accepts_good: acceptsGood, discriminates, bad_blockers: bad && bad.blockers }
const audit = await agent(auditorPrompt(teeth), { label: 'auditor', phase: 'Audit', agentType: 'factory-auditor', schema: AUDIT })
log(`audit: ${audit ? audit.overall : 'n/a'}`)

const teeth_pass = rejectsBad && acceptsGood && discriminates
const pass = teeth_pass && audit && audit.overall === 'sound'
return { pass, teeth: { ...teeth, teeth_pass }, audit }
