// channeltalk-manual-loop — verification-gated maker→checker 루프
// 입력: out/<run>/changes.json + surface.snapshot.json → 출력: update-manual.md (PII-안전 연동 매뉴얼)
// 규약: top-level return/await 허용(런타임 async-wrap). Date.now()/Math.random()/fs 금지.
// 정본: skills/channeltalk-manual-team/references/channeltalk-manual-philosophy.md
//        도메인 SSOT: /Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/CHANNELTALK.md 5.2·6·12
export const meta = {
  name: 'channeltalk-manual-loop',
  description: '결정적 diff(changes.json)+surface.snapshot.json → 기능별 PII-안전 연동 매뉴얼(update-manual.md)을 쓰는 verification-gated 루프. maker(매뉴얼 writer)→checker 3(accuracy·completeness·privacy). 결정적 게이트(지어냄 0·누락 0·PII누락+secret누출 0), keep-best, run ledger, 종료조건. 역할은 코드가 인라인 spawn.',
  phases: [{ title: 'Draft' }, { title: 'Gate' }],
}

// ── 바인딩 (args override) — 데이터는 호출자가 주입, 하드코딩 아님 ──────
const CHANGES  = (args && args.changes)  || {}   // out/<run>/changes.json 파싱본
const SURFACE  = (args && args.surface)  || {}   // out/<run>/surface.snapshot.json 파싱본
const RUN      = (args && args.run)      || '<run>'
const MAX_ROUNDS = (args && args.max_rounds) || 3
// 게이트는 전부 카운트(minimize, ==0). 느낌 합격 없음. success_conditions 3축과 1:1.
//   accurate     = 지어낸 엔드포인트/필드/헤더 수                          == 0
//   complete     = changes 신규 id 중 매뉴얼 누락 수                        == 0
//   privacy_safe = (pii/policy 기능의 PII주의 누락) + (예제 secret 누출) 수  == 0

// ── 산출/채점 스키마 (인라인 미러; 정본은 schemas/*.schema.json) ─────────
const MANUAL_SCHEMA = {
  type: 'object', required: ['markdown', 'covered_ids'], additionalProperties: true,
  properties: {
    markdown: { type: 'string' },                 // update-manual.md 본문
    covered_ids: { type: 'array', items: { type: 'string' } }, // 매뉴얼이 다룬 feature id
  },
}
const VERDICT_SCHEMA = {
  type: 'object', required: ['count', 'verdict'], additionalProperties: true,
  properties: {
    count: { type: 'number' },                    // 위반/지어냄/누락 개수 (minimize, ==0 게이트)
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    offenders: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'object' } },
  },
}

// ── SSOT 인덱스 (결정적 근거) — surface + changes 에서만 뽑는다 ──────────
function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v) }
function asArray(v) { return Array.isArray(v) ? v : [] }
function lower(s) { return (typeof s === 'string' ? s : '').toLowerCase() }

// surface features 를 id→feature 로 색인 (지어냄 판정의 SSOT 대역)
const surfaceFeatures = asArray(SURFACE.features)
const featureById = {}
for (const f of surfaceFeatures) if (isObj(f) && typeof f.id === 'string') featureById[f.id] = f
// 표면에 실재하는 모든 path/header/field 화이트리스트(지어냄 스캔용)
const allPaths = new Set()
const allHeaders = new Set()
const allFields = new Set()
for (const f of surfaceFeatures) {
  if (!isObj(f)) continue
  if (typeof f.path === 'string') allPaths.add(f.path)
  for (const h of asArray(f.auth)) if (typeof h === 'string') allHeaders.add(lower(h.split(' ')[0]))
  for (const p of asArray(f.pii_fields)) if (typeof p === 'string') allFields.add(p)
  for (const p of asArray(f.params)) if (isObj(p) && typeof p.name === 'string') allFields.add(p.name)
}

// changes 의 신규 id 집합 (완전성 판정의 SSOT) — new_features 우선, 없으면 changes[]
const newFeatures = asArray(CHANGES.new_features).length ? asArray(CHANGES.new_features) : asArray(CHANGES.changes)
const newIds = []
for (const c of newFeatures) if (isObj(c) && typeof c.id === 'string') newIds.push(c.id)
// PII/정책 플래그가 있어 개인정보 주의가 "필수"인 id
const requiresPiiNote = new Set()
for (const c of newFeatures) {
  if (!isObj(c)) continue
  const hasPii = c.has_pii === true || asArray(c.pii_fields).length > 0
  const hasFlag = typeof c.policy_flag === 'string' && c.policy_flag.length > 0
  if (hasPii || hasFlag) requiresPiiNote.add(c.id)
}

// ── 결정적 checker 미러 (LLM 채점 전, 코드가 직접 — F-3 방어) ───────────
// secret 게이트: <KEY>/<SECRET>/<PII:*> 플레이스홀더만 허용. 24자+ base64/hex 토큰 = 실키 누출.
const TOKEN_RE = /\b[A-Za-z0-9+/=_-]{24,}\b/g
const PLACEHOLDER_RE = /^<[^>]+>$/
function secretLeaks(md) {
  const leaks = []
  const text = typeof md === 'string' ? md : ''
  const matches = text.match(TOKEN_RE) || []
  for (const tok of matches) {
    if (PLACEHOLDER_RE.test(tok)) continue             // <KEY> 등 플레이스홀더
    if (/^[a-z][a-z0-9]*([_-][a-z0-9]+)*$/i.test(tok) && !/[0-9]/.test(tok)) continue // 순수 식별어(단어)
    // 표면에 실재하는 path 조각·필드명은 화이트리스트
    if (allFields.has(tok) || [...allPaths].some((p) => p.includes(tok))) continue
    // base64/hex 밀도 높은 긴 토큰만 실키로 본다
    if (/[0-9]/.test(tok) && /[A-Za-z]/.test(tok) && tok.length >= 24) leaks.push(tok)
  }
  return leaks
}
// 완전성: 신규 id 중 매뉴얼 covered/본문에 없는 것
function missingIds(md, covered) {
  const text = typeof md === 'string' ? md : ''
  const set = new Set(asArray(covered))
  const miss = []
  for (const id of newIds) if (!set.has(id) && !text.includes(id)) miss.push(id)
  return miss
}
// PII 주의 누락: 필수 id 인데 그 섹션 근처에 개인정보/PII/마스킹/동의 키워드가 없다
function piiNoteGaps(md) {
  const text = typeof md === 'string' ? md : ''
  const gaps = []
  const NOTE_RE = /(개인정보|pii|마스킹|mask|동의|policy_flag|hold_pii|mask_inbound)/i
  for (const id of requiresPiiNote) {
    const i = text.indexOf(id)
    if (i < 0) { gaps.push(id); continue }              // 섹션 자체가 없으면 완전성에서도 잡히나 여기서도 결함
    const window = text.slice(i, i + 1200)              // 해당 기능 섹션 창
    if (!NOTE_RE.test(window)) gaps.push(id)
  }
  return gaps
}
// 지어냄: 매뉴얼 본문의 path/header 가 surface 화이트리스트에 없으면 fabrication 후보(결정적 선별)
function fabricationCandidates(md) {
  const text = typeof md === 'string' ? md : ''
  const cands = []
  const pathMatches = text.match(/\/open\/v5\/[A-Za-z0-9{}\/_-]+/g) || []
  for (const p of new Set(pathMatches)) if (!allPaths.has(p)) cands.push(`path:${p}`)
  const hdrMatches = text.match(/x-[a-z-]+/gi) || []
  for (const h of new Set(hdrMatches.map((x) => lower(x)))) if (!allHeaders.has(h)) cands.push(`header:${h}`)
  return cands
}

// ── 인라인 역할 프롬프트 (정본: agents/channeltalk-manual-*.md 압축) ────
const makePrompt = (changes, surface, ids) =>
`너는 채널톡 연동 매뉴얼 writer(maker)다. 아래 changes.json + surface.snapshot.json '만' 근거로 기능별 PII-안전 연동 매뉴얼(update-manual.md)을 쓴다. 근거 밖은 절대 지어내지 마라.
[신규 기능 id 전수 — 하나도 빠뜨리지 마라] ${JSON.stringify(ids)}
[changes.json] ${JSON.stringify(changes)}
[surface.snapshot.json] ${JSON.stringify(surface)}
각 기능 섹션 규칙(CHANNELTALK.md 5.2):
- provenance 배지: mock | inferred (inferred 는 "문서 검증 필요" 문구 필수).
- 무엇/왜: summary + value 그대로.
- 어떻게: method + path, auth 헤더, params, 예제(플레이스홀더 <KEY>/<SECRET>/<PII:*> 그대로 — 실키·실 개인정보 넣지 마라).
- 개인정보 주의: pii_fields 또는 policy_flag 있으면 필수. 방향(R/W/CB)별로 6 규칙(GET=마스킹·최소요청 / PUT·POST=전송동의·위탁 / webhook=서명검증·본문마스킹). policy_flag=hold_pii_transmit 이면 "도입 보류 권고", mask_inbound 이면 "수신 마스킹".
- 표면에 없는 엔드포인트/필드/헤더를 만들지 마라(SSOT 대조로 걸린다).
출력 JSON: {markdown:"<update-manual.md 전체>", covered_ids:[다룬 feature id 전부]}`

const rewritePrompt = (best, fixBundle, ids) =>
`너는 채널톡 연동 매뉴얼 writer(maker)다. best 매뉴얼을 심판 처방만 반영해 재작성한다. 통과분·사실·근거 범위 불변, 지어내기 금지, 신규 id 전수 유지.
[신규 id 전수] ${JSON.stringify(ids)}
[best markdown]
${typeof best.markdown === 'string' ? best.markdown : ''}
[covered_ids] ${JSON.stringify(best.covered_ids || [])}
[심판 처방 (누락/지어냄/PII/secret)]
${JSON.stringify(fixBundle || [])}
출력 JSON: {markdown, covered_ids}`

const accuracyPrompt = (manual, fabCands, round) =>
`너는 정확성 심판(checker)이다. update-manual.md 를 SSOT(surface features · CHANNELTALK.md 12)로만 대조해 '지어냄'을 적발한다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드가 미리 잡은 지어냄 후보 ${fabCands.length}건: ${JSON.stringify(fabCands)}.
추가로: 표면에 없는 엔드포인트(method·path)·필드·auth 헤더·params 를 매뉴얼이 주장하는가, provenance 를 verified-live 로 단정하지 않는가.
[surface features id] ${JSON.stringify(Object.keys(featureById))}
[manual] ${JSON.stringify(manual.markdown || '')}
count=지어낸 엔드포인트/필드/헤더 총 개수(minimize, 0 이 이상적). verdict: 0이면 pass, 아니면 revise.
출력 JSON: {count:<개수>, verdict, offenders:[...], fixes:[{where,problem,fix}]}  · round ${round}`

const completenessPrompt = (manual, ids, miss, round) =>
`너는 완전성 심판(checker)이다. changes 신규 id 전수가 매뉴얼에 커버됐는지만 본다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드가 미리 잡은 누락 ${miss.length}건: ${JSON.stringify(miss)}.
[신규 id 전수] ${JSON.stringify(ids)}
[manual covered_ids] ${JSON.stringify(manual.covered_ids || [])}
각 id 마다 매뉴얼에 무엇/왜·어떻게 섹션이 실제 있는지 확인(id 만 나열하고 내용 빈 껍데기는 누락으로 센다).
count=누락된 신규 id 개수(minimize, 0 이상적). verdict: 0이면 pass, 아니면 revise.
출력 JSON: {count:<개수>, verdict, offenders:[누락 id], fixes:[{where,problem,fix}]}  · round ${round}`

const privacyPrompt = (manual, mustNote, gaps, leaks, round) =>
`너는 개인정보 심판(checker)이다. PII 주의·예제 secret·정책 플래그(hold_pii_transmit/mask_inbound)만 본다. 신선 채점, 후하게 금지. 재작성하지 마라.
코드가 미리 잡은 PII주의 누락 ${gaps.length}건: ${JSON.stringify(gaps)} · secret 누출 ${leaks.length}건: ${JSON.stringify(leaks)}.
[개인정보 주의 필수 id] ${JSON.stringify([...mustNote])}
확인: 필수 id 섹션마다 방향(R/W/CB)에 맞는 6 주의(마스킹/전송동의·위탁/서명검증)와 policy_flag 반영이 있는가. 예제에 실키·실 개인정보가 없는가(<KEY>/<SECRET>/<PII:*> 플레이스홀더만).
count=(PII주의 누락 개수) + (예제 secret 누출 개수)(minimize, 0 이상적). verdict: 0이면 pass, 아니면 revise.
[manual] ${JSON.stringify(manual.markdown || '')}
출력 JSON: {count:<개수>, verdict, offenders:[...], fixes:[{where,problem,fix}]}  · round ${round}`

// ── 1) Draft ───────────────────────────────────────────────
phase('Draft')
const draft = await agent(makePrompt(CHANGES, SURFACE, newIds), { label: 'maker:draft', phase: 'Draft', schema: MANUAL_SCHEMA })
let cur = isObj(draft) ? draft : { markdown: '', covered_ids: [] }
log(`초안 매뉴얼: ${(cur.markdown || '').length}자 · covered ${asArray(cur.covered_ids).length} / 신규 ${newIds.length}`)

// ── 2) Gate (병렬 채점, keep-best, ledger, 종료조건) ──────────
phase('Gate')
let best = { manual: cur, q: -1e9 }
const ledger = []
let prevQ = null, noImprove = 0
for (let round = 1; round <= MAX_ROUNDS; round++) {
  // 결정적 선검사 (코드 — 의미 점수만으로 출하 안 함)
  const detFab   = fabricationCandidates(cur.markdown)
  const detMiss  = missingIds(cur.markdown, cur.covered_ids)
  const detGaps  = piiNoteGaps(cur.markdown)
  const detLeaks = secretLeaks(cur.markdown)

  const [av, cv, pv] = await parallel([
    () => agent(accuracyPrompt(cur, detFab, round),                          { label: `accuracy:R${round}`,     phase: 'Gate', schema: VERDICT_SCHEMA }),
    () => agent(completenessPrompt(cur, newIds, detMiss, round),             { label: `completeness:R${round}`, phase: 'Gate', schema: VERDICT_SCHEMA }),
    () => agent(privacyPrompt(cur, requiresPiiNote, detGaps, detLeaks, round), { label: `privacy:R${round}`,    phase: 'Gate', schema: VERDICT_SCHEMA }),
  ])
  // 각 축 = max(코드 선검사, 심판) — 엄격 측. 게이트는 실측 카운트.
  const accurate     = Math.max(detFab.length,  av ? (av.count || 0) : 0)                    // 지어냄 (==0)
  const complete     = Math.max(detMiss.length, cv ? (cv.count || 0) : 0)                    // 누락 (==0)
  const privacy      = Math.max(detGaps.length + detLeaks.length, pv ? (pv.count || 0) : 0)  // PII누락+secret (==0)

  const q = -(accurate * 4) - (complete * 3) - (privacy * 5)   // 위반 페널티 합성(0이 최고). 느낌 아님.
  const verdict = (accurate === 0 && complete === 0 && privacy === 0) ? 'pass' : 'revise'
  ledger.push({ round, accurate, complete, privacy, q, verdict })
  log(`R${round}  지어냄 ${accurate} · 누락 ${complete} · PII/secret ${privacy} · q ${q} · ${verdict}`)

  if (q > best.q) best = { manual: cur, q }                    // keep-best
  if (verdict === 'pass') { log(`R${round} ✓ 전 게이트 통과(0/0/0) — 출하 준비`); break }
  if (prevQ !== null && q <= prevQ + 0.3) noImprove++; else noImprove = 0
  prevQ = q
  if (noImprove >= 2) { log('조기 종료 (2R 비개선) — best 채택(clean pass 아님, ledger 명시)'); break }
  if (round === MAX_ROUNDS) { log('max 라운드 도달 — best 채택(clean pass 아님, ledger 명시)'); break }

  const fixBundle = []
    .concat(av && av.fixes ? av.fixes : [])
    .concat(cv && cv.fixes ? cv.fixes : [])
    .concat(pv && pv.fixes ? pv.fixes : [])
  const rw = await agent(rewritePrompt(best.manual, fixBundle, newIds), { label: `maker:R${round}`, phase: 'Gate', schema: MANUAL_SCHEMA })
  cur = isObj(rw) ? rw : best.manual                           // 재생성도 best 에서 출발
}

const last = ledger[ledger.length - 1] || {}
const clean = last.verdict === 'pass'
// 반환: 호출자(SKILL)가 best.manual.markdown 을 out/<run>/update-manual.md 로 쓰고,
//        verify_manual.mjs(결정적 checker)로 실측한 뒤 출하. clean=false면 keep-best(비-clean)임을 run-ledger 에 명시.
return { run: RUN, manual: best.manual, ledger, best_q: best.q, clean, new_ids: newIds }
