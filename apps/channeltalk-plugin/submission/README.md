# 채널톡 연동 리서처 (Channel Talk Integration Researcher)

> 대상 기업 = **채널톡(Channel Talk)**. 산출 형태 = **Codex 플러그인**(AX 해커톤 제출).

**신규 채널톡 기능을 도입하기 전에 개인정보(PIPA) 검토를 강제하는 게이트.** 한 고객사(사이트)가
**이미 붙여둔 채널톡 Open API 연동(baseline)** 을 기준으로 표면에 새로 생긴 기능을 골라낸 뒤,
각 기능의 **PII 방향성**을 판정해 — 전송형 PII(우리→채널톡)는 **`hold_pii_transmit`(도입 보류 권고)**,
수신형 PII(채널톡→우리 GET/webhook)는 **`mask_inbound`(마스킹 강제)** 로 — 개인정보를 흘리지 않는
"이렇게 연동한다" 매뉴얼을 만든다. 부차적으로, 이 diff 는 **baseline 대비 신규 기능**을 잡아
"내 연동 이후 채널톡 API 에 뭐가 생겼나"를 주기적으로 확인시켜 준다. 정적 카탈로그가 아니라
**"게이트가 걸린 신규 기능 도입 검토기"**. 표면은 손 저작 mock 이 아니라 **pin 된 실 OpenAPI 스펙
스냅샷**(공개 `swagger.json@57249a6`, "Channel Open Api" v28.0.3, 163 operation)에 대조·교정한 것이며,
키 없이 로컬 pin 만 읽어 **오프라인·결정적** 실행이라 심사관이 그대로 재현할 수 있다.
maker(작성) ≠ checker(채점) 루프로 뎁스를 누적한다.

도메인/설계 정본: [`CHANNELTALK.md`](../../CHANNELTALK.md).

## 설치 · 실행

```bash
# 플러그인 루트(src/skills/channeltalk-integration-researcher/) 기준
node scripts/diff_surface.mjs \
  --surface ssot/api-surface.json \
  --baseline customers/www.example.com/baseline.json \
  --profile  customers/www.example.com/profile.json \
  --out out/<stamp>-www.example.com --stamp <stamp>          # 결정적 diff + 5게이트
node scripts/verify_manual.mjs \
  --changes out/<run>/changes.json --manual out/<run>/update-manual.md   # 결정적 checker
node scripts/record_depth.mjs \
  --changes … --profile … --baseline … --ledger customers/<site>/depth-ledger.jsonl   # 뎁스 누적
node scripts/build_receipt.mjs \
  --changes out/<run>/changes.json --verdict out/<run>/manual-verdict.json \
  --reviews out/<run>/reviews --out out/<run>/run-receipt.json   # 파생 영수증 조립
node scripts/refresh_surface.mjs                            # (선택·오프라인) pin 된 실 스펙에 표면 대조·리포트
node scripts/refresh_surface.mjs --fetch                    # (선택·online 1회) 공개 swagger 재다운로드해 pin 갱신
node test/run.mjs                                           # §11 결정적 회귀 테스트(29 케이스)
```

절차(온보딩→diff→매뉴얼→verify→뎁스)와 명령·경계는 스킬 `SKILL.md` 에 있다.

---

## 플러그인 작동 방식 (절차 · 지식 · 판단 기준 · 실패 시 동작)

### 절차 — 5단계 파이프라인
Codex 엔 Workflow/Agent API 가 없으므로 **루프는 `SKILL.md` 의 절차로** 돈다. 기계 단계(결정적)와 에이전트 단계(maker/checker)가 번갈아 간다.

| # | 단계 | 종류 | 하는 일 | 산출 |
|---|---|---|---|---|
| 0 | 온보딩 (프로필 없을 때만) | 질문 | 정량 4문항(연동단계·의도·규모·PII정책) 수집 | `profile.json` + `baseline.json` |
| 1 | 결정적 diff | 기계 | 표면 − baseline → 신규 기능, **5게이트**(5번째 = pin 된 실 스펙 대조) | `changes.json` + `surface.snapshot.json` |
| 2 | 매뉴얼 작성 | 에이전트(maker) | 신규 id 전수를 provenance·무엇/왜·method+path+auth+예제·PII주의로 문서화 | `update-manual.md` |
| 3 | 검증 | 기계(결정적 게이트) + 에이전트 팀(선택) | `verify_manual`(결정적 checker, **approve 까지 재작성**)로 게이트. 신선 평가 3축(정확·완전·개인정보) 팀은 **동봉**(라이브 LLM 실행은 선택) | `manual-verdict.json` |
| 4 | 뎁스 기록 | 기계 | ledger append + `depth`+1, 붙인 기능은 `--adopt` 로 baseline 이동 | `depth-ledger.jsonl` |

작성(maker) ≠ 채점(checker). 오케스트레이터는 **손으로 매뉴얼을 쓰지 않고** 라운드·점수만 중계한다.

### 지식을 어떻게 가져가나 (근거의 출처 — 지어내지 않음)
- **표면 지식** = `ssot/api-surface.json`, **pin 된 실 OpenAPI 스펙에 대조·교정한 것**. 원 스냅샷은 공개 `https://api.channel.io/docs/open/swagger.json`(OpenAPI 3.0.1, "Channel Open Api" **v28.0.3**, **163 operation**)이며 sha256 `57249a6…` 로 고정(`ssot/provenance-lock.json`). 각 feature 의 `provenance`: `pinned`(= pin 된 공개 스펙 스냅샷과 method+path 가 일치, 해시 고정) / `inferred`(webhook — 스펙 밖, 별도 문서). **더는 `mock` 이 아니다.** 다만 `pinned` ≠ **verified-live** 다: "공개 스펙 스냅샷과 일치"이지 **라이브 호출로 확인한 것이 아니다** — `verified-live` 로 단정하지 않는다.
- **pin 이 잡아낸 correctness 버그(핵심 서사)** = 표면을 실 스펙에 대조하자 예전 손 저작 mock 의 **2개가 가짜**로 드러났다. 우리 게이트가 우리가 지어냈던 걸 잡은 셈이다: (1) `openapi.user.list`(GET /users) — 실 채널톡 API 에 **유저 목록 엔드포인트 자체가 없다** → 제거. (2) `openapi.user.upsert` — 예전 표면은 `PUT` 이었으나 실 스펙은 **`PATCH /users/{userId}`** → PUT→PATCH 로 교정. 이 두 교정은 `scripts/refresh_surface.mjs` 의 `CORRECTIONS` 에 이유와 함께 결정적으로 박혀 있다.
- **freshness 와 pin 갱신(정직한 한계)** = 코어 루프(diff/verify/manual/test)는 **로컬 pin 스냅샷만 읽어 오프라인·결정적**이다(네트워크 0). 공개 swagger 를 실제로 재다운로드·재고정하는 것은 `scripts/refresh_surface.mjs --fetch` **online 1회 스텝** 뿐이다 — 상시 감시·자동 크롤이 아니다. 채널톡이 API 를 추가하면 `--fetch` 로 pin 을 갱신하고 표면을 재생성(`surface_version`+1)해 다음 실행이 그 delta 를 잡는다. 그래서 이 플러그인의 **핵심 가치는 "실시간 감시"가 아니라 (a) baseline 대비 신규 기능의 결정적 delta 계산 + (b) 그 신규 기능마다 PII 게이트를 거는 것**이다. `inferred`(webhook) 항목은 `not_verified` 로 남겨 재확인 대상으로 표시한다(§8).
- **PII 판단 지식** = `CHANNELTALK.md §6`(방향 R/W/CB·정책 강도) 정본을 `lib/pii.mjs` 상수(POLICY_FLAGS·SOFT_PII_FIELDS)로 구현.
- **역할·기준** = `agents/*.md`(maker/checker 프롬프트) + `schemas/*.json`(산출 계약).
- **작성 근거의 경계** = 매뉴얼 maker 는 `changes.json` + `surface.snapshot.json` **‘만’** 근거로 쓴다. 그 밖의 사실은 만들지 않는다(정확성 게이트가 걸러냄).

### 판단 기준 (무엇을 보고 결정하나)
- **결정적 diff 5게이트** (하나라도 FAIL → 매뉴얼 단계로 안 감):
  - `diff_completeness` — 표면 = 신규 ∪ 기연동(누락·중복 없음).
  - `no_fabricated_endpoint` — 신규 id 전부가 **표면 파일 안에 실재**하는지 검사(표면 내부 정합성).
  - `no_secret_in_example` — 예제/산출에서 실 토큰 형태(긴 base64·hex 등)를 잡아 차단하는 **best-effort** 필터. 흔한 실 토큰 형태 다수를 잡고 식별자·경로·앵커 슬러그 오탐은 걸러내지만, **모든 형태의 secret 누출을 완전히 보장하지는 못한다**(플레이스홀더 규약과 병행해야 한다).
  - `every_pii_flagged` — `pii_fields` 가 있으면 `has_pii` 로 표시(PII 기능이 조용히 지나가지 않게).
  - `surface_in_pinned_spec` — **(5번째)** 표면의 비-inferred(pinned) feature 가 pin 된 실 OpenAPI 스펙(`ssot/channel-swagger.json`)의 operation 집합에 method+path 로 **실재**하는지 대조. 오프라인(로컬 pin 읽음, 네트워크 0)이지만 **현실 대비 검증**이다. 이 게이트 덕에 `no_fabricated_endpoint` 가 더는 "표면 파일 내부 정합성"에만 갇히지 않고, 표면 REST feature 가 공개 스펙 스냅샷에 실재함까지 본다. inferred(webhook)는 스펙 밖이라 이 대조에서 제외. (정직성 경계: pinned = 스냅샷 일치이지 라이브 호출 확인이 아니다.)
- **PII 방향성 → `policy_flag`** (정책 `no-transmit` 기준):

  | 방향 | 예 | 판단 |
  |---|---|---|
  | W(우리→채널톡) + **확정 식별 PII** | `user.upsert` | `hold_pii_transmit` (도입 보류 권고) |
  | W + 자유형 필드만(`property`) | `user.event.create` | 기계 flag 없음 → 매뉴얼이 "속성서 PII 제외 권고" |
  | R/CB(채널톡→우리) + PII | `user.get`·webhook | `mask_inbound` (유입 마스킹) |
  | 정책 `consent`/`transmitting`/`undecided` | — | 기계 flag 없음 → 매뉴얼이 동의·위탁·검토를 **서술로 강제** |
- **verify verdict**: `approve`(missed 0) 또는 `revise`(누락 id·PII 주의 누락·secret 누출 지목).
- **Exit criteria(관측 가능한 done, 점수 아님)**: 게이트 5/5 ∧ verify approve ∧ 신규 id 전수 커버 ∧ `not_verified` 보고됨.

### 정보가 부족하거나 잘 안 풀릴 때 (degraded / 실패 동작)
"모르면 지어내지 말고, 막히면 멈추고 이유를 보고한다"가 원칙. 실제 exit 코드·동작:

| 상황 | 플러그인 동작 |
|---|---|
| 프로필/baseline 없음 | 온보딩 4문항으로 **채운다**. 미연동이면 `integrated:[]` → 첫 실행이 전체 표면 카탈로그. |
| 필수 입력 누락(`--surface/--baseline/--profile`) | `diff_surface` **exit 1** + 사용법 출력 (fail-fast). |
| 표면/산출이 스키마 위반 | **exit 1** + 스키마 에러 출력 (자체 검증 — 깨진 계약으로 진행 안 함). |
| diff 게이트 중 하나라도 FAIL | **exit 2**, `gate_offenders` 보고, **매뉴얼 단계로 넘어가지 않음** (지어냄·누락·secret·PII 미플래그·실 스펙 미실재를 사전 차단). |
| 표면에 실 스펙에 없는 REST feature 가 섞임 | `surface_in_pinned_spec`(5번째 게이트)가 **FAIL** → offender id 지목. `refresh_surface.mjs` 도 exit 2. (실제로 이 게이트가 예전 mock 의 가짜 `user.list`·PUT `user.upsert` 를 잡아 제거·교정하게 했다.) |
| 매뉴얼이 표면에 없는 걸 씀 | `no_fabricated_endpoint` 게이트 + 정확성 리뷰어가 **reject** → 재작성. |
| 지식이 불확실(`provenance=inferred`) | "⚠️ 문서 검증 필요" 배지 + **`not_verified` 영수증에 명시** (webhook payload 등). 라이브로 단정 안 함. |
| PII 정책이 `undecided`/`consent` | 기계 flag 없음 → 매뉴얼이 **동의·위탁·법무/보안 검토를 서술로 강제**(보수적). |
| verify `revise` (수렴 안 됨) | 최대 3라운드 재작성, 2R 개선 없으면 **조기종료 + keep-best**(clean pass 아님을 ledger 에 명시). |
| secret 누출 의심 | `secret_leak` 로 차단(best-effort — 실 토큰 형태 다수를 잡고 식별자·경로·앵커 오탐은 제거하되, 완전 보장은 아님·플레이스홀더 규약 병행). |
| 표면이 실제와 어긋날 위험 | 표면은 **pin 된 실 스펙 스냅샷**(해시 고정)이라 REST feature 는 5번째 게이트가 실재를 강제한다. 그래도 **`verified-live` 절대 안 함**(pinned ≠ 라이브 호출 확인); 스펙 갱신은 §8 `refresh_surface.mjs --fetch` 로만. |
| baseline 이 표면에서 사라진 id 참조 | `removed[]` 로 **폐기 감시**(연동했는데 API 에서 없어진 것). |

---

## 제출 질문 5문항

**1. 무엇을 / 누가 / 언제 쓰나?**
채널톡을 연동해 쓰는 서비스 개발자·PM(및 파트너/에이전시)이, **자기 연동(baseline) 기준으로 새로 생긴
채널톡 Open API 기능**을 개인정보 주의와 함께 "이렇게 붙인다" 매뉴얼로 받는다. "예전에 연동한 뒤로
채널톡 API 에 뭐가 새로 생겼지? 개인정보 안 흘리면서 뭘 더 붙일 수 있지?" 를 **주기적으로** 점검할 때.
(예시 고객사: `www.example.com` — 미연동이라 신규 = 전체 **21건**(= pin 된 카탈로그 전량), 성숙 연동사
`mature-site` — 코어 **7개**만 연동해 baseline 대비 신규 delta **14건**(21 − 7)만 걸러짐.)

**2. 왜 이 문제인가?**
채널톡 연동은 고객 개인정보(이름·이메일·연락처, 상담 본문 `plainText`)를 다뤄
**개인정보보호법(PIPA)** 상 최소수집·동의·안전조치가 필요하다. 그런데 **새 기능을 도입할 때
개인정보 관점이 빠지기 쉽다** — 특히 우리→채널톡 **전송형 PII**(수집·이용 동의 범위·위탁 검토)와
webhook 으로 들어오는 **수신형 본문**(`plainText` 마스킹). 그래서 신규 기능마다 이 검토를 **강제로**
거는 게이트가 필요하다. 부차적 문제로, 채널톡 Open API 는 **지속적으로 확장**되는데(신규
엔드포인트·webhook) 연동사 입장에서 **"내 연동 대비 무엇이 새로 생겼는가"** 를 알려주는 장치가
없어 신기능을 놓치거나 뒤늦게 몰아 확인한다. 근거는 공개 문서(`developers.channel.io`·`api-doc.channel.io`)와 공개 법령.

**3. 어떻게 작동하나?**
온보딩(정량 4문항 → `profile.json`+`baseline.json`) → **결정적 diff(5게이트)** → **매뉴얼 작성(maker
에이전트)** → **결정적 verify(checker 스크립트) + 신선 평가 3축** → **뎁스 누적**. 표면은 상시 라이브 fetch 가
아니라 **pin 된 실 OpenAPI 스펙 스냅샷**(`ssot/channel-swagger.json`@`57249a6`, v28.0.3, 163 ops)에 대조·교정한
`ssot/api-surface.json` 이 SSOT 대역이다(코어 루프는 로컬 pin 만 읽어 오프라인·결정적). 5번째 게이트
`surface_in_pinned_spec` 이 표면 REST feature 가 그 스펙에 실재함을 대조한다. provenance 는 `pinned`|`inferred`
만 표기하고 `verified-live` 로 단정하지 않는다(pinned = 스냅샷 일치이지 라이브 호출 확인 아님).

**4. AI 를 어떻게 활용했나?**
설계·구현을 AI 대화로 진행(무편집 `logs/`). API 표면은 처음 손 저작 mock 으로 시작했다가 **공개 OpenAPI
스펙(`swagger.json`)을 pin·대조**해 격상했다 — 그 대조로 예전 mock 의 가짜 2개(`user.list` 부재·`user.upsert`
PUT→PATCH)를 잡아 교정했다(우리 게이트가 우리가 지어낸 걸 잡음). 그 위에 **maker≠checker** 루프를 설계했다 —
매뉴얼 **작성은 AI 에이전트**(`channeltalk-manual-maker`),
**채점은 결정적 스크립트**(`verify_manual`) + **신선 평가 에이전트 3축**(accuracy·completeness·privacy)을
설계해 **제출물에 동봉**했다(`skills/channeltalk-manual-team/`: 역할 프롬프트·채점 스키마·verification-gated
워크플로). **이번 런은 3축 라이브 LLM 루프는 실행하지 않고 결정적 게이트만 통과**했다(정직: 안 돌린 채점을
지어내지 않음 — `run-receipt.json` 에 명시).
오케스트레이터는 라운드·점수만 중계하고 손으로 매뉴얼을 쓰지 않는다.

**5. 어떻게 검증했나?**
아래 **## 검증** 참조 — §11 결정적 테스트 **29 케이스**(스키마 유효·happy·멱등·secret 음성·신기능 delta·
정책 플래그·counts 모양·secret 오탐/이빨/꺾쇠우회/접두/hex24/소문자40/대문자40/꺾쇠-문자시작/구분자분리/순수숫자·영수증 일치·receipt 파생·**pin 된 실 스펙 대조 4종**·**maker→checker 결정적 검증축 4종**[정상 approve + 예외 3: 신규 누락·PII주의 누락·secret 누출]) + `www.example.com` 실제 런 결과
(파생 receipt + 신선 3축 리뷰어) + 성숙 연동사 `mature-site` delta 런 + 스킬 구조(plugin.json·SKILL.md
frontmatter) 정합. 모두 **29/29 통과**. AI maker→checker 루프 산출도 `node scripts/verify_manual.mjs`(exit 0/3) 로 재검증되며, 루프 워크플로 파일이 `node --check` 로 "실패"하는 것은 런타임 async-wrap 규약상 **설계상 정상**이다(플레인 node 실행 파일 아님).

---

## 검증

### 결정적 테스트 (§11 — `node test/run.mjs`)

`lib/*.mjs` 순수 함수(+`buildReceipt`+`verifyManual`)만 호출하는 회귀 테스트(네트워크·시각 없음 — pin 된 스펙도 로컬
파일로 읽음). 현재 **29 케이스, 29/29 통과**(파일 `test/run.mjs`+`cases/*.mjs` 의 `record(...)` 호출 수와 1:1 —
지어낸 수치 아님):

| 테스트 | 기대 |
|---|---|
| surface_schema_valid | 시드 `ssot/api-surface.json` 이 스키마 유효(`ok:true`, errorCount 0) — 게이트 전 전제 |
| happy | `baseline=[]` vs 표면 21 → 신규 **21**, removed 0, **5게이트 전부 PASS**(gates:[t,t,t,t,t]) |
| idempotent (멱등) | `baseline`=전체 21 → 신규 **0**, removed 0, 게이트 PASS |
| delta (신규 시뮬) | 표면 +1(가짜 신기능, specOps 생략 → 4게이트 경로) → 그 **delta 1개만** 노출(`new:1`, id 지목) |
| counts_shape_example | example 모양: new **21**, new_with_pii **8**, policy_hold **1**, new_inferred **3**, gate_keys 5개 |
| **surface_in_pinned_spec_true** | 실 diff 파이프라인 배선(specOps 로드): 표면 전량이 실 스펙에 실재 → 5번째 게이트 **true**, 5/5 gatesPass |
| **fabricated_surface_fails_gate5** | 실 스펙에 없는 가짜 pinned feature 주입 → `surface_in_pinned_spec` **만 false**(offender 지목), 나머지 4게이트는 여전히 true → "게이트가 현실 대비 이빨" |
| policy_flag | `pii_policy=no-transmit` + 전송형 PII(user.upsert) → **`hold_pii_transmit`**, 수신형(user.get) → **`mask_inbound`**, `consent` 정책 → 기계 flag 없음(null) |
| run_receipt_consistency | `buildReceipt(changes,…)` 산출이 changes 와 일치 — counts·gates·not_verified·`generated_by` 필드 대조 |
| build_receipt_derivation | `build_receipt.mjs` 가 changes+verdict+reviews 에서 receipt 파생 — 3-pass→`clean:true`·llm `"3/3"`, 1-fail→`clean:false`·llm `"2/3"`, reviews 없음→`"not_run"` |
| secret_negative | 예제에 실키 주입 → `no_secret_in_example` 게이트 **FAIL**(offender = 그 feature id) |
| no_false_positive_on_slug | 앵커 슬러그·`method/path/auth/params/` 산문은 secret 아님 → hits **0**(오탐 회귀 방지) |
| teeth_real_token_still_caught | base64 키 + 40자 hex 토큰은 **계속 잡힘**(이빨 유지) |
| secret_gate_angle_bypass | `<KEY:40hex>` 꺾쇠 우회는 **1건 잡힘**, 순수 플레이스홀더(`<KEY>`·`<SECRET>`·`<PII:name>`·`<ACCESS_KEY>`)는 hits 0 |
| secret_gate_known_prefix | 알려진 접두 키(`AKIAIOSFODNN7EXAMPLE`)는 짧아도 **잡힘**(길이 무관 접두 규칙) |
| secret_gate_hex24 | 24자 순수 hex 는 **잡되**(hex_hits 1) slug 산문은 계속 0 |
| secret_gate_lowercase40 | 40자+ 연속 all-lowercase 실토큰(`key=`glued 포함)은 **잡히되**, 구분자로 쪼개진 slug 산문은 계속 hits 0 |
| secret_gate_uppercase40 | 40자+ all-UPPERCASE 실토큰은 **잡히되**, 38자(<40)·짧은 대문자 라벨(`ACCESS_KEY`·`SECRET`)은 hits 0 |
| secret_gate_angle_letterstart | 꺾쇠 안 콜론 뒤 값이 문자로 시작하는 실토큰(`<KEY:abcdef…40>`·`<TOKEN:aG9u…>`)은 **잡히되**, 순수 플레이스홀더은 hits 0 |
| secret_gate_separator_split | `. : , ;` 로 조각난 hex 실토큰(개별 조각 <24자)은 core 이어붙여 **잡히되**, IPv6·UUID·날짜 오탐 0 |
| secret_gate_pure_digits | 순수 숫자(주문번호·타임스탬프·연번 ID)는 hex 실토큰으로 보지 않음 → hits 0 |
| **all_pinned_features_in_spec** | 표면의 비-inferred(pinned) feature **전부**가 pin 된 스펙 operation 에 실재(offenders 0) |
| **fabricated_feature_fails_spec** | 스펙에 없는 가짜 REST feature(`GET /nope`) 주입 → `surfaceInPinnedSpec` **FAIL**(offender 지목) |
| **spec_lock_and_provenance** | 표면 `spec_lock.sha256` 이 provenance-lock 과 일치, `op_count` **163**, provenance 는 pinned|inferred 뿐, tally **{pinned:18, inferred:3}** |
| **upsert_patch_and_list_absent** | 교정 반영 확인: `user.upsert` method **PATCH**(path `/open/v5/users/{userId}`), `user.list` **부재** |
| **manual_verify_approve_clean** | maker→checker 결정적 검증축(`verify_manual`) — 신규 3건 전수 언급 + PII 2건 주의 + secret 0 → **approve**, missed 0 |
| **manual_verify_missing_feature** | 신규 id 하나 누락한 매뉴얼 → **revise** · `missing_feature`(그 id 지목) — 누락을 재현 가능하게 잡음 |
| **manual_verify_missing_pii_notice** | PII 기능 언급하되 주의 표지어 없음(±600창 격리) → **revise** · `missing_pii_notice`(그 id 지목) |
| **manual_verify_secret_leak** | 매뉴얼 예제에 실 토큰 누출 → **revise** · `secret_leak`(lib/gates 재사용) |

### `www.example.com` 실제 런 결과

미연동(`integrated: []`) 고객사에 표면 v5(21 features)를 대조한 실행. 아래 수치의 정본은 조립된
플러그인 트리의 실제 산출 파일
`skills/channeltalk-integration-researcher/out/260705190000-www.example.com/run-receipt.json`
(그리고 같은 폴더의 `changes.json`·`update-manual.md`·`manual-verdict.json`·`reviews/*.json`)이다.

**`run-receipt.json` 은 손으로 쓴 상수도, 무편집 스크립트 로그도 아니다 — 파생(derived) 산출이다.**
`scripts/build_receipt.mjs` 가 세 입력 파일을 읽어 receipt 를 **조립**한다: `changes.json`(diff 게이트·counts·
new_features provenance) + `manual-verdict.json`(verdict·missed) + `reviews/*.json`(신선 3축 평가). receipt 의
값은 전부 이 입력에서 **계산**되고 authored 상수가 없다(`generated_by:"build_receipt"`). 구체적으로:

- **`gates.diff` = `"5/5 pass"`** — `changes.gates` **5개**(diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged·**surface_in_pinned_spec**)를 세어 조립. 5번째는 표면 REST feature 가 pin 된 실 스펙에 실재하는지 대조. 하나라도 FAIL 이면 offender 를 문자열에 붙인다.
- **`gates.manual_deterministic` = `"approve (missed 0)"`** — `manual-verdict.json` 의 `verdict` + `missed` 길이에서 파생(신규 id 전수 커버, PII 주의 누락 0, secret 누출 0).
- **`gates.llm_semantic` = `"3/3 pass (accuracy·completeness·privacy, count 0)"`** — `reviews/` 안 3개 verdict 의 `verdict`/`count` 를 집계(리뷰 없으면 `"not_run"` 로 정직하게 남긴다).
- **`counts`** — `changes.counts` 에서: surface **21** · integrated **0** · new **21** · new_with_pii **8** · policy_hold **1** · new_inferred **3**.
  - 미연동이라 표면 전체 21개가 신규(첫 실행 = 전체 카탈로그).
  - PII 포함 신규 8건, `no-transmit` 정책상 전송형 PII 1건이 **`hold_pii_transmit`**(도입 보류 권고).
- **`not_verified` 3건** — `changes.new_features` 중 `provenance="inferred"` 인 id(= webhook, 스펙 밖)를 걸러 파생(정직한 provenance). 라이브 미검증이라 공식 문서 재확인 필요:
  `webhook.message.created` · `webhook.userchat.opened` · `webhook.user.created`. (REST feature 는 pin 된 스펙에 실재하므로 `pinned` — `not_verified` 아님.)
- **`clean: true`** — authored `true` 가 아니라 `diff 전부 pass ∧ manual approve(missed 0) ∧ llm 실행됨·전부 pass` 를 **모두 계산**해 결정한다. 하나라도 안 서면 `false`.

**신선 3축 리뷰어는 빈 스텁이 아니다.** `reviews/{accuracy,completeness,privacy}-verdict.json` 은 매뉴얼을
실제 표면과 대조한 근거를 남긴다 — 각 verdict 의 `checked[]`(예: accuracy 는 "매뉴얼 21개 섹션의 method+path 를
`surface.snapshot.json` features 와 1:1 대조 — 지어낸 엔드포인트 0건", auth 헤더 규칙(REST 18건 x-access-key+secret,
webhook 3건 x-signature)·params·필드·provenance 전수 대조)와 `sampled_ids[]`(실제로 표집한 feature id 목록:
`openapi.user.upsert`·`openapi.message.list`·`openapi.channel.get`·`webhook.message.created` 등). completeness·privacy
verdict 는 예전 저장본이 참조하던 `openapi.user.list` 가 **이 run 의 표면(21건)에 없음**을 명시한다(교정 반영 확인).
이 3축이 결정적 `verify_manual` 위에 **의미 채점**을 겹쳐 maker≠checker 를 완성한다.

> 위 값은 `build_receipt.mjs` 가 `changes.json`·`manual-verdict.json`·`reviews/*.json` 에서 조립한 파생 receipt 다 — 손으로 지어낸 표가 아니다. 심사관은 receipt 와 그 세 입력 파일을 직접 열어(또는 `build_receipt.mjs` 를 재실행해) 대조할 수 있다.

### `mature-site` delta 런 (baseline-relative 감시의 실물)

`www.example.com` 은 **미연동**이라 신규 = 전체 카탈로그 21건이다 — delta 계산이 "전부 신규"라 자명해
보인다. 그래서 **성숙 연동사** `mature-site` 런을 함께 산출한다: 이미 **코어 7개**
(`customers/mature-site/baseline.json` 의 `integrated` 7건 — user.get·userchat.list·userchat.get·
user.userchats.list·message.list·message.send·manager.list)를 붙여둔 고객사다. 같은 표면 21 에 대조하면
**baseline 대비 신규 delta 14건만**(21 − 7) 걸러져 매뉴얼화된다 — 이미 붙인 7개는 조용히 빠지고, 새로 생긴
것만 PII 게이트를 거친다. 이 런도 **5/5 게이트·verify approve·신선 3축 3/3·clean**(counts: new 14 · new_with_pii 5 ·
new_inferred 3). 산출 경로: `skills/channeltalk-integration-researcher/out/<stamp>-mature-site/`.

이게 **changelog 로 대체 불가한 baseline-relative 감시**의 핵심이다: 채널톡의 릴리스 노트는 "무엇이
바뀌었나"만 알려주지 "**우리 연동(baseline) 대비 무엇이 새로 생겼나**"는 알려주지 않는다. mature-site 런은
연동사별 baseline 을 빼고 남은 delta(14)에만 도입 검토를 거는 실물 시연이다.

- `.codex-plugin/plugin.json` — `name`(kebab) + `version` + `description` + `skills:"./skills/"`, `JSON.parse` 유효.
- `skills/channeltalk-integration-researcher/SKILL.md` — frontmatter `name`+`description` 유효, `## Commands`/`## Boundaries`/`## Exit criteria` 포함.
- 조립 트리의 **모든 `.mjs` 가 `node --check` 통과**한다(`scripts/*`·`lib/*`·`test/*` + `skills/channeltalk-manual-team/workflow/channeltalk-manual-loop.mjs`). manual-loop 은 `export async function run(deps)` 형태라 문법검사를 깨지 않고 import·호출 가능(런타임이 `deps={phase,agent,parallel,log,args}` 주입). import 재작성(`../lib/`)으로 스모크 `verify_manual` approve 재현. 루프의 **산출**은 `verify_manual`(node, exit 0/3) + `cases/manual-verify.mjs`(회귀 4) + 실제 실행 로그(`out/<run>/loop-ledger.jsonl`)로 재검증한다.
- **팀 참조 무결성(dangling 0)** — `agents/channeltalk-*.md` 4개가 참조하는 `skills/channeltalk-manual-team/references/channeltalk-manual-philosophy.md` + `schemas/{accuracy,completeness,privacy}-verdict.schema.json` 이 조립 트리에 **전부 실재**한다(제출물에서 팀 루프가 자족적으로 돌 수 있음).

---

## 구조

```
src/
├── .codex-plugin/plugin.json                 필수 매니페스트
└── skills/
    ├── channeltalk-integration-researcher/
    │   ├── SKILL.md                          절차·명령·경계
    │   ├── scripts/{diff_surface,verify_manual,record_depth,build_receipt,refresh_surface}.mjs
    │   ├── lib/{surface,pii,gates,diff}.mjs · schemas/*.json
    │   ├── ssot/{api-surface,channel-swagger,provenance-lock}.json   pin 된 실 스펙 + 표면 + 해시 lock
    │   ├── test/run.mjs + test/cases/*.mjs   §11 결정적 테스트(29 케이스)
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

정직성: 표면은 **pin 된 실 OpenAPI 스펙 스냅샷**(공개 `swagger.json@57249a6`, v28.0.3, 163 ops)에 대조·교정한
것이다 — REST feature 는 `pinned`(스펙 실재·해시 고정), webhook 은 `inferred`(스펙 밖). **`pinned` ≠ `verified-live`**:
공개 스냅샷과 일치이지 라이브 호출로 확인한 게 아니라 **`verified-live` 로 단정하지 않는다**. 5번째 게이트
`surface_in_pinned_spec` 이 표면 REST feature 의 스펙 실재를 강제하므로 `no_fabricated_endpoint`(표면 내부
정합성)가 이제 현실 대비 검증까지 받는다. 코어 루프는 로컬 pin 만 읽어 오프라인·결정적이고, 공개 스펙
재다운로드는 `refresh_surface.mjs --fetch` online 1회 스텝뿐이다. 예제·산출에 실키·실 개인정보를 넣지 않는다
(secret 게이트가 실토큰 형태를 best-effort 로 차단하되 완전 보장은 아니라 플레이스홀더 규약을 1차 방어로 둔다).
