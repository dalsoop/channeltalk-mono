# 심사 대상 포인터 (target)

심사관은 아래를 **직접 읽고** 채점한다. 제출자 주장이 아니라 실물이 근거다.

## 대상 = channeltalk-plugin (AX 해커톤 제출물)

- 앱 루트: `../channeltalk-plugin/`  (이 파일 기준 상대. 절대경로: `/Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/main/apps/channeltalk-plugin`)
- **조립된 플러그인(실제 제출 트리)**: `../channeltalk-plugin/out/src/`
  - 매니페스트: `out/src/.codex-plugin/plugin.json`
  - 런타임 스킬: `out/src/skills/channeltalk-integration-researcher/SKILL.md`
  - 표면 SSOT: `out/src/skills/channeltalk-integration-researcher/ssot/api-surface.json` (pin 된 실 스펙에 대조·교정, 21 feature = 18 pinned + 3 inferred). pin 원본 `ssot/channel-swagger.json`("Channel Open Api" v28.0.3, 163 ops) + 해시 lock `ssot/provenance-lock.json`(sha256 `57249a6…`)
  - 스크립트/lib: `out/src/skills/.../scripts/*.mjs` · `lib/*.mjs`
  - 결정적 테스트: `out/src/skills/.../test/run.mjs`  ← 축3(기술)은 **이걸 실제로 실행**해서 통과 여부를 확인한다: `node out/src/skills/channeltalk-integration-researcher/test/run.mjs`
  - 역할 에이전트: `out/src/skills/.../agents/*.md`
  - 실행 산출(뎁스 1개 run): `out/src/skills/channeltalk-integration-researcher/out/260705190000-www.example.com/`
    - `run-receipt.json` — 영수증(counts·gates·not_verified·clean). 축2(문제·가치)·축3(기술) 인용 근거.
    - `update-manual.md` — maker 가 쓴 최종 연동 매뉴얼(신규 21 id 전수 섹션).
    - `manual-verdict.json` — checker(verify_manual) 결정적 판정(approve/missed).
    - `changes.json` · `surface.snapshot.json` — 결정적 diff 산출(게이트·정책 플래그) + 대조 표면.
- **제출 설명·5문항 답변**: `../channeltalk-plugin/out/README.md`

## 도메인 정본 (맥락 확인용, 대상 아님)

- `/Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/CHANNELTALK.md` — 문제·데이터계약·게이트·PII·제출·검증의 SSOT.

## 심사관이 반드시 재확인할 것 (믿지 말고 실행/인용)

1. 테스트가 **정말 통과하나** — `node .../test/run.mjs` 돌려서 exit·출력 확인(25 케이스, 25/25 기대 — pin 된 실 스펙 대조 4종 포함).
2. `260705190000-www.example.com/run-receipt.json` 의 수치(counts: new **21** · new_with_pii **8** · policy_hold **1** · new_inferred **3**; gates: diff `**5/5 pass**` · manual_deterministic `approve (missed 0)`; not_verified **3건**[webhook 3])가 **실물과 일치하나** — 같은 폴더 `changes.json`(gates 5키)·`manual-verdict.json`·`update-manual.md` 와도 대조. README 인용이 이 파일들을 그대로 가리킨다. (성숙 연동사 `260705190001-mature-site` 런: baseline 7 → new **14**, 동일 5/5·approve·clean.)
3. plugin.json이 `JSON.parse` 되나, SKILL.md frontmatter·3섹션이 있나.
4. 표면이 **pin 된 실 스펙 스냅샷**(해시 고정)에 대조·교정된 것이 README·SKILL에 정직하게 적혔나 — 5번째 게이트 `surface_in_pinned_spec` 가 실 스펙 실재를 검증하고, **`pinned` ≠ `verified-live`**(스냅샷 일치 ≠ 라이브 호출 확인)를 단정하지 않나. pin 이 잡은 교정(`user.list` 제거·`user.upsert` PUT→PATCH)이 서술됐나.
