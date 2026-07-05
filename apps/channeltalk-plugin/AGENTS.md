# AGENTS.md — channeltalk-plugin

**조립 대상 앱 = 제출물 packager.** `channeltalk-api-mock`(엔진) + `channeltalk-integration-researcher`
(루프·시드)를 **단일 소스에서 단일 Codex 플러그인 `src/`로 조립**해 `submission.zip`을 만든다(§10).
상위 규칙은 루트 `../../../AGENTS.md`, 제출 규격은 `../../../CHANNELTALK.md` §10.

## 원칙
- **단일 소스 조립** — 소스 스크립트를 복제·수정하지 않고 조립본에서만 import 경로 재작성.
- **import 재작성(핵심)** — `verify_manual`·`record_depth`의 `../../channeltalk-api-mock/lib/` → 조립 트리에선 `../lib/`.
- **logs 무편집** — repo 루트 `logs/`를 그대로 복사(편집 시 실격). export는 맨 마지막 수동 1회.
- **스크립트만** — `.mcp.json` 미사용(사용자 결정).

## Commands
```
node scripts/build_submission.mjs      # → out/src/ 조립 + out/submission.zip
```

## 인덱스
<!-- BEGIN AGENTS-INDEX (managed) -->
```
[channeltalk-plugin index]|root: .
authored 골격  | submission/  (최종 submission 레이아웃 그대로 미러 — 파편화 없음)
  ├ 런타임 스킬| submission/src/skills/channeltalk-integration-researcher/SKILL.md  (온보딩→diff→writer→verify 하드게이트→record · ## Commands · ## Boundaries · ## Exit criteria)
  ├ 매니페스트 | submission/src/.codex-plugin/plugin.json   (name·version·skills:./skills/)
  └ README     | submission/README.md            (§10 5문항 + ## 작동 방식 + ## 검증)
packager       | scripts/build_submission.mjs    (submission/ overlay + 공유코드/팀스킬 overlay + import 재작성·logs·zip)
팀 스킬(동봉) | ../channeltalk-integration-researcher/.claude/skills/channeltalk-manual-team/{references,schemas,workflow,SKILL.md} → out/src/skills/channeltalk-manual-team/  (4개 에이전트 md 참조 실체, dangling 0)
빌드 산출      | out/src/ · out/submission.zip   (gitignore)
```
<!-- END AGENTS-INDEX (managed) -->

## 검증 (빌드 후 실측)
`node --check` 조립 실행 .mjs 전부(workflow 정본 `channeltalk-manual-loop.mjs` 는 top-level return 규약이라 실행 스크립트 아님 — 제외) · plugin.json JSON.parse · SKILL frontmatter+3섹션 · 조립 트리 스모크
(`test/run.mjs` 9/9 · `verify_manual` approve — 재작성 import 런타임 실증) · **dangling 0 게이트**(4개 에이전트 md 참조 `skills/channeltalk-manual-team/{references,schemas}/…` + 팀 `SKILL.md` 레이아웃 서술 경로가 조립 트리에 전부 실재) · zip self-inclusion 0. 실측 참고: 최근 빌드 = 30파일 · 73,808 bytes.
