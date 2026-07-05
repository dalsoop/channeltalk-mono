# agent-factory

> **에이전트를 만드는 에이전트(메타 공장).** 한 줄 요청을 넣으면, *바로 쓸 수 있는* `maker→checker`
> 에이전트 팀 패키지를 통째로 찍어내고, **신선한 검사관이 9/10 이 될 때까지** 스스로 재생성한다.
>
> 이 모노레포 전체의 작업 체계(에이전트 루프·git 흐름·구성)는 저장소 최상위
> [channeltalk-mono/README.md](../../README.md) 에 정리돼 있다. 이 문서는 "루프 엔진"인
> agent-factory 를 **어떻게 쓰는가**에 집중한다.

---

## 1. 뭔가요?

새 자동화가 필요할 때마다 사람이 손으로 프롬프트를 쓰고, 그걸 또 손으로 검사하는 건 느리고 못 미덥다.
agent-factory 는 그 과정을 **결정적 파이프라인**으로 만든다:

```
"OO 하는 에이전트 만들어줘"
        │
        ▼
   [ agent-factory ]
        │
        ▼
  maker→checker 팀 패키지  ─  agent(들) · SKILL · 검증 스키마
                              · verification-gated 워크플로 · 도메인 SSOT
```

찍어낸 결과물은 **maker(만드는 에이전트)만이 아니다.** 그 에이전트를 검사할 checker·게이트·루프까지
한 세트로 나온다. 그래서 만든 순간부터 "검증되는" 상태다.

> 이 저장소의 `channeltalk-integration-researcher` 에이전트 루프도 **이 방식을 재사용**한다
> (루트 `AGENTS.md` 규약 8). 즉 agent-factory 는 이 모노레포의 루프 표준이다.

---

## 2. 핵심 원칙 (왜 믿을 수 있나)

- **maker 만 찍지 않는다** — 생성물엔 그 에이전트의 checker(검사도구)·게이트·루프가 포함된다.
  없으면 점수 미달로 출하 보류.
- **루프는 워크플로가 결정적으로 돈다** — 손으로 에이전트를 spawn 하지 않는다.
  코드(Workflow)가 `spec → generate → inspect → 9/10` 라운드를 돌린다.
- **검증 없는 출하 금지** — 의미 점수(신선 inspector) **와** 호출자 실측
  (`quick_validate.py`·`node --check`·`JSON.parse`) **둘 다** 통과해야 한다.
- **역할은 에이전트 md 가 정본** — `.claude/agents/*.md` 가 진실의 원천. 워크플로는 그 압축본을
  인라인으로 spawn 해서 등록 의존 없이 돈다.

---

## 3. 어떻게 쓰나

### 경로 A — 스킬 트리거 (쉬운 길)

대화에서 이렇게 말하면 `agent-factory` 스킬이 뜬다:

- "**에이전트 만들어줘**", "OO 하는 에이전트 구성해줘"
- "메타 에이전트", "에이전트 공장", "검증되는 에이전트 팀 뽑아줘"

### 경로 B — 워크플로 직접 호출 (재사용 진입점)

```js
Workflow({
  scriptPath: ".claude/skills/agent-factory/workflow/agent-factory-loop.mjs",
  args: {
    brief: "<한 줄 요청>",   // 필수 — 무엇을 하는 에이전트인가
    spec: { /* … */ },       // 선택 — 이미 정한 스펙이 있으면
    max_rounds: 4,           // 선택 — 게이트 재생성 최대 라운드
    gate: 9.0                // 선택 — 통과 기준(6축 평균)
  }
})
// → { spec, package: { files: [{ path, content }] }, ledger, agent_score }
//   ※ 디스크 쓰기·실측(quick_validate·node --check)은 호출자가 수행한다.
```

반환은 **파일 내용까지 담긴 패키지**다. 실제로 디스크에 쓰고 실측하는 건 호출자 몫이라, 파이프라인이
결정적으로 유지된다.

---

## 4. 파이프라인 — 한 라운드가 도는 법

```
brief
  │  architect(maker): brief → spec → 팀 패키지 생성
  ▼
 팀 패키지 (agent · SKILL · schema · workflow · SSOT)
  │  inspector(신선 checker): 6축 장인성 루브릭으로 채점
  ▼
 9/10 ? ──아니오──▶ 지적 반영해 재생성 (max_rounds 까지)
  │ 예
  ▼
 통과분만 승격
```

### 출력 위치 규약

```
in/<slug>/        입력(브리프·초기 스펙)
   ↓
research/<slug>/  spec · ledger · manifest (과정 기록)
   ↓
out/<slug>/       staging (gitignore — 검증 전 산출)
   ↓
main/apps/<x>/.claude/    ★ 게이트 통과분만 여기로 승격
```

즉 **검증을 통과하기 전엔 `out/`(gitignore)에만** 있고, 9/10 을 넘긴 것만 실제 앱의 `.claude/` 로
올라간다. 미검증 산출이 저장소를 오염시키지 않는다.

---

## 5. 구성 (인덱스)

| 무엇 | 어디 |
|---|---|
| 진입점 / 철학(6축 루브릭·Goodhart 방어) | `.claude/skills/agent-factory/SKILL.md` · `references/agent-factory-philosophy.md` |
| **maker** — 스펙→팀 패키지 생성 | `.claude/agents/agent-architect.md` |
| **checker(신선)** — 6축 9/10 게이트 | `.claude/agents/agent-inspector.md` |
| **자기감사** — teeth·dogfood·독립성 | `.claude/agents/factory-auditor.md` |
| 루프 / 자기검증 | `.claude/skills/agent-factory/workflow/{agent-factory-loop,factory-selftest}.mjs` |
| 결정적 검사 | `.claude/skills/agent-factory/scripts/{audit_agents,smoke_run}.mjs` |
| 스키마 / 템플릿 / 예제 | `.claude/skills/agent-factory/{schemas,references/templates,examples}/` |

> 규칙·인덱스 정본은 [`AGENTS.md`](AGENTS.md) 다. 이 README 는 사용법 요약이고, 세부는 위 파일들을
> 필요할 때 연다(retrieval-led).

---

*원칙은 하나다 — **maker 만 찍지 말고, 검사·게이트·루프까지 한 세트로. 9/10 전엔 승격 없음.***
