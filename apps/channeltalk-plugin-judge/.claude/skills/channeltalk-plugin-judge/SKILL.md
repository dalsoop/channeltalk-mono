---
name: channeltalk-plugin-judge
description: AX 해커톤 제출물 channeltalk-plugin 을 5인 전문가 패널(해커톤심사·도메인PM·시니어아키텍트·레드팀·AX/AI-native)로 독립 채점하고 종합 심판이 가중 점수·1등 간극을 진단하는 심사 앱. maker≠checker(대상을 직접 읽고 채점, 제출자 주장 불신). 채점·진단만 — 대상을 고치지 않는다. "이 플러그인 1등 가능한지", "제출물 심사/채점", "약점 진단" 요청에 사용.
---

# channeltalk-plugin-judge — 제출물 심사 패널

`main/apps/channeltalk-plugin`(AX 해커톤 Codex 플러그인)이 **실제 가치가 있고 1등이 가능한가**를,
서로 다른 렌즈의 **전문가 패널이 독립 채점**하고 **종합 심판이 진단**하는 앱. 심사는 대상과 **분리**돼 있다(대상은 실제 채널톡용 산출물, 이 앱은 그걸 채점만 한다).

- **범위 = 채점·진단만.** 대상을 수정하지 않는다. 산출은 점수 + 약점 + 1등 간극 리포트.
- **maker≠checker.** 심사관은 대상을 직접 읽고(테스트 실제 실행 포함) 채점한다. 제출자 주장을 그대로 점수화하지 않는다.
- 루브릭 SSOT: `references/judging-rubric.md`(6축·가중치·밴드·알려진 최대 논쟁점). 대상 포인터: `../../../target/submission-pointer.md`.

## 패널 (역할 = `.claude/agents/*.md`)

| 심사관 | 렌즈 | 담당 축 |
|---|---|---|
| `hackathon-judge` | 심사위원장 — 1등인가·wow·차별성 | differentiation |
| `domain-pm-reviewer` | 채널톡 PM — 실재 문제·실사용·PMF | problem_value · usability_fit |
| `senior-architect-reviewer` | 아키텍트 — 코드·결정성·**테스트 실제 실행** | technical_rigor |
| `redteam-skeptic` | 적대적 반증 — 오프라인 mock 치명성 공격 | (치명약점) usability_fit · differentiation |
| `ax-ai-native-reviewer` | AI-native — 루프 진정성·로그·정직성 | ai_native · honesty_presentation |
| `head-judge-synthesizer` | 종합 심판 — 가중합·밴드·gap_to_first | (종합) |

## 절차

1. **패널 병렬 채점** — 5인 심사관이 각자 대상을 직접 읽고 `panel-verdict.schema.json` 으로 독립 채점(배리어: 종합은 5개 전부 필요).
2. **종합** — `head-judge-synthesizer` 가 5개 verdict 를 근거 강도로 가중 종합 → `synthesis.schema.json`(가중 점수·밴드·critical_weaknesses·gap_to_first·win_probability).
3. **리포트** — 종합 산출을 `out/<stamp>/{panel-verdicts.json,synthesis.json,report.md}` 로 남긴다(gitignore).

## Commands

같은 패널(역할·프롬프트·스키마 동일)을 **두 런타임**으로 돌릴 수 있다. 계약 동일: `{ verdicts:[≤5], synthesis }`.

```bash
# (A) Claude 런타임 — 결정적 오케스트레이션(캐논). Workflow 로 실행하거나 Agent 로 5인+종합 직접 spawn.
Workflow({ scriptPath: ".claude/skills/channeltalk-plugin-judge/workflow/judge-panel.mjs" })
# → { verdicts:[5], synthesis } . 디스크 쓰기·리포트 렌더는 호출자.

# (B) Codex CLI 런타임 — 순수 node CLI 가 `codex exec` 5개 병렬 + 종합을 돈다(codex login 전제).
node .claude/skills/channeltalk-plugin-judge/workflow/codex-panel.mjs
node .claude/skills/channeltalk-plugin-judge/workflow/codex-panel.mjs --only redteam-skeptic --no-synth  # 1인 스모크
# → out/codex-<stamp>/{judge-*.json, synthesis.json, report.json} (gitignore). report.json.loop_healthy 로 판정.
```

두 런타임 모두 `-s read-only`(채점만·쓰기 없음). Codex 판은 정본 스키마에서 OpenAI strict 사본을 파생(정본 불변).

## Boundaries

- ✅ 대상을 직접 읽고 테스트를 실제 실행해 채점. 모든 점수에 file:line/실행출력 근거.
- ✅ 합성 루브릭임을 판정에 명시(공식 배점 미상).
- ⚠️ 이 앱은 **대상을 고치지 않는다**(채점·진단만). 개선은 별도 요청/앱.
- 🚫 관대한 채점·무비판 평균 금지. 근거 없는 점수 금지. 제출자 주장 맹신 금지.

## Exit criteria

- 5인 verdict 전부 스키마 유효 + 담당 축 채점됨.
- 종합 산출이 6축 rollup + `weighted_overall` + `verdict_band` + `gap_to_first` 포함.
- 리포트에 "1등까지 무엇이 달라져야 하는가"가 구체적으로 적힘.
