# Agent Factory Philosophy — 검증으로 9/10까지 미는 에이전트 공장 (SSOT)

이 공장은 **에이전트를 만드는 에이전트**다. 정본 믿음·루브릭·게이트·반금지(Goodhart) 규율을 담는다.
패턴 계보: gaasher/Agent-Loop-Skills(verification-gated loop), ADAS·Gödel Agent(메타에이전트 생성→평가→반복),
Reflexion/Self-Refine(생성→비평→수정, 1~2R 수렴), Anthropic Agent Skills(스킬 품질 축).
이 워크스페이스의 정본 모델: `apps/cardnews-creator`(maker→checker, keep-best, 게이트, 원장).

## 믿음 (한 줄)

> 좋은 에이전트는 영리한 프롬프트가 아니라 **자기를 실측 신호로 채점해 기준선까지 미는 검증 시스템**이다.
> 그래서 공장은 maker만 찍지 않는다. **그 에이전트의 검사도구(checker)·스키마·게이트·루프까지 생성**하고,
> 공장 자신도 생성물을 **9/10이 될 때까지** maker→checker로 검증한다.

## 두 개의 재귀 (공장의 정체성)

1. **공장 = maker→checker.** `agent-architect`(maker)가 패키지를 짓고, `agent-inspector`(checker, 신선)가 채점한다. 자기 글에 도장 안 찍는다.
2. **공장이 찍는 것도 maker→checker.** 생성되는 모든 에이전트 팀은 maker 1 + checker N + 스키마 + 게이트 루프를 갖춰야 한다. checker 없는 maker만 찍으면 **그 자체가 결함**(rubric V 0점).

## 생성물 패키지 (한 에이전트 팀 = 이 파일들)

```
agents/<x>-<maker>.md            # 일하는 maker (1)
agents/<x>-<checker>.md  × N     # 검사도구 (≥1, 신선 채점, 게이트)
skills/<x>-team/SKILL.md         # 오케스트레이터 진입점
skills/<x>-team/schemas/*-verdict.schema.json   # 채점 스키마
skills/<x>-team/references/<x>-philosophy.md     # 도메인 기준(SSOT 루브릭)
skills/<x>-team/workflow/<x>-loop.mjs            # verification-gated 루프(기준선까지)
skills/<x>-team/examples/<x>.run.example.yaml    # 바인딩
```

## 에이전트 장인성 루브릭 (생성물을 이 6축으로 채점, 각 0~10)

| 축 | 무엇 | 가중 |
|---|---|---|
| **S 구조(structure)** | frontmatter(name/description/tools/model) 유효, 파일 레이아웃·SKILL 섹션 규약 준수. **생성물/조립물 구조가 최종 사용처 레이아웃을 미러**(authored 원본 파편화·`-src` 남발 금지 — F-8) | ×1 |
| **R 역할(role_clarity)** | maker는 한 역할에 집중, 입력·철칙·출력(JSON) 명확. maker와 checker가 분리돼 있나 | ×1 |
| **V 검증설계(verification_design)** | 생성물에 **진짜 게이트**가 있나 — 실측 신호 채점 + maker≠checker + 스키마 + keep-best + run ledger + 종료조건. 이게 공장의 핵심 | **×2** |
| **P 프롬프트(prompt_quality)** | 슬림·지시형·결정적 출력(스키마), 군더더기 없음, 사실/범위 보존 규칙 명시 | ×1 |
| **G 정직(anti_gaming)** | checker가 신선(자기 채점 금지), 게이트가 실측이지 칭찬 아님, 큰 재작성 감점, 범위 정직 | ×1 |
| **U 실행성(runnability)** | 스키마가 파싱되고, 워크플로가 돌고(top-level return 제외 문법 정상), 이름이 해소됨 | ×1 |

`agent_score` = (S + R + **V×2** + P + G + U) / 7.  **게이트: `agent_score ≥ 9.0` → "ship". 미만 → "revise".**
V가 7 미만이면 종합 상한 8.9(검증 없는 에이전트는 절대 출하 안 함).

> **P·S 축(프롬프트·구조·정보계층) 장인성 정본** = `writing-great-skills`(github.com/mattpocock/skills, MIT).
> 정의 어휘: `/Users/jeonghan/.codex/skills/writing-great-skills/GLOSSARY.md`. architect는 이 어휘로 **쓰고**, inspector는 이 어휘로 **채점**한다.
> 핵심 레버 — **Predictability**(근본 덕목: 같은 *과정*을 매번), **Leading Word**(개념은 문장 아닌 토큰으로), **Progressive Disclosure**(일부 branch만 쓰는 reference는 pointer 뒤로), **Completion Criterion**(체크가능·exhaustive), 실패모드 **No-Op·Duplication·Sediment·Sprawl·Premature Completion**. 이 공장의 F-6(비대·장식)·F-7 처방을 이 어휘가 구체화한다. 중복 서술 금지 — 정의는 GLOSSARY 한 곳(SSOT).

## 안티패턴 — 'Factory tells' (공장이 찍으면 안 되는 신호)

| ID | Tell | 처방 |
|---|---|---|
| F-1 | maker만 있고 checker 없음 | checker(검사도구)+스키마+게이트 동반 생성 [V] |
| F-2 | 게이트가 "잘 했나?" 자기 채점 | 신선 checker가 실측 신호로 채점 [G] |
| F-3 | 점수 없는 '느낌' 합격 | 0~10 수치 게이트 + run ledger [V] |
| F-4 | 종료조건 없음(무한 루프 위험) | max_rounds + 2R 비개선 조기종료 [V] |
| F-5 | keep-best 없음(회귀) | best에서 출발, 더 나을 때만 채택 [V] |
| F-6 | 프롬프트 비대·장식 | 슬림 룰북, 지시형, JSON 출력 [P] |
| F-7 | 사실/범위 보존 규칙 누락 | "지어내기 금지·범위 정직" 명시 [P·G] |
| F-8 | authored 원본을 최종 레이아웃과 무관하게 파편화(예: `plugin-src`·`skill-src`·`README-src` 로 흩뿌리고 빌드가 봉합) | 최종 배치를 **미러하는 단일 골격**(예: `submission/`)에 두고, 빌드는 **공유 코드만 overlay**·경로 재작성 [S] |
| F-9 | 변경/출하를 `main` 에 직접 push·머지, 또는 리뷰 없이 자기 코드 머지 | **Issue → PR → Review → Merge** 로만. `git-flow`(이슈·브랜치·커밋·PR·리뷰 위임) + **신선 `pr-reviewer`**(PR diff checker)가 루프의 마지막 단계. **머지는 사람 게이트**(에이전트 자동 머지 금지), main 직접 push 금지(branch protection 강제) [G] |

## Goodhart 방어 (점수를 정직하게)

루브릭은 최적화 표적이지 진실이 아니다. 게이밍을 막는 4겹:
1. **신선 inspector** — architect 산출을 새로 읽어 채점만(자기 채점 금지). 모델/프롬프트를 architect와 분리.
2. **실측 + 결정적 확인** — 의미 채점(inspector)에 더해, **호출자(SKILL)가 디스크에 쓰고 `quick_validate.py`·`node --check`(문법)·**실행 스모크**(`smoke_run.mjs` — mock 하네스로 본문을 끝까지 돌려 런타임 에러·무한루프 검출)·스키마 `JSON.parse`로 실측**한다. "잘 만듦"을 넘어 **"실제로 도는가"**까지 본다. 의미 점수만으로 출하하지 않는다.
3. **큰 재작성 감점** — 라운드 간 대량 변경은 표적 맞추기 의심 → q에 반영.
4. **정직 > 칭찬** — inspector는 후하게 주지 않는다. 직전보다 나빠졌으면 낮게. 막히면 "장인성 부족"이 아니라 file:줄 근거로.

## 종료 규칙 (gaasher/Reflexion 합치)

`stop = (agent_score ≥ 9.0) OR (round ≥ max_rounds) OR (2R 연속 개선 < 0.3)`. 라운드 1~2가 도달 가능한 개선의 ~75%를 잡는다. 무인 진행(루프 중 사람에게 안 묻는다).

## 콘텐츠/창작 에이전트의 기본값 — 결과 먼저, 그림 먼저 (show-before-tell)

공장이 **콘텐츠를 만드는 에이전트**(카드뉴스·슬라이드·쇼츠·랜딩 등)를 찍을 때, 그 도메인 철학에
다음 기본값을 넣는다(정본 사례: `cardnews-philosophy.md` P9·P10):

- **결과 먼저(outcome-first)** — 정의·배경·"X란"으로 열지 말고 **"이걸 쓰면 무엇을 할 수 있게 되는지"(되는 결과/능력)를 먼저** 보여준다. 설명은 그 뒤에.
- **그림 먼저(show before tell)** — 초반일수록 시각(도식/예시/실물) 비중을 높인다. 텍스트 벽으로 시작하지 않는다.

이 기본값을 성공조건·checker로도 반영한다(예: "오프닝이 결과 먼저인가", "초반 시각 밀도"). 도구형(비콘텐츠) 에이전트엔 적용하지 않는다 — 범위 정직.

## 작업 순서

1. **Spec** — 한 줄 요청 → 구조화된 에이전트 spec(name·purpose·maker 역할·**success_conditions**·checker 목록·게이트). 성공조건이 곧 생성될 검사도구의 채점축이 된다. **콘텐츠 에이전트면 위 '결과 먼저·그림 먼저'를 성공조건에 포함.**
2. **Generate(architect, maker)** — spec → 패키지 manifest(파일별 path+content). 템플릿: `references/templates/*`.
3. **Inspect(inspector, checker, 신선)** — 6축 채점, blockers(F-#·근거). ≥9 게이트.
4. **keep-best + revise** — best에서 blockers만 반영해 재생성. 종료규칙까지.
5. **호출자 실측·출하** — 파일 디스크에 쓰고 `quick_validate.py`·`node --check`·**실행 스모크(smoke_run)**·스키마 파싱으로 확인 → 통과 시 registry/앱으로 출하. 실패는 blockers로 한 번 더.
6. **git 출하 규율(F-9) — Issue → PR → Review → Merge** — 실측 통과분은 `main` 에 직접 push 하지 않는다. 출하 스테이지는 **두 에이전트**가 루프의 마지막 단계로 수행한다(정본: 루트 `AGENTS.md` Git 워크플로):
   - **`git-flow`** — 이슈 생성 → 브랜치 → 명시 커밋 → push → PR(`Closes #이슈`) → **pr-reviewer 위임**.
   - **`pr-reviewer`**(신선 checker) — PR diff 를 5렌즈(정확성·검증·범위정직·secret/PII·git위생)로 검수하고 `gh pr review` 로 게시. maker≠checker 를 **출하된 diff 까지** 확장.
   - **머지는 사람 게이트** — pr-reviewer `approve` + 검증 green 이면 "머지 대기"로 사람에게 넘긴다. 에이전트가 자동 머지하지 않는다. `request_changes` 면 maker 로 되돌려 재수정→재리뷰.
