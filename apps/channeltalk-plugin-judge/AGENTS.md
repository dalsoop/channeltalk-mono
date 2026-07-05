# AGENTS.md — channeltalk-plugin-judge

**심사 앱(대상과 분리).** `main/apps/channeltalk-plugin`(AX 해커톤 제출물)이 실제 가치가 있고
**1등이 가능한가**를, 서로 다른 렌즈의 **전문가 패널이 독립 채점**하고 종합 심판이 **1등 간극을
진단**한다. 범위 = **채점·진단만**(대상을 고치지 않는다). `agent-factory` 규약(역할=`.claude/agents/*.md`,
루프는 워크플로가 결정적으로) 재사용. 상위 규칙은 루트 `../../../AGENTS.md`.

## 핵심 원칙 (상시)

- **maker≠checker** — 심사관은 대상을 **직접 읽고**(테스트 실제 실행 포함) 채점한다. 제출자 주장(README·주석)을 그대로 점수화하지 않는다.
- **근거 없는 점수 금지** — 모든 dimension 점수에 `file:line`/실행출력 인용.
- **관대함·무비판 평균 금지** — 1등을 가리는 심사. 기본 자세는 반증. 근거 강도로 가중.
- **채점·진단만** — 이 앱은 대상을 수정하지 않는다. 산출은 점수 + 약점 + `gap_to_first`.
- **합성 루브릭 명시** — 공식 배점 미상 → README 5문항 + 해커톤 관행으로 합성한 루브릭임을 판정에 표기.

## 사용법 (진입점)

```
Workflow({ scriptPath: ".claude/skills/channeltalk-plugin-judge/workflow/judge-panel.mjs" })
→ { verdicts:[5인], synthesis }   # 디스크 쓰기·리포트는 호출자
```
또는 Agent 로 5인 심사관 + `head-judge-synthesizer` 를 직접 spawn(패널 병렬 → 종합).

## 인덱스

<!-- BEGIN AGENTS-INDEX (managed) -->
```
[channeltalk-plugin-judge index]|root: .
심사 대상     | target/submission-pointer.md        (= ../channeltalk-plugin/out/src · README · test/run.mjs)
루브릭(SSOT)  | .claude/skills/channeltalk-plugin-judge/references/judging-rubric.md   (6축·가중치·밴드·알려진 최대 논쟁점=오프라인 mock)
진입점/절차   | .claude/skills/channeltalk-plugin-judge/SKILL.md
패널(심사관)  | .claude/agents/{hackathon-judge,domain-pm-reviewer,senior-architect-reviewer,redteam-skeptic,ax-ai-native-reviewer}.md
종합 심판     | .claude/agents/head-judge-synthesizer.md   (가중합·밴드·gap_to_first)
루프          | .claude/skills/channeltalk-plugin-judge/workflow/judge-panel.mjs   (5 병렬 채점 → 종합)
스키마        | .claude/skills/channeltalk-plugin-judge/schemas/{panel-verdict,synthesis}.schema.json
런 산출       | out/<stamp>/{panel-verdicts.json,synthesis.json,report.md}   [gitignore]
```
<!-- END AGENTS-INDEX (managed) -->

## 검증

- 5인 verdict 가 `panel-verdict.schema.json` 유효 + 담당 축 채점.
- 종합이 `synthesis.schema.json` 유효(6축 rollup·weighted_overall·verdict_band·gap_to_first).
- technical_rigor 심사관이 대상 테스트를 **실제로 실행**한 출력을 근거로 인용했는지.
