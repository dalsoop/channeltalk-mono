# agent-factory — 에이전트를 만드는 에이전트

이 워크스페이스(`agent-creator-mono`)의 **메타 공장**. cardnews-creator·shorts-creator 같은
*제품 에이전트*를 찍어내는 *상위 도구*다. 루트 `agent-creator-mono/.claude` → 이 폴더 심볼릭 링크.

## 무엇을 하나
한 줄 요청("OO 하는 에이전트 만들어줘") →
1. **spec** — 목적·maker 역할·**성공조건**(=검사도구 채점축)·checker 목록으로 구조화.
2. **generate** (`agent-architect`, maker) — maker 1 + **checker(검사도구) ≥1** + 채점 스키마 + **verification-gated 워크플로**(keep-best·ledger·종료조건) + 도메인 SSOT + 예제를 파일 manifest로 생성.
3. **inspect** (`agent-inspector`, 신선 checker) — 6축 장인성 루브릭으로 0~10 채점, **9/10 게이트**.
4. **keep-best + 재생성** — blockers만 반영해 9/10까지.
5. **호출자 실측 출하** — 디스크에 쓰고 `quick_validate.py`·`node --check`·`JSON.parse`로 확인 후 `main/apps/<x>/.claude/`로 승격.

핵심: **maker만 찍지 않는다.** 생성물은 그 에이전트의 *검사도구·게이트·루프*까지 포함한다.

## 구성
```
.claude/
├── agents/
│   ├── agent-architect.md     (maker: spec → 패키지)
│   └── agent-inspector.md     (checker: 6축 9/10 게이트)
└── skills/agent-factory/
    ├── SKILL.md               (오케스트레이터 진입점)
    ├── references/
    │   ├── agent-factory-philosophy.md   (SSOT: 믿음·6축 루브릭·Goodhart 방어·Factory-tells)
    │   └── templates/         (agent.md / SKILL.md / loop.mjs / verdict.schema.json 템플릿)
    ├── schemas/
    │   ├── agent-spec.schema.json        (입력 spec)
    │   └── factory-verdict.schema.json   (inspector 출력)
    ├── examples/factory.run.example.yaml
    └── workflow/agent-factory-loop.mjs   (brief→spec→generate→inspect→9/10)
```

## 실행
스킬 `agent-factory`를 트리거하거나 직접:
```
Workflow({ scriptPath: "skills/agent-factory/workflow/agent-factory-loop.mjs",
           args: { brief: "유튜브 썸네일을 만드는 에이전트", max_rounds: 4, gate: 9.0 } })
```
반환 `{spec, package, ledger, agent_score}` → 파일을 디스크에 쓰고 실측 검증 후 출하.

## 계보
gaasher/Agent-Loop-Skills(verification-gated loop), ADAS·Gödel Agent(메타에이전트 생성→평가→반복),
Reflexion/Self-Refine(생성→비평→수정), Anthropic Agent Skills(품질 축). 작동하는 정본 모델: `apps/cardnews-creator`.
