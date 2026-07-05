// grounded-docs-loop — verification-gated maker→checker 루프
// 입력: 한 줄 문서요청 + 근거(repo 코드·디렉터리 구조·AGENTS.md·대화맥락) → 출력: 요청 문서 1개(README.md/문서.md/폼답변)
// 형태: `export async function run(deps)` — **`node --check` 통과**(top-level return 없음). 런타임(Workflow/Codex)이
//        deps = { phase, agent, parallel, log, args } 를 주입해 호출한다. Date.now()/Math.random()/fs 금지.
// 정본: skills/grounded-docs-team/references/grounded-docs-philosophy.md
export const meta = {
  name: 'grounded-docs-loop',
  description: '한 줄 문서요청 + 근거(repo 코드·구조·AGENTS.md·대화맥락) → 절차 4요소 뼈대(작동순서→지식근거→판단·채점기준→막힐 때)로 쓴 문서 1개(README/문서/폼답변)를 쓰는 verification-gated 루프. maker(문서 writer)→checker 3(근거·쉬움·구조/글자수). 결정적 게이트(지어냄 0·전문용어 남발 0·4요소 순서·글자수 초과 0), keep-best, run ledger, 종료조건. 역할은 코드가 인라인 spawn.',
  phases: [{ title: 'Draft' }, { title: 'Gate' }],
}

// 런타임이 주입하는 deps: phase/agent/parallel/log = 오케스트레이션 primitives, args = 호출자 주입 데이터.
export async function run({ phase, agent, parallel, log, args } = {}) {
// ── 바인딩 (args override) — 데이터는 호출자가 주입, 하드코딩 아님 ──────
const REQUEST   = (args && args.request)  || ''      // 한 줄 문서 요청(문서종류·독자·글자수제약)
const DOC_TYPE  = (args && args.doc_type) || 'doc'   // readme | doc | form_answer
const AUDIENCE  = (args && args.audience) || '처음 보는 심사자'
const CHAR_LIMIT = (args && typeof args.char_limit === 'number' && args.char_limit > 0) ? args.char_limit : 0 // 0=제약 없음
// 근거 정본(유일한 사실 출처) — 없는 정보는 근거 없음으로 취급, 지어내기 금지.
const EVIDENCE  = (args && args.evidence) || {}      // { files:[{path,excerpt}], tree:"", agents_md:"", conversation:"" }
const LINK_TARGETS = (args && Array.isArray(args.link_targets)) ? args.link_targets : [] // 실제 존재 확인된 상대링크 경로 화이트리스트
const RUN       = (args && args.run)      || '<run>'
const MAX_ROUNDS = (args && args.max_rounds) || 4
// 게이트는 전부 카운트(minimize/maximize, 실측). 느낌 합격 없음. success_conditions 4축과 1:1.
//   grounded  = 근거 없는 지어낸 기능/수치/주장 수                              == 0
//   plain     = 쉬운 말 점수(0~10, 전문용어 남발 0=만점)                        >= 9.0
//   structure = 절차 4요소 순서대로 존재 점수(0~10)                             >= 8.0
//   overflow  = 글자수 제약 있을 때 공백포함 wc -m 초과 문자 수                   == 0

// ── 산출/채점 스키마 (인라인 미러; 정본은 schemas/*.schema.json) ─────────
const DOC_SCHEMA = {
  type: 'object', required: ['content', 'claims'], additionalProperties: true,
  properties: {
    content: { type: 'string' },                          // 문서 전체 본문(README.md/문서.md/폼답변 텍스트)
    claims: { type: 'array', items: { type: 'string' } }, // 문서가 편 사실 주장 목록(근거 대조용)
    used_links: { type: 'array', items: { type: 'string' } }, // 본문이 건 상대링크 경로
  },
}
const GROUNDING_SCHEMA = {  // 근거·글자수 축(minimize, ==0)
  type: 'object', required: ['count', 'verdict'], additionalProperties: true,
  properties: {
    count: { type: 'number' },
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    offenders: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'object' } },
  },
}
const SCORE_SCHEMA = {  // 쉬움·구조 축(maximize, 0~10)
  type: 'object', required: ['score', 'verdict'], additionalProperties: true,
  properties: {
    score: { type: 'number', minimum: 0, maximum: 10 },
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    offenders: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'object' } },
  },
}

// ── 유틸 ───────────────────────────────────────────────────────────────
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v) }
function asArray(v) { return Array.isArray(v) ? v : [] }
function lower(s) { return (typeof s === 'string' ? s : '').toLowerCase() }
function text(s) { return typeof s === 'string' ? s : '' }

// wc -m 대역: 공백 포함 유니코드 코드포인트 수(개행 포함). 결정적, 호출자가 파일에 쓴 뒤 실측 wc -m 로 재확인.
function charCount(s) { return Array.from(text(s)).length }

// ── SSOT 근거 인덱스 (결정적) — evidence 에서만 뽑는다 ───────────────────
// 근거 화이트리스트: 파일 excerpt·구조·AGENTS.md·대화맥락을 한 덩어리로.
const evidenceFiles = asArray(EVIDENCE.files)
const evidenceCorpus = [
  text(EVIDENCE.tree),
  text(EVIDENCE.agents_md),
  text(EVIDENCE.conversation),
].concat(evidenceFiles.map((f) => (isObj(f) ? (text(f.path) + '\n' + text(f.excerpt)) : ''))).join('\n')
const evidenceLower = lower(evidenceCorpus)
// 실제 존재 확인된 링크 경로(호출자가 test -e / ls 로 확정해 넘긴 화이트리스트)
const linkWhitelist = new Set(LINK_TARGETS.map((p) => text(p)))

// ── 결정적 checker 미러 (LLM 채점 전, 코드가 직접 — F-3 방어) ───────────

// (A) 근거: 상대링크가 실제 존재 화이트리스트에 없으면 지어냄 후보(결정적).
//     상대링크 = ./path, ../path, path/foo (http/mailto/# 앵커 제외).
function danglingLinks(md, usedLinks) {
  const bad = []
  const seen = new Set()
  const linkRe = /\]\(([^)]+)\)/g   // markdown [txt](target)
  let m
  const scan = (raw) => {
    let target = text(raw).trim().split(/\s+/)[0]     // (path "title") 의 title 제거
    if (!target) return
    if (/^(https?:|mailto:|#|tel:|data:)/i.test(target)) return  // 외부/앵커 제외
    target = target.split('#')[0]                     // 파일 내 앵커 제거
    if (!target) return
    if (seen.has(target)) return
    seen.add(target)
    if (!linkWhitelist.has(target)) bad.push(`link:${target}`)
  }
  const body = text(md)
  while ((m = linkRe.exec(body)) !== null) scan(m[1])
  for (const u of asArray(usedLinks)) scan(u)
  return bad
}

// (B) 근거: 본문의 수치 주장(퍼센트·배수·개수 등) 중 근거 코퍼스에 그 숫자가 없으면 지어냄 후보(보수적).
function unbackedNumbers(md) {
  const bad = []
  const body = text(md)
  // 성능/규모 단정에 붙는 숫자: 12%, 3x, 1,000+, 50ms, 99.9% 등
  const numRe = /\b(\d[\d,]*(?:\.\d+)?)\s*(%|x배|배|x|ms|s|초|k|m|건|개|명|줄|line|lines|req\/s|rps|배속)?\b/gi
  let m
  const evidenceNums = new Set((evidenceCorpus.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, '')))
  while ((m = numRe.exec(body)) !== null) {
    const unit = lower(m[2] || '')
    if (!unit) continue                               // 순수 숫자(버전·목록번호 등)는 스킵 — 오탐 방지
    const raw = m[1].replace(/,/g, '')
    if (evidenceNums.has(raw)) continue               // 근거에 그 숫자 존재
    bad.push(`num:${m[0].trim()}`)
  }
  return bad
}

// (C) 쉬움: 설명 없이 던진 전문용어 남발 카운트(maker/checker·pin·게이트·SSOT 등).
//     "설명 없이" = 같은 문장/직전에 쉬운 풀이가 붙지 않은 첫 등장.
const JARGON = ['maker', 'checker', 'pin', '게이트', 'gate', 'ssot', 'keep-best', 'ledger', 'verdict', 'spawn', 'idempotent', 'provenance', '멱등', '오케스트레이터']
function jargonHits(md) {
  const hits = []
  const body = text(md)
  const bodyLower = lower(body)
  for (const j of JARGON) {
    const idx = bodyLower.indexOf(lower(j))
    if (idx < 0) continue
    // 같은 문장 안에 풀이 신호(즉/뜻·괄호 설명·"란"·"이란")가 있으면 설명된 것으로 본다.
    const sentStart = Math.max(bodyLower.lastIndexOf('.', idx), bodyLower.lastIndexOf('\n', idx)) + 1
    const sentEnd = Math.min(
      ...['.', '\n'].map((c) => { const p = bodyLower.indexOf(c, idx); return p < 0 ? body.length : p }),
    )
    const sent = body.slice(sentStart, sentEnd)
    if (/[(（]|즉|뜻|이란|란\b|means|i\.e\./i.test(sent)) continue  // 풀이 동반 → 통과
    hits.push(`jargon:${j}`)
  }
  return hits
}

// (D) 구조: 절차 4요소가 순서대로 뼈대인가. 각 요소의 앵커 키워드가 본문에 등장하는 첫 위치를 본다.
const STEP_ANCHORS = [
  { key: 'order',    words: ['작동 순서', '작동순서', '어떻게 동작', '동작 순서', '순서', 'how it works', 'flow'] },
  { key: 'evidence', words: ['지식 근거', '근거', '무엇을 근거', '어디서', 'why', 'based on', '기반'] },
  { key: 'criteria', words: ['판단 기준', '채점 기준', '기준', '통과', 'pass', '판단', 'criteria', 'score'] },
  { key: 'stuck',    words: ['막힐 때', '막힐때', '안 될 때', '문제가', 'troubleshoot', '실패하면', 'fallback', '주의'] },
]
function structureProbe(md) {
  const body = lower(md)
  const positions = STEP_ANCHORS.map((a) => {
    let first = Infinity
    for (const w of a.words) { const p = body.indexOf(lower(w)); if (p >= 0 && p < first) first = p }
    return { key: a.key, pos: first }
  })
  const present = positions.filter((p) => p.pos !== Infinity)
  // 순서: 존재하는 요소들이 앵커 정의 순서대로(단조 증가) 나오는가
  let ordered = true
  const found = positions.map((p) => p.pos)
  let lastSeen = -1
  for (const pos of found) {
    if (pos === Infinity) continue
    if (pos < lastSeen) ordered = false
    lastSeen = pos
  }
  return { presentCount: present.length, ordered, positions }
}
// 결정적 구조 하한 점수(심판이 이보다 후하면 이 값으로 눌러 max 대신 min 채택하지 않고, 아래 Math.min 로 엄격 측).
function structureFloor(md) {
  const p = structureProbe(md)
  // 4요소 존재 8점 만점(각 2점) + 순서 2점. 결정적 하한.
  let s = p.presentCount * 2
  if (p.ordered) s += 2
  return Math.min(10, s)
}

// ── 인라인 역할 프롬프트 (정본: agents/grounded-docs-*.md 압축) ─────────
const evidenceForPrompt = () => JSON.stringify({
  files: evidenceFiles.map((f) => (isObj(f) ? { path: f.path, excerpt: text(f.excerpt).slice(0, 4000) } : {})),
  tree: text(EVIDENCE.tree).slice(0, 4000),
  agents_md: text(EVIDENCE.agents_md).slice(0, 4000),
  conversation: text(EVIDENCE.conversation).slice(0, 4000),
})
const limitLine = () => CHAR_LIMIT > 0
  ? `글자수 제약: 공백 포함 ${CHAR_LIMIT}자 이내(wc -m 실측 기준). 초과하면 세부를 덜되 4요소는 유지.`
  : '글자수 제약 없음.'

const makePrompt = () =>
`너는 문서 writer(maker)다. 아래 근거 '만' 으로 요청 문서를 쓴다. 근거 밖 기능·수치·주장은 절대 지어내지 마라(근거에 없으면 안 쓴다).
[요청] ${REQUEST}
[문서 종류] ${DOC_TYPE}   [대상 독자] ${AUDIENCE}
[${limitLine()}]
[근거 = 유일한 사실 출처] ${evidenceForPrompt()}
[실제 존재 확인된 상대링크(이 목록의 경로만 링크로 걸 수 있다)] ${JSON.stringify([...linkWhitelist])}
뼈대는 절차 4요소를 이 순서로:
 1) 작동 순서 — 이걸 쓰면 무엇이 되는지/어떻게 동작하는지 순서대로(결과 먼저).
 2) 지식 근거 — 그 동작이 무엇(코드·구조·AGENTS.md)에 근거하는지.
 3) 판단·채점 기준 — 무엇을 만족하면 통과/맞다고 보는지.
 4) 막힐 때 — 안 될 때·주의·한계·폴백.
쉬운 말 규칙: 도메인을 처음 보는 ${AUDIENCE} 가 한 번에 이해되게. maker/checker·pin·게이트·SSOT 같은 전문용어를 설명 없이 던지지 마라(쓰려면 그 문장에서 괄호로 풀어라). README 면 처음 보는 사람 기준 친절한 첫인상.
출력 JSON: {content:"<문서 전체>", claims:[문서가 편 사실 주장 문장들], used_links:[본문이 건 상대링크 경로]}`

const rewritePrompt = (best, fixBundle) =>
`너는 문서 writer(maker)다. best 문서를 심판 처방만 반영해 재작성한다. 통과분·근거 있는 사실·4요소 뼈대는 불변. 지어내기 금지, 범위 정직.
[요청] ${REQUEST}   [문서 종류] ${DOC_TYPE}   [독자] ${AUDIENCE}
[${limitLine()}]
[실제 존재 확인된 상대링크(이 목록만)] ${JSON.stringify([...linkWhitelist])}
[best content]
${text(best.content)}
[심판 처방 (지어냄/링크/전문용어/구조/글자수)]
${JSON.stringify(fixBundle || [])}
출력 JSON: {content, claims, used_links}`

const groundingPrompt = (doc, detLinks, detNums, round) =>
`너는 근거·지어냄 심판(checker)이다. 문서의 각 사실 주장(기능·수치·구조·동작)을 근거(파일 excerpt·구조·AGENTS.md·대화맥락) 와 한 문장씩 대조해 근거 없는 지어냄·과장·존재하지 않는 기능/수치를 적발한다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드가 미리 잡은 죽은 링크 ${detLinks.length}건: ${JSON.stringify(detLinks)} · 근거없는 수치 ${detNums.length}건: ${JSON.stringify(detNums)}.
상대링크는 실제 파일 존재까지 본다(존재 확인 화이트리스트 밖이면 지어냄 1건). provenance 를 실제보다 확정적으로 단정하면 1건.
[근거 = 유일 SSOT] ${evidenceForPrompt()}
[존재 확인된 링크] ${JSON.stringify([...linkWhitelist])}
[문서 claims] ${JSON.stringify(asArray(doc.claims))}
[문서 content] ${JSON.stringify(text(doc.content).slice(0, 8000))}
count=근거 없는 지어낸 기능/수치/주장 + 죽은 링크 총 개수(minimize, 0 이상적). verdict: 0이면 pass, 아니면 revise.
출력 JSON: {count:<개수>, verdict, offenders:[...], fixes:[{where,problem,fix}]}  · round ${round}`

const plainPrompt = (doc, detJargon, round) =>
`너는 쉬움·첫인상 심판(checker)이다. 이 도메인을 처음 보는 ${AUDIENCE} 눈으로, 설명 없이 던진 전문용어(maker/checker·pin·게이트·SSOT 등) 남발과 한 번에 이해 안 되는 대목을 짚는다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드가 미리 잡은 설명없는 전문용어 ${detJargon.length}건: ${JSON.stringify(detJargon)}.
README 면 친절한 첫인상인지(무엇에 쓰는지 첫 화면에서 바로 이해되는지) 본다.
[문서 종류] ${DOC_TYPE}
[문서 content] ${JSON.stringify(text(doc.content).slice(0, 8000))}
score 0~10 = 쉬운 말 정도(설명없는 전문용어 남발 0·한 번에 이해됨 = 10). 결정적으로 잡힌 전문용어 ${detJargon.length}건은 감점 근거다.
verdict: score>=9 이면 pass, 아니면 revise.
출력 JSON: {score:<0~10>, verdict, offenders:[전문용어/난해 대목], fixes:[{where,problem,fix}]}  · round ${round}`

const structPrompt = (doc, probe, floor, overflow, round) =>
`너는 절차 뼈대·글자수 심판(checker)이다. 4요소(작동순서→지식근거→판단·채점기준→막힐 때)가 순서대로 뼈대를 이루는지, 글자수 제약이 있으면 초과 여부를 채점한다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드 실측: 4요소 중 존재 ${probe.presentCount}/4, 순서 정상 ${probe.ordered}, 결정적 구조하한 ${floor}/10. 글자수 초과 ${overflow}자(${CHAR_LIMIT > 0 ? '상한 ' + CHAR_LIMIT : '제약없음'}).
[문서 content] ${JSON.stringify(text(doc.content).slice(0, 8000))}
score 0~10 = 4요소가 순서대로 뼈대를 이루는 정도(각 요소가 실제 내용을 담고 순서대로면 높음). 결정적 하한 ${floor} 밑으로 주지 마라.
verdict: score>=8 이고 글자수 초과 0 이면 pass, 아니면 revise.
출력 JSON: {score:<0~10>, verdict, offenders:[빠진/뒤바뀐 요소], fixes:[{where,problem,fix}]}  · round ${round}`

// ── 1) Draft ───────────────────────────────────────────────
phase('Draft')
const draft = await agent(makePrompt(), { label: 'maker:draft', phase: 'Draft', schema: DOC_SCHEMA })
let cur = isObj(draft) ? draft : { content: '', claims: [], used_links: [] }
log(`초안 문서: ${charCount(cur.content)}자(공백포함) · claims ${asArray(cur.claims).length}${CHAR_LIMIT ? ' / 상한 ' + CHAR_LIMIT : ''}`)

// ── 2) Gate (병렬 채점, keep-best, ledger, 종료조건) ──────────
phase('Gate')
let best = { doc: cur, q: -1e9 }
const ledger = []
let prevQ = null, noImprove = 0
for (let round = 1; round <= MAX_ROUNDS; round++) {
  // 결정적 선검사 (코드 — 의미 점수만으로 출하 안 함)
  const detLinks  = danglingLinks(cur.content, cur.used_links)
  const detNums   = unbackedNumbers(cur.content)
  const detJargon = jargonHits(cur.content)
  const probe     = structureProbe(cur.content)
  const floor     = structureFloor(cur.content)
  const cc        = charCount(cur.content)
  const overflow  = CHAR_LIMIT > 0 ? Math.max(0, cc - CHAR_LIMIT) : 0

  const [gv, pv, sv] = await parallel([
    () => agent(groundingPrompt(cur, detLinks, detNums, round), { label: `grounding:R${round}`, phase: 'Gate', schema: GROUNDING_SCHEMA }),
    () => agent(plainPrompt(cur, detJargon, round),             { label: `plain:R${round}`,     phase: 'Gate', schema: SCORE_SCHEMA }),
    () => agent(structPrompt(cur, probe, floor, overflow, round), { label: `struct:R${round}`,  phase: 'Gate', schema: SCORE_SCHEMA }),
  ])
  // 근거·글자수 = max(코드 선검사, 심판) — 엄격 측(위반은 크게). 쉬움·구조 = min(코드 하한? 심판) — 후한 심판 방어.
  const grounded  = Math.max(detLinks.length + detNums.length, gv ? (gv.count || 0) : 0)   // 지어냄+죽은링크 (==0)
  const plain     = Math.max(0, Math.min(10 - detJargon.length, pv ? (typeof pv.score === 'number' ? pv.score : 0) : 0)) // 쉬움 (>=9)
  const structure = Math.min(sv ? (typeof sv.score === 'number' ? sv.score : 0) : 0, Math.max(floor, sv ? (sv.score || 0) : 0)) // 구조 (>=8), 하한 눌림
  const overflowN = overflow                                                                // 글자수 초과 (==0)

  // 게이트: 실측. 느낌 아님.
  const gateGrounded  = grounded === 0
  const gatePlain     = plain >= 9.0
  const gateStructure = structure >= 8.0
  const gateOverflow  = overflowN === 0
  const pass = gateGrounded && gatePlain && gateStructure && gateOverflow

  // q: 위반 페널티 + 점수 보상 합성(높을수록 좋음). 느낌 아님 — 실측 파생.
  const q = -(grounded * 5) - (overflowN * 0.05) + plain + structure
  const verdict = pass ? 'pass' : 'revise'
  ledger.push({ round, grounded, plain: Number(plain.toFixed(2)), structure: Number(structure.toFixed(2)), overflow: overflowN, chars: cc, q: Number(q.toFixed(2)), verdict })
  log(`R${round}  지어냄 ${grounded} · 쉬움 ${plain.toFixed(1)}/10 · 구조 ${structure.toFixed(1)}/10 · 초과 ${overflowN}자 · ${verdict}`)

  if (q > best.q) best = { doc: cur, q }                     // keep-best
  if (pass) { log(`R${round} ✓ 전 게이트 통과(지어냄0·쉬움≥9·구조≥8·초과0) — 출하 준비`); break }
  if (prevQ !== null && q <= prevQ + 0.3) noImprove++; else noImprove = 0
  prevQ = q
  if (noImprove >= 2) { log('조기 종료 (2R 비개선) — best 채택(clean pass 아님, ledger 명시)'); break }
  if (round === MAX_ROUNDS) { log('max 라운드 도달 — best 채택(clean pass 아님, ledger 명시)'); break }

  const fixBundle = []
    .concat(gv && gv.fixes ? gv.fixes : [])
    .concat(pv && pv.fixes ? pv.fixes : [])
    .concat(sv && sv.fixes ? sv.fixes : [])
  const rw = await agent(rewritePrompt(best.doc, fixBundle), { label: `maker:R${round}`, phase: 'Gate', schema: DOC_SCHEMA })
  cur = isObj(rw) ? rw : best.doc                            // 재생성도 best 에서 출발
}

const last = ledger[ledger.length - 1] || {}
const clean = last.verdict === 'pass'
// 반환: 호출자(SKILL)가 best.doc.content 를 요청된 문서 파일로 쓰고, `wc -m`(글자수)·`test -e`(상대링크)로
//        결정적 실측한 뒤 출하. clean=false 면 keep-best(비-clean)임을 run-ledger 에 명시.
return { run: RUN, doc: best.doc, ledger, best_q: best.q, clean, char_limit: CHAR_LIMIT, doc_type: DOC_TYPE }
}
