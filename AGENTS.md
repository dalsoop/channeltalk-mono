# AGENTS.md — channeltalk-mono

AI coding agent가 매 세션 **항상** 읽는 작업 규칙(수동 컨텍스트). 스킬처럼 "지금 찾아볼까"
결정하는 마찰 없이 시스템 프롬프트에 상주한다. 그래서 **스킬보다 이 파일을 우선**한다.
근거: Vercel, "AGENTS.md outperforms skills in our agent evals"
(https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) — passive context = 100%,
skills = 53~79%. 원리: **retrieval-led > pre-training-led**. 세부는 아래 인덱스에서 그때그때 읽는다.

> 정본 분리: 이 파일엔 **규칙 + 어디를 읽어야 하는지(인덱스)** 만 둔다. 도메인 본문·긴 계약은
> `CHANNELTALK.md`(정본)에 있고, 여기서 중복하지 않는다. 값·규칙이 바뀌면 정본을 먼저 고친다.

## 이 저장소

`channeltalk-mono` = **채널톡 연동 리서처**(AX 해커톤 Codex 플러그인) 작업 공간.
한 고객사의 기존 채널톡 연동(baseline) 대비 **새로 생긴 Open API 기능**을 **PII 안전하게**
매뉴얼로 뽑는 **maker→checker 에이전트 루프**. 설계 정본 = `CHANNELTALK.md`.

- 구조: 일반 git 저장소(다른 `*-mono`의 bare+worktree 아님). 작업 파일은 `main/apps/<app>/`.
- 로그훅: repo 루트에서 세션을 켜야 `.claude/settings.json`·`tools/save_log.py`·`logs/`가 맞물린다
  (해커톤 제출 로그는 **무편집**).

## 구현 규약 (MUST — 상시 적용)

`CHANNELTALK.md §13`의 압축본. 위반은 반려한다.

1. **하드코딩 금지** — 값·규칙은 정본→`ssot/*.json`·`schemas/*.json`·config에서 읽는다.
2. **유즈케이스 체크** — 새 코드는 `CHANNELTALK.md §1·§11` 유즈케이스에 매핑될 때만.
3. **모듈화** — `diff_surface`·`verify_manual`·`record_depth`·PII 게이트·mock 로더를 독립 모듈로.
4. **루프는 직접 돌리지 말고 팀에 위임** — 오케스트레이터는 maker→checker 팀을 구성·중계만. (→8·9)
5. **lint·모킹 결정적** — `node --check`+스키마 `JSON.parse`. mock은 오프라인·결정적, 네트워크·실키 금지.
   `provenance`(mock/inferred) 표기, `verified-live` 금지. secret 게이트로 실키 토큰 차단.
6. **평가(checker) 에이전트 분리** — maker와 다른 신선 에이전트가 정확·완전·PII안전 3축 채점(maker≠checker).
7. **완성 후 테스트코드** — `§11` 결정적 테스트(happy·멱등·secret음성·delta·verify음성·정책플래그·구조)를 회귀 게이트로.
8. **에이전트 루프는 `agent-factory` 방식 재사용** — brief/spec→architect(maker)→inspector(checker)→게이트→실측 출하.
9. **스킬보다 에이전트 md 우선** — 역할(maker·checker·평가)은 `.claude/agents/*.md`로. 스킬은 진입점·절차만.

## Git 워크플로 (필수 — Issue → PR → Review → Merge, main 직접 push 금지)

모든 변경은 **Issue → PR → Review → Merge**. `main` 은 **branch protection 으로 직접 push 차단**(강제). 루프의 마지막 "출하" 단계는 두 에이전트가 수행한다(agent-factory 철학 F-9):
- **`git-flow`**(`.claude/agents/git-flow.md`) — 이슈 생성 → 브랜치 → 명시 커밋 → push → PR(`Closes #이슈`) → pr-reviewer 위임.
- **`pr-reviewer`**(`.claude/agents/pr-reviewer.md`) — PR diff 를 신선하게 5렌즈로 검수하고 `gh pr review` 로 게시(maker≠checker 를 출하 diff 까지 확장).

- 🚫 `main` 직접 push·commit. 🚫 **에이전트 자동 머지·approve**(‌`gh pr merge`·`gh pr review --approve` 는 사람이). 🚫 `git add -A`·`git commit -a`(명시 경로만).
- ✅ `gh issue create` → `git switch -c <type>/<slug>` → 명시 add·커밋(관용 메시지 + Co-Authored-By) → `git push -u` → `gh pr create`(`Closes #N`) → **pr-reviewer 리뷰** → **사람 approve + 머지**.
- 검증(node --check·테스트 green) 통과분만 PR. PR body 에 검증 결과·not_verified 포함.
- **머지 = 사람 게이트, approve ≥1 필수.** branch protection = `required_approving_review_count:1` + PR 필수 + force-push/삭제 금지 + `enforce_admins:false`(admin override 허용). 그냥 통과 없음 — pr-reviewer `approve` verdict + 검증 green 이어도, **사람이 approving review 를 부여하고 머지**한다. `request_changes` 면 maker 로 되돌려 재수정→재리뷰.
- **봇 작성(정상 경로)**: solo 단일 계정은 자기 PR 을 self-approve 못 하므로, git-flow 가 PR 을 **GitHub App 봇**(`channeltalk-mono-bot[bot]`; `~/.env` 의 `GH_APP_*` → `node tools/mint_bot_token.mjs`)으로 올린다 → 작성자≠사람이라 **dalsoop 이 approve → `--admin` 없이 머지**. 봇 없으면 사람 작성 폴백 → admin 이 pr-reviewer verdict 확인 후 **의식적 override 머지**(`--admin`).
- 머지·push 가 protection 으로 막히면 **우회하지 말고** 막는 규칙을 보고.

## 인덱스 (retrieval-led — 필요할 때 그 파일을 연다)

<!-- BEGIN AGENTS-INDEX (managed; 파일 추가 시 갱신) -->
```
[channeltalk-mono index]|root: .
설계정본        | CHANNELTALK.md                (도메인·데이터 계약·게이트·PII·제출 §전체)
  ├ 데이터모델  | CHANNELTALK.md §4             (ssot/customers/out JSON 계약)
  ├ 루프·게이트 | CHANNELTALK.md §5             (maker→checker, diff 4게이트, done/keep-best)
  ├ PII 규칙    | CHANNELTALK.md §6             (방향성 R/W/CB, pii_policy→policy_flag)
  ├ 제출패키징  | CHANNELTALK.md §10            (Codex plugin.json·SKILL·logs 무편집)
  ├ 검증        | CHANNELTALK.md §11            (결정적 테스트 표)
  ├ mock 시드   | CHANNELTALK.md §12·§12-B      (v5 표면 22 features, baseline 시나리오)
  └ 구현규약    | CHANNELTALK.md §13            (위 MUST 원문)
3앱(빌드됨)     |
  ├ 모킹·엔진   | main/apps/channeltalk-api-mock/AGENTS.md               (ssot·lib·diff_surface·test)
  ├ 루프·검증   | main/apps/channeltalk-integration-researcher/AGENTS.md (verify_manual·record_depth·manual-team)
  └ 조립·제출   | main/apps/channeltalk-plugin/AGENTS.md                 (build_submission → submission.zip)
루프 재사용     | main/apps/agent-factory/AGENTS.md          (§규약8 근거)
제출 빌드       | node main/apps/channeltalk-plugin/scripts/build_submission.mjs   (→ out/submission.zip)
로그훅          | .claude/settings.json · tools/save_log.py  (Stop·SessionEnd → logs/)
```
<!-- END AGENTS-INDEX (managed) -->

## 하위 우선순위

가까운 `AGENTS.md`가 상위를 override 한다(앱 디렉터리의 `AGENTS.md` 우선). Codex 전용 완전
대체가 필요할 때만 같은 폴더에 `AGENTS.override.md`.
