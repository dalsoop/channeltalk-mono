---
name: grounded-docs-team
description: 저장소·앱의 실제 코드·구조·AGENTS.md·현재 대화맥락 '만' 근거로 README/설명문서/해커톤 폼 답변을 절차 4요소 뼈대(작동순서→지식근거→판단·채점기준→막힐 때)로 쓰고, 신선 체커 4축(근거·쉬움·구조/글자수·말투)으로 게이트하는 maker→checker 문서작성 팀. maker(문서 writer) 1 + checker 4 + 채점 스키마 + verification-gated 워크플로(keep-best·run ledger·종료조건). 지어냄 0·전문용어 남발 0·4요소 순서·글자수 상한·말투 AI 티 0을 실측으로 지킨다. 트리거 — "README 써줘", "이 앱 설명 문서", "해커톤 폼 답변 써줘", "근거 있는 문서만", "글자수 맞춰 문서".
---

# grounded-docs-team — 근거에 갇힌·쉬운·절차 뼈대 문서 maker→checker 팀

너는 이 팀의 **오케스트레이터**다. 문서를 직접 손으로 쓰지 말고, **maker(writer)→checker(신선 4축) 루프를 워크플로로 돌려** 게이트(지어냄 0 · 쉬운말 ≥9 · 4요소 순서 ≥8 · 글자수 초과 0 · 말투 S1 0)를 통과한 문서를 받아 디스크에 출하한다.

## 철학 정본
> SSOT: `references/grounded-docs-philosophy.md`. 도메인 근거 정본: **각 대상 저장소/앱의 실제 코드·디렉터리 구조·해당 AGENTS.md·현재 대화맥락**(외부 정본 없음 — 없는 정보는 근거 없음, 지어내기 금지). 믿음: **문서 품질은 문장력이 아니라 근거 안에 갇혀 있고, 처음 보는 사람도 한 번에 이해되며, 절차 4요소 뼈대로 서 있고, 글자수를 실측으로 지키고, 사람이 쓴 말투로 읽히는 검증이다.** writer 만 두지 않는다 — checker 4 + 스키마 + 게이트 루프까지. maker ≠ checker.

## 서브에이전트 (`.claude/agents/`)
- `grounded-docs-writer` — 근거 → 문서(README/문서/폼답변) 작성/재작성 (maker)
- `docs-grounding-reviewer` — 근거 대조 지어냄·죽은 링크 적발 (checker, 신선) · grounded 게이트 (==0)
- `docs-plainness-reviewer` — 설명없는 전문용어·첫인상 (checker, 신선) · plain 게이트 (>=9.0)
- `docs-structure-count-reviewer` — 절차 4요소 순서·글자수 (checker, 신선) · structure(>=8.0)+charcount(초과==0) 게이트
- `docs-tone-reviewer` — 말투(AI 티) 검증 (checker, 신선) · ai-tell-taxonomy.md 기준 · S1==0 + tone_score(>=8.0) 게이트. 줄표(—) 수사·의문문 제목·과장 오프너·시각장식 남용·균일 리듬을 잡는다.

## 실행 — 루프는 워크플로가 돈다 (생략 불가)
이 스킬은 **진입점**이고, 생성 루프는 `workflow/grounded-docs-loop.mjs` 의 `export async function run(deps)` 가
결정적으로 실행한다. 이 파일은 **`node --check` 통과·import 가능**한 순수 모듈이다(top-level return 없음). 런타임이
`deps = { phase, agent, parallel, log, args }`(오케스트레이션 primitives + 주입 데이터)를 넘겨 호출한다.
```
// 런타임(Workflow/Codex)이 deps 를 주입:
import { run } from ".../workflow/grounded-docs-loop.mjs"
await run({ phase, agent, parallel, log,
            args: { request:"<한 줄 문서요청>", doc_type:"readme|doc|form_answer", audience:"...",
                    char_limit: 0,   // 0=제약 없음, >0=공백포함 wc -m 상한
                    evidence:{ files:[{path,excerpt}], tree, agents_md, conversation },  // 유일한 근거
                    link_targets:["./존재-확인된-경로"],   // test -e/ls 로 확정한 상대링크 화이트리스트
                    run:"<yymmddhhmmss-슬러그>", max_rounds: 4 } })
→ { run, doc:{content,claims,used_links}, ledger, best_q, clean, char_limit, doc_type }
```
- `run()` 이 하는 일: **maker 초안** → **4 checker 병렬 채점**(근거·쉬움·구조/글자수·말투, 각 코드 선검사 결합) → keep-best → 게이트 5축(지어냄0·쉬움≥9·구조≥8·초과0·말투 S1 0+tone≥8)/조기종료 → best 문서 반환. 역할 정본은 `.claude/agents/grounded-docs-*.md` + `docs-*-reviewer.md`, 루프는 그 압축본을 인라인 spawn(등록 의존 없음).
- Codex 제출 컨텍스트엔 Workflow/Agent API 가 없어 이 `run()` 을 직접 돌리지 않는다 — 루프는 이 SKILL 절차를 에이전트가 따라 돈다. `run()` 은 그 절차의 **결정적 참조 구현**(게이트·keep-best·종료조건·선검사 로직의 정본)이다.

## 파이프라인
1. **근거 로드** — 대상 저장소/앱의 코드 excerpt·디렉터리 구조(`ls -R`/tree)·해당 `AGENTS.md`·현재 대화맥락을 모아 `args.evidence` 로 주입. **상대링크로 걸 후보 경로는 `test -e`/`ls` 로 존재를 확인**해 `args.link_targets` 화이트리스트로 넘긴다. (하드코딩 금지 — 값은 실제 파일/맥락에서 읽는다. 없는 정보는 근거 없음.)
2. **팀 루프 실행** — 위 Workflow 호출. ledger 를 한 줄로 중계(`R1 지어냄2·쉬움6·구조5·초과40·말투 S1 3 → R2 0·9.5·9·0·S1 0 ✓출하`).
3. **디스크 출하 + 결정적 실측(Goodhart 2겹)** — 반환된 `doc.content` 를 요청된 파일(예: `README.md` / `<문서>.md` / `form-answer.txt`)로 쓴다. 그다음 **반드시 결정적으로 실측**:
   - **글자수**(제약 있을 때): `wc -m <파일>`(공백 포함) 값이 상한 이내인지 확인. 초과면 revise.
   - **상대링크**: 본문 `used_links` 각 경로가 실제 존재하는지 `test -e <경로> && echo ok || echo MISSING`(또는 `ls`). MISSING 이 있으면 revise.
   - `run-ledger.json` 은 `JSON.parse` 로 파싱 확인.
   - 실측 실패면 그 위반을 fixes 로 워크플로 한 번 더(회귀 1회) 또는 직접 처방.
4. **run-ledger 기록** — 라운드·5축 수치(지어냄·쉬움·구조·초과·말투 S1/tone)·`clean` 여부를 남긴다. `clean=false`(keep-best·비-clean pass) 면 ledger 에 명시.

## 운영 원칙
- **검증 없는 출하 금지**: 의미 채점(4 checker)만으로 출하하지 않는다. `wc -m`(글자수)·`test -e`(상대링크)·스키마 파싱을 반드시 통과해야 출하한다.
- **maker ≠ checker**: writer 는 자기 문서를 채점하지 않는다. 4 checker 는 신선(매 라운드 새 눈).
- **근거·범위 정직**: 코드·구조·AGENTS.md·대화맥락 밖 기능·수치·주장을 지어내지 않는다. **없는 정보는 안 쓴다**(못 쓰면 범위를 정직히 좁힌다).
- **쉬운 말·사람 말투**: 처음 보는 심사자 기준. 전문용어는 그 문장에서 풀어 쓴다. README 는 결과 먼저 첫인상. 의문문 소제목·대시 수사·과장 오프너·시각장식 남용 금지(말투 게이트).
- **무인 진행**: 루프 중 사람에게 묻지 않는다. 라운드·점수만 중계.

## 재현·검증 (실측) — AI 루프 산출은 결정적으로 재검증된다

이 루프의 신뢰는 "AI가 잘했다"가 아니라 **산출을 실측 명령으로 독립·결정적으로 재검증**하는 데 있다.

- **워크플로 파일은 런타임 래핑 스크립트다.** `workflow/grounded-docs-loop.mjs` 는 `export const meta` + `phase()/agent()/parallel()` 주입 + `export async function run` 을 쓰는 **Workflow/Codex 플러그인 런타임 전용**이다. `node --check` 는 top-level return 이 없어 통과한다. 검증 대상은 문법이 아니라 **루프의 산출**이다.
- **산출 재검증(결정적, 실측):**
  ```bash
  # 1) 글자수 상한 준수(공백 포함) — 제약이 있을 때
  wc -m out/<run>/README.md          # 값 <= char_limit 확인
  # 2) 상대링크 실재 — 본문이 건 경로마다
  test -e out/<run>/<링크경로> && echo ok || echo MISSING
  ```
- **shipped-runs = 루프 실행 증거.** `out/<run>/{<문서파일>(maker 산출), reviews/{grounding,plainness,structure-count,tone}-verdict.json(checker 4 산출), run-ledger.json(라운드별 5축·clean)}`.

## 파일 레이아웃
```
.claude/agents/grounded-docs-writer.md              maker (1)
.claude/agents/docs-grounding-reviewer.md           checker (신선) · grounded ==0
.claude/agents/docs-plainness-reviewer.md           checker (신선) · plain >=9.0
.claude/agents/docs-structure-count-reviewer.md     checker (신선) · structure>=8 + 글자수 초과==0
.claude/agents/docs-tone-reviewer.md                checker (신선) · 말투 S1==0 + tone>=8.0
skills/grounded-docs-team/SKILL.md                  진입점(이 파일)
skills/grounded-docs-team/schemas/*.schema.json     채점 스키마 4종(grounding·plainness·structure-count·tone)
skills/grounded-docs-team/references/grounded-docs-philosophy.md  도메인 SSOT 루브릭
skills/grounded-docs-team/workflow/grounded-docs-loop.mjs         verification-gated 루프
skills/grounded-docs-team/examples/grounded-docs.run.example.yaml 실행 바인딩 예시
결정적 실측: wc -m(글자수) · test -e/ls(상대링크)
```
