---
name: channeltalk-manual-team
description: 결정적 diff(changes.json)+surface.snapshot.json 를 받아 채널톡 신규 기능별 PII-안전 연동 매뉴얼(update-manual.md)을 쓰고 신선 평가 3축(정확·완전·개인정보)으로 게이트하는 maker→checker 에이전트 팀. maker(매뉴얼 writer) 1 + checker 3 + 채점 스키마 + verification-gated 워크플로(keep-best·run ledger·종료조건). 트리거 — "채널톡 매뉴얼 써줘", "changes.json 으로 연동 매뉴얼", "update-manual 생성", "신규 기능 매뉴얼 루프".
---

# channeltalk-manual-team — 채널톡 연동 매뉴얼 maker→checker 팀

너는 이 팀의 **오케스트레이터**다. 매뉴얼을 직접 손으로 쓰지 말고, **maker(writer)→checker(신선 평가 3축) 루프를 워크플로로 돌려** 게이트(지어냄 0·누락 0·PII누락+secret누출 0)를 통과한 `update-manual.md` 를 받아 디스크에 출하한다.

## 철학 정본
> SSOT: `references/channeltalk-manual-philosophy.md` + 도메인 `/Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/CHANNELTALK.md`(§5 루프·§6 PII·§12 표면). 믿음: **매뉴얼의 품질은 문장력이 아니라 근거(changes+surface) 안에 갇혀 있고 실측 카운트로 0/0/0 까지 밀리는 검증이다.** maker 만 찍지 않는다 — checker 3 + 스키마 + 게이트 루프까지. maker ≠ checker.

## 서브에이전트 (`.claude/agents/`)
- `channeltalk-manual-maker` — changes+surface → `update-manual.md` 작성/재작성 (maker)
- `channeltalk-accuracy-reviewer` — SSOT 대조 지어냄 적발 (checker, 신선) · accurate 게이트
- `channeltalk-completeness-reviewer` — 신규 id 전수 커버 (checker, 신선) · complete 게이트
- `channeltalk-privacy-reviewer` — PII 주의·예제 secret·정책 플래그 (checker, 신선) · privacy_safe 게이트

## 실행 — 루프는 워크플로가 돈다 (생략 불가)
이 스킬은 **진입점**이고, 생성 루프는 **워크플로**가 결정적으로 실행한다.
```
Workflow({ scriptPath: ".../workflow/channeltalk-manual-loop.mjs",
           args: { changes:<changes.json 파싱본>, surface:<surface.snapshot.json 파싱본>,
                   run:"<yymmddhhmmss-고객사>", max_rounds: 3 } })
→ { run, manual:{markdown,covered_ids}, ledger, best_q, clean, new_ids }
```
- 워크플로가 하는 일: 신규 id 전수 추출 → **maker 초안** → **3 checker 병렬 채점**(정확·완전·개인정보, 각 코드 선검사 max 심판) → keep-best → 0/0/0 게이트/조기종료 → best 매뉴얼 반환. 역할 정본은 `.claude/agents/channeltalk-manual-*.md`, 워크플로는 그 압축본을 인라인 spawn(등록 의존 없음).

## 파이프라인
1. **입력 로드** — `out/<run>/changes.json` + `out/<run>/surface.snapshot.json` 를 `JSON.parse` 해 `args.changes`/`args.surface` 로 주입. (하드코딩 금지 — 값은 파일에서 읽는다.)
2. **팀 루프 실행** — 위 Workflow 호출. ledger 를 한 줄로 중계(`R1 지어냄1·누락2·PII0 → R2 0·0·0 ✓출하`).
3. **디스크 출하 + 결정적 실측(Goodhart 2겹)** — 반환된 `manual.markdown` 을 `out/<run>/update-manual.md` 로 쓴다. 그다음 **반드시 결정적 checker 로 실측**:
   - 결정적 verify 스크립트 실경로: `apps/channeltalk-integration-researcher/scripts/verify_manual.mjs`(researcher 앱 루트 기준). 계약은 **`--run` 플래그가 없다** — 파일 경로를 직접 준다:
     ```
     node apps/channeltalk-integration-researcher/scripts/verify_manual.mjs \
       --changes out/<run>/changes.json \
       --manual  out/<run>/update-manual.md \
       --out     out/<run>/manual-verdict.json
     ```
     `--round <n>` 은 선택. **exit code = 계약**: `approve → 0`, `revise → 3`(CI 가 검증 실패를 잡도록). 스크립트는 신규 id 누락·PII 주의 누락·secret 누출을 검사해 `manual-verdict.json`(verdict `approve`|`revise`, `missed[]`)을 낸다(§5.3 결정적 verify).
   - `manual-verdict.json`·`out/<run>/run-ledger.json` 은 `JSON.parse` 로 파싱 확인.
   - `verdict==revise`(exit 3) 면 그 `missed[]` 를 fixes 로 워크플로 한 번 더(회귀 1회) 또는 직접 처방.
4. **run-ledger 기록** — `out/<run>/run-ledger.json` 에 라운드·점수·`clean` 여부를 남긴다. `clean=false`(keep-best·비-clean pass) 면 ledger 에 명시(§5.4).

## 운영 원칙
- **검증 없는 출하 금지**: 의미 채점(3 checker)만으로 출하하지 않는다. 결정적 verify(`apps/channeltalk-integration-researcher/scripts/verify_manual.mjs` — `--changes`/`--manual`, exit `approve=0`·`revise=3`)와 스키마 파싱을 반드시 통과해야 출하한다.
- **maker ≠ checker**: maker 는 자기 매뉴얼을 채점하지 않는다. 3 checker 는 신선(매 라운드 새 눈).
- **근거·범위 정직**: changes+surface 밖 엔드포인트·필드·헤더를 지어내지 않는다. provenance 는 `mock`|`inferred` 만(verified-live 금지).
- **개인정보 보수**: pii/policy 있는 기능은 §6 방향별 주의 필수. 예제는 플레이스홀더만.
- **무인 진행**: 루프 중 사람에게 묻지 않는다. 라운드·점수만 중계.

## 파일 레이아웃
```
.claude/agents/channeltalk-manual-maker.md            maker (1)
.claude/agents/channeltalk-accuracy-reviewer.md       checker (신선)
.claude/agents/channeltalk-completeness-reviewer.md   checker (신선)
.claude/agents/channeltalk-privacy-reviewer.md        checker (신선)
skills/channeltalk-manual-team/SKILL.md               진입점(이 파일)
skills/channeltalk-manual-team/schemas/*.schema.json  채점 스키마 3종
skills/channeltalk-manual-team/references/channeltalk-manual-philosophy.md  도메인 SSOT 루브릭
skills/channeltalk-manual-team/workflow/channeltalk-manual-loop.mjs         verification-gated 루프
결정적 verify: apps/channeltalk-integration-researcher/scripts/verify_manual.mjs (--changes/--manual, exit approve=0·revise=3)
```
