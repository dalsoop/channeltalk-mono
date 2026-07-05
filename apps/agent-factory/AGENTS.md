# AGENTS.md — agent-factory

**에이전트를 만드는 에이전트(메타 공장).** 한 줄 요청 → spec → maker→checker 에이전트 팀 패키지
(agent들 + SKILL + 검증 스키마 + verification-gated 워크플로 + 도메인 SSOT)를 생성하고, 신선
검사관이 6축 루브릭으로 **9/10까지** 재생성한다. `channeltalk-integration-researcher`의
에이전트 루프는 **이 방식을 재사용**한다(루트 `AGENTS.md` 규약 8).

상위 규칙은 루트 `../../../AGENTS.md`. 여기선 이 앱 고유 규칙·인덱스만.

## 핵심 원칙 (상시)

- **maker만 찍지 않는다** — 생성물은 그 에이전트의 checker(검사도구)·게이트·루프까지 포함(없으면 V<7 출하 보류).
- **루프는 워크플로가 결정적으로 돈다** — 손으로 에이전트를 쓰지 말고 Workflow가 spec→generate→inspect→9/10.
- **검증 없는 출하 금지** — 의미 점수(inspector) + 호출자 실측(`quick_validate.py`·`node --check`·`JSON.parse`) 둘 다 통과.
- **역할은 에이전트 md** — `.claude/agents/*.md`가 정본, 워크플로는 그 압축본을 인라인 spawn(등록 의존 없음).

## 사용법 (재사용 진입점)

```
Workflow({ scriptPath: ".claude/skills/agent-factory/workflow/agent-factory-loop.mjs",
           args: { brief: "<한 줄 요청>", spec?: {...}, max_rounds?: 4, gate?: 9.0 } })
→ { spec, package:{files:[{path,content}]}, ledger, agent_score }   # 디스크 쓰기·실측은 호출자
```
출력 위치 규약: `in/<slug>/`(입력) → `research/<slug>/`(spec·ledger·manifest) → `out/<slug>/`(staging, gitignore)
→ 통과분만 `main/apps/<x>/.claude/`로 승격.

## 인덱스

<!-- BEGIN AGENTS-INDEX (managed) -->
```
[agent-factory index]|root: .
진입점/철학   | .claude/skills/agent-factory/SKILL.md
              | .claude/skills/agent-factory/references/agent-factory-philosophy.md   (6축 루브릭·Goodhart 방어)
maker         | .claude/agents/agent-architect.md
checker(신선) | .claude/agents/agent-inspector.md            (6축 9/10 게이트)
자기감사      | .claude/agents/factory-auditor.md            (teeth·dogfood·독립성)
루프          | .claude/skills/agent-factory/workflow/agent-factory-loop.mjs
자기검증      | .claude/skills/agent-factory/workflow/factory-selftest.mjs
결정적 검사   | .claude/skills/agent-factory/scripts/audit_agents.mjs · scripts/smoke_run.mjs
스키마        | .claude/skills/agent-factory/schemas/agent-spec.schema.json · factory-verdict.schema.json
템플릿        | .claude/skills/agent-factory/references/templates/{agent.md,SKILL.md,loop.mjs,verdict.schema.json}.tmpl
예제          | .claude/skills/agent-factory/examples/factory.run.example.yaml
```
<!-- END AGENTS-INDEX (managed) -->
