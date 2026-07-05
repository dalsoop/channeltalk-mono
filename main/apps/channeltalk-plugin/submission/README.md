# 채널톡 연동 리서처 (Channel Talk Integration Researcher)

> 대상 기업 = **채널톡(Channel Talk)**. 산출 형태 = **Codex 플러그인**(AX 해커톤 제출).

한 고객사(사이트)가 **이미 붙여둔 채널톡 Open API 연동(baseline)** 을 기준으로, 채널톡 API 표면에
**새로 생긴 기능**을 **개인정보(PII)를 유출하지 않는** "이렇게 연동한다" 매뉴얼로 뽑아 주고,
주기적으로 다시 돌려 **뎁스를 쌓아 가는** maker→checker 에이전트 루프다. 정적 카탈로그가 아니라
**"기존 연동 대비 신규 기능 감시기"**. 키 없이 로컬 mock 으로 **오프라인·결정적** 실행.

도메인/설계 정본: [`CHANNELTALK.md`](../../CHANNELTALK.md).

## 설치 · 실행

```bash
# 플러그인 루트(src/skills/channeltalk-integration-researcher/) 기준
node scripts/diff_surface.mjs \
  --surface ssot/api-surface.json \
  --baseline customers/www.ranode.net/baseline.json \
  --profile  customers/www.ranode.net/profile.json \
  --out out/<stamp>-www.ranode.net --stamp <stamp>          # 결정적 diff + 4게이트
node scripts/verify_manual.mjs \
  --changes out/<run>/changes.json --manual out/<run>/update-manual.md   # 결정적 checker
node scripts/record_depth.mjs \
  --changes … --profile … --baseline … --ledger customers/<site>/depth-ledger.jsonl   # 뎁스 누적
node test/run.mjs                                            # §11 결정적 회귀 테스트
```

절차(온보딩→diff→매뉴얼→verify→뎁스)와 명령·경계는 스킬 `SKILL.md` 에 있다.

---

## 플러그인 작동 방식 (절차 · 지식 · 판단 기준 · 실패 시 동작)

### 절차 — 5단계 파이프라인
Codex 엔 Workflow/Agent API 가 없으므로 **루프는 `SKILL.md` 의 절차로** 돈다. 기계 단계(결정적)와 에이전트 단계(maker/checker)가 번갈아 간다.

| # | 단계 | 종류 | 하는 일 | 산출 |
|---|---|---|---|---|
| 0 | 온보딩 (프로필 없을 때만) | 질문 | 정량 4문항(연동단계·의도·규모·PII정책) 수집 | `profile.json` + `baseline.json` |
| 1 | 결정적 diff | 기계 | 표면 − baseline → 신규 기능, **4게이트** | `changes.json` + `surface.snapshot.json` |
| 2 | 매뉴얼 작성 | 에이전트(maker) | 신규 id 전수를 provenance·무엇/왜·method+path+auth+예제·PII주의로 문서화 | `update-manual.md` |
| 3 | 검증 | 기계(결정적 게이트) + 에이전트 팀(선택) | `verify_manual`(결정적 checker, **approve 까지 재작성**)로 게이트. 신선 평가 3축(정확·완전·개인정보) 팀은 **동봉**(라이브 LLM 실행은 선택) | `manual-verdict.json` |
| 4 | 뎁스 기록 | 기계 | ledger append + `depth`+1, 붙인 기능은 `--adopt` 로 baseline 이동 | `depth-ledger.jsonl` |

작성(maker) ≠ 채점(checker). 오케스트레이터는 **손으로 매뉴얼을 쓰지 않고** 라운드·점수만 중계한다.

### 지식을 어떻게 가져가나 (근거의 출처 — 지어내지 않음)
- **표면 지식** = `ssot/api-surface.json` (mock, **공개 문서 기반 재구성**). 각 feature 의 `provenance` 가 신뢰도: `mock`(문서 확인) / `inferred`(형태 추론). **`verified-live` 로 단정하지 않는다** — 라이브 응답으로 확인한 척하지 않음.
- **PII 판단 지식** = `CHANNELTALK.md §6`(방향 R/W/CB·정책 강도) 정본을 `lib/pii.mjs` 상수(POLICY_FLAGS·SOFT_PII_FIELDS)로 구현.
- **역할·기준** = `agents/*.md`(maker/checker 프롬프트) + `schemas/*.json`(산출 계약).
- **작성 근거의 경계** = 매뉴얼 maker 는 `changes.json` + `surface.snapshot.json` **‘만’** 근거로 쓴다. 그 밖의 사실은 만들지 않는다(정확성 게이트가 걸러냄).

### 판단 기준 (무엇을 보고 결정하나)
- **결정적 diff 4게이트** (하나라도 FAIL → 매뉴얼 단계로 안 감): `diff_completeness`(표면=신규∪기연동) · `no_fabricated_endpoint`(신규 id 전부 표면 실재) · `no_secret_in_example`(실 base64/hex 토큰 차단) · `every_pii_flagged`(pii_fields 있으면 has_pii).
- **PII 방향성 → `policy_flag`** (정책 `no-transmit` 기준):

  | 방향 | 예 | 판단 |
  |---|---|---|
  | W(우리→채널톡) + **확정 식별 PII** | `user.upsert` | `hold_pii_transmit` (도입 보류 권고) |
  | W + 자유형 필드만(`property`) | `user.event.create` | 기계 flag 없음 → 매뉴얼이 "속성서 PII 제외 권고" |
  | R/CB(채널톡→우리) + PII | `user.get`·webhook | `mask_inbound` (유입 마스킹) |
  | 정책 `consent`/`transmitting`/`undecided` | — | 기계 flag 없음 → 매뉴얼이 동의·위탁·검토를 **서술로 강제** |
- **verify verdict**: `approve`(missed 0) 또는 `revise`(누락 id·PII 주의 누락·secret 누출 지목).
- **Exit criteria(관측 가능한 done, 점수 아님)**: 게이트 4/4 ∧ verify approve ∧ 신규 id 전수 커버 ∧ `not_verified` 보고됨.

### 정보가 부족하거나 잘 안 풀릴 때 (degraded / 실패 동작)
"모르면 지어내지 말고, 막히면 멈추고 이유를 보고한다"가 원칙. 실제 exit 코드·동작:

| 상황 | 플러그인 동작 |
|---|---|
| 프로필/baseline 없음 | 온보딩 4문항으로 **채운다**. 미연동이면 `integrated:[]` → 첫 실행이 전체 표면 카탈로그. |
| 필수 입력 누락(`--surface/--baseline/--profile`) | `diff_surface` **exit 1** + 사용법 출력 (fail-fast). |
| 표면/산출이 스키마 위반 | **exit 1** + 스키마 에러 출력 (자체 검증 — 깨진 계약으로 진행 안 함). |
| diff 게이트 중 하나라도 FAIL | **exit 2**, `gate_offenders` 보고, **매뉴얼 단계로 넘어가지 않음** (지어냄·누락·secret·PII 미플래그를 사전 차단). |
| 매뉴얼이 표면에 없는 걸 씀 | `no_fabricated_endpoint` 게이트 + 정확성 리뷰어가 **reject** → 재작성. |
| 지식이 불확실(`provenance=inferred`) | "⚠️ 문서 검증 필요" 배지 + **`not_verified` 영수증에 명시** (webhook payload 등). 라이브로 단정 안 함. |
| PII 정책이 `undecided`/`consent` | 기계 flag 없음 → 매뉴얼이 **동의·위탁·법무/보안 검토를 서술로 강제**(보수적). |
| verify `revise` (수렴 안 됨) | 최대 3라운드 재작성, 2R 개선 없으면 **조기종료 + keep-best**(clean pass 아님을 ledger 에 명시). |
| secret 누출 의심 | `secret_leak` 로 차단(단 식별자·경로·앵커 오탐은 제거 — 실 토큰만 잡음). |
| 표면이 실제와 어긋날 위험 | **`verified-live` 절대 안 함**; §8 "실제 연동 전 공개 문서로 표면 재검증" 을 안내(mock 한계 자백). |
| baseline 이 표면에서 사라진 id 참조 | `removed[]` 로 **폐기 감시**(연동했는데 API 에서 없어진 것). |

---

## 제출 질문 5문항

**1. 무엇을 / 누가 / 언제 쓰나?**
채널톡을 연동해 쓰는 서비스 개발자·PM(및 파트너/에이전시)이, **자기 연동(baseline) 기준으로 새로 생긴
채널톡 Open API 기능**을 개인정보 주의와 함께 "이렇게 붙인다" 매뉴얼로 받는다. "예전에 연동한 뒤로
채널톡 API 에 뭐가 새로 생겼지? 개인정보 안 흘리면서 뭘 더 붙일 수 있지?" 를 **주기적으로** 점검할 때.
(예시 고객사: `www.ranode.net` — 미연동, 성숙 연동사 `mature-site` — v1 코어만 연동.)

**2. 왜 이 문제인가?**
채널톡은 공개 Open API 를 제공하고 **지속적으로 확장**한다(신규 엔드포인트·webhook). 그런데 연동사
입장에서 **"내 연동 대비 무엇이 새로 생겼는가"** 를 알려주는 장치가 없어 신기능을 놓치거나 뒤늦게 몰아
확인한다. 게다가 연동은 고객 개인정보(이름·이메일·연락처, 상담 본문 `plainText`)를 다뤄
**개인정보보호법(PIPA)** 상 최소수집·동의·안전조치가 필요한데, 신기능 도입 시 이 관점이 빠지기 쉽다.
근거는 공개 문서(`developers.channel.io`·`api-doc.channel.io`)와 공개 법령.

**3. 어떻게 작동하나?**
온보딩(정량 4문항 → `profile.json`+`baseline.json`) → **결정적 diff(4게이트)** → **매뉴얼 작성(maker
에이전트)** → **결정적 게이트(`verify_manual` checker 스크립트 — 지어냄·누락·PII주의누락·secret누출 0)로 검증**하고,
**신선 평가 3축(정확·완전·개인정보) 팀을 동봉**한다(라이브 LLM 실행은 선택; 이번 런은 결정적 게이트만 통과) → **뎁스 누적**.
표면은 라이브 fetch 가 아니라 `ssot/api-surface.json` mock 이 SSOT 대역(오프라인·결정적). provenance 는
`mock`|`inferred` 만 표기하고 `verified-live` 로 단정하지 않는다.

**4. AI 를 어떻게 활용했나?**
설계·구현을 AI 대화로 진행(무편집 `logs/`). 공개 문서를 조사해 API 표면을 mock 으로 재구성했고,
**maker≠checker** 루프를 설계했다 — 매뉴얼 **작성은 AI 에이전트**(`channeltalk-manual-maker`),
**게이트는 결정적 스크립트**(`verify_manual` — approve 까지 재작성). 그 위에 **신선 평가 에이전트 3축
팀**(accuracy·completeness·privacy)을 설계해 **제출물에 동봉**했다(`skills/channeltalk-manual-team/`:
역할 프롬프트·채점 스키마·verification-gated 워크플로). **이번 런은 이 3축 라이브 LLM 루프를 실행하지
않고 결정적 게이트만 통과**했다(정직: 안 돌린 채점을 지어내지 않음 — `run-receipt.json` 에 명시).
오케스트레이터는 라운드·점수만 중계하고 손으로 매뉴얼을 쓰지 않는다.

**5. 어떻게 검증했나?**
아래 **## 검증** 참조 — §11 결정적 테스트(happy·멱등·secret 음성·신기능 delta·정책 플래그·secret
오탐/이빨) + `www.ranode.net` 실제 런 결과 + 스킬 구조(plugin.json·SKILL.md frontmatter) 정합.

---

## 검증

### 결정적 테스트 (§11 — `node test/run.mjs`)

`lib/*.mjs` 순수 함수만 호출하는 회귀 테스트(네트워크·시각 없음). 케이스:

| 테스트 | 기대 |
|---|---|
| happy | `baseline=[]` vs 표면 22 → 신규 **22**, 게이트 4/4 PASS |
| idempotent (멱등) | `baseline`=전체 22 → 신규 **0**, removed 0 |
| secret_negative | 예제에 40자 hex 실키 주입 → `no_secret_in_example` 게이트 **FAIL**(offender 지목) |
| delta (신규 시뮬) | 표면 +1(가짜 신기능) → 그 **delta 1개만** 노출 |
| policy_flag | `pii_policy=no-transmit` + 전송형 PII(user.upsert) → **`hold_pii_transmit`**, 수신형(user.get) → **`mask_inbound`** |
| counts_shape_ranode | ranode 모양: new **22**, new_with_pii **9**, policy_hold **1**, new_inferred **4** |
| secret 오탐/이빨 | 앵커 슬러그·경로는 secret 아님(오탐 0), 실 base64/hex 토큰은 계속 잡힘 |

### `www.ranode.net` 실제 런 결과

미연동(`integrated: []`) 고객사에 표면 v4(22 features)를 대조한 실행
(`out/260705190000-www.ranode.net/run-receipt.json`):

- **결정적 diff 게이트: 4/4 pass** (diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged).
- **counts**: surface **22** · integrated **0** · new **22** · new_with_pii **9** · policy_hold **1** · new_inferred **4**.
  - 미연동이라 표면 전체 22개가 신규(첫 실행 = 전체 카탈로그).
  - PII 포함 신규 9건, `no-transmit` 정책상 전송형 PII 1건이 **`hold_pii_transmit`**(도입 보류 권고).
- **verify_manual: approve (missed 0)** — 신규 id 전수 커버, PII 주의 누락 0, secret 누출 0.
- **`not_verified` 4건**(정직한 provenance) — 아래는 라이브 미검증(`inferred`)이라 공식 문서 재확인 필요:
  `openapi.channel.get` · `webhook.message.created` · `webhook.userchat.opened` · `webhook.user.created`.

> 위 수치는 저장소의 `run-receipt.json`(무편집)에서 인용한 실제 실행값이다.

### 스킬 구조

- `.codex-plugin/plugin.json` — `name`(kebab) + `version` + `description` + `skills:"./skills/"`, `JSON.parse` 유효.
- `skills/channeltalk-integration-researcher/SKILL.md` — frontmatter `name`+`description` 유효, `## Commands`/`## Boundaries`/`## Exit criteria` 포함.
- 조립 트리 안에서 `scripts/*.mjs`·`lib/*.mjs`·`test/run.mjs` 전부 `node --check` 통과, import 재작성(`../lib/`)으로 스모크 `verify_manual` approve 재현.
- **팀 참조 무결성(dangling 0)** — `agents/channeltalk-*.md` 4개가 참조하는 `skills/channeltalk-manual-team/references/channeltalk-manual-philosophy.md` + `schemas/{accuracy,completeness,privacy}-verdict.schema.json` 이 조립 트리에 **전부 실재**한다(제출물에서 팀 루프가 자족적으로 돌 수 있음).

---

## 구조

```
src/
├── .codex-plugin/plugin.json                 필수 매니페스트
└── skills/
    ├── channeltalk-integration-researcher/
    │   ├── SKILL.md                          절차·명령·경계
    │   ├── scripts/{diff_surface,verify_manual,record_depth}.mjs
    │   ├── lib/*.mjs · schemas/*.json · ssot/api-surface.json
    │   ├── test/run.mjs                      §11 결정적 테스트
    │   ├── agents/channeltalk-*.md           maker + reviewer 3축(정확·완전·개인정보)
    │   └── customers/<site>/{profile,baseline}.json
    └── channeltalk-manual-team/              신선 평가 3축 팀(위 agents 가 참조)
        ├── SKILL.md                          팀 진입점(오케스트레이터)
        ├── references/channeltalk-manual-philosophy.md   철학 정본(루브릭)
        ├── schemas/{accuracy,completeness,privacy}-verdict.schema.json  채점 계약 3종
        └── workflow/channeltalk-manual-loop.mjs          verification-gated 루프
README.md                                     이 문서(질문 5문항 + 검증)
logs/                                         AI 대화 로그(무편집)
```

정직성: 표면은 공개 문서 기반 **mock**(`inferred` 는 형태 추론)이며 **`verified-live` 로 단정하지 않는다**.
예제·산출에 실키·실 개인정보를 넣지 않는다(secret 게이트가 실토큰을 차단).
