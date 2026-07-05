# AGENTS.md — channeltalk-integration-researcher

**구현 대상 앱.** 채널톡 baseline 대비 신규 Open API 기능을 PII 안전하게 매뉴얼로 뽑는
maker→checker 에이전트 루프(AX 해커톤 Codex 플러그인). 현재는 스캐폴딩 단계 — 아래 정본을
근거로 구현한다. 상위 규칙은 루트 `../../../AGENTS.md`, 설계 본문은 그 옆 `CHANNELTALK.md`.

## 설계 정본 (여기서 지어내지 말 것)

- **`../../../CHANNELTALK.md`** — 도메인·데이터 계약·게이트·PII·제출·검증의 **단일 정본**.
  구현 값(표면·PII 필드·게이트 임계·경로)은 전부 여기(→`ssot/*.json`)에서 읽는다(하드코딩 금지).

## 구현 순서 (규약 준수)

`CHANNELTALK.md §13`을 전제로 한다. 빌드 시:

1. **모듈 골격** — `ssot/api-surface.json`(§12 시드) + `scripts/{diff_surface,verify_manual,record_depth}.mjs`
   를 독립 모듈로. 각 `node --check`·스키마 `JSON.parse` 통과.
2. **결정적 diff + 4게이트**(§5.1) 먼저 — diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged.
3. **에이전트 루프는 `agent-factory` 방식으로 위임**(규약 4·8) — 직접 매뉴얼 쓰지 말고
   maker(writer)→checker(평가) 팀을 `main/apps/agent-factory` 워크플로로 생성·게이트.
   역할은 **`.claude/agents/*.md`** 로 두고 스킬은 진입점만(규약 9).
4. **평가 에이전트**(규약 6) — 정확·완전·PII안전 3축(§5.3), maker≠checker.
5. **완성 후 테스트코드**(규약 7) — §11 결정적 테스트 표를 실제 테스트로.
6. **제출 패키징**(§10) — 맨 마지막 뎁스에서 `src`(plugin.json·SKILL·scripts·ssot) + README + logs(무편집) → `submission.zip`.

## 인덱스

<!-- BEGIN AGENTS-INDEX (managed; 파일 생기면 갱신) -->
```
[channeltalk-integration-researcher index]|root: .
설계정본     | ../../../CHANNELTALK.md          (§4 데이터모델 · §5 루프 · §6 PII · §10 제출 · §11 검증 · §12 시드 · §13 규약)
엔진(소비)   | ../channeltalk-api-mock/AGENTS.md   (표면·diff·lib — 상호의존 계약 = schemas/)
결정적 스크립트| scripts/verify_manual.mjs (checker, approve|revise) · scripts/record_depth.mjs (뎁스 누적·--adopt)
매뉴얼 팀    | .claude/agents/channeltalk-{manual-maker,accuracy-reviewer,completeness-reviewer,privacy-reviewer}.md
             | .claude/skills/channeltalk-manual-team/  (SKILL·workflow·verdict 스키마 3·philosophy)
고객 시드    | customers/{www.example.com,mature-site}/{profile,baseline}.json  (§12-B)
런 산출      | out/<stamp>-<customer>/  (changes·surface.snapshot·update-manual·manual-verdict·run-receipt) [gitignore]
```
<!-- END AGENTS-INDEX (managed) -->
