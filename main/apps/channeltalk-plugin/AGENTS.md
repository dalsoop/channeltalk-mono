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
런타임 스킬 원본| skill-src/SKILL.md              (온보딩→diff→writer→verify 하드게이트→record · ## Commands · ## Boundaries · ## Exit criteria)
매니페스트     | plugin-src/.codex-plugin/plugin.json   (name·version·skills:./skills/)
packager       | scripts/build_submission.mjs    (조립·import 재작성·logs 복사·zip)
README         | README-src/README.md            (§10 5문항 + ## 검증)
빌드 산출      | out/src/ · out/submission.zip   (gitignore)
```
<!-- END AGENTS-INDEX (managed) -->

## 검증 (빌드 후 실측)
`node --check` 조립 .mjs 전부 · plugin.json JSON.parse · SKILL frontmatter+3섹션 · 조립 트리 스모크
(`diff_surface` new 22 · `verify_manual` approve — 재작성 import 런타임 실증) · zip self-inclusion 0.
