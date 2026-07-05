# CHANNELTALK.md — 채널톡 연동 리서처 (도메인 문서)

> 대상 기업 = **채널톡(Channel Talk)**. 산출 형태 = **Codex 플러그인**(AX 해커톤 제출).

---

## 0. 한 줄 정의

한 고객사(사이트)가 **이미 붙여둔 채널톡 연동(baseline)** 을 기준으로, 채널톡 Open API에 **새로 생긴 기능**을
**개인정보(PII)를 유출하지 않는 방식**의 "이렇게 연동할 수 있다" 매뉴얼로 뽑아 주고, 주기적으로 다시 돌려
**뎁스를 쌓아 가는** maker→checker **에이전트 루프**(리서처/워처). 키 없이 **로컬 모킹**으로 오프라인 실행.

핵심 성격: **정적 카탈로그가 아니라 "신규 기능 감시기"**. 
작동 원리: "기존 연동 대비 이런 기능이 추가로 나왔다 → 이렇게 붙인다".

---

## 1. 문제와 대상 (공개 근거)

- **대상 기업**: 채널톡 — 공개 Open API를 제공하는 국내 대표 비즈니스 메신저/CRM.
- **문제(공개적으로 검증 가능)**:
  - 채널톡은 공개 Open API를 제공하고 **지속적으로 확장**한다(신규 엔드포인트·webhook). 문서는 카테고리로 나뉘어 계속 늘어난다.
  - 연동사(서비스 개발자) 입장에서 **"내 연동 기준으로 무엇이 새로 생겼는가"** 를 알려주는 장치가 없다 → 신기능을 놓치거나 뒤늦게 몰아 확인.
  - 연동은 **고객 개인정보**(이름·이메일·연락처, 상담 메시지 본문)를 다뤄 **개인정보보호법(PIPA)** 상 최소수집·동의·안전조치가 필요한데, 신기능 도입 시 이 관점이 빠지기 쉽다.
- **쓰는 사람**: 채널톡을 연동해 쓰는 서비스 개발자·PM, 채널톡 파트너/에이전시. (예시 고객사: `www.ranode.net`)
- **쓰는 상황**: "예전에 연동한 뒤로 채널톡 API에 뭐가 새로 생겼지? 개인정보 안 흘리면서 뭘 더 붙일 수 있지?"를 **주기적으로** 점검할 때.

### 공개 출처 (AI가 확인 가능)
- `https://developers.channel.io/` — 채널톡 개발자 문서 허브. 카테고리: Open API·Open API for Documents·SDK(JavaScript/iOS/Android/React Native)·Webhook·Snippet 등.
- `https://api-doc.channel.io/` — Open API 레퍼런스(SPA). 자격증명으로 직접 테스트 가능.
- 인증: `https://developers.channel.io/docs/authentication-2` — "HTTP 요청 헤더에 `x-access-key`·`x-access-secret`". Desk 설정 → **API Key management** → Create new credential 로 발급.
- 실 엔드포인트(확인됨): `GET /open/v5/user-chats`(state/sortOrder/limit 1~500), `GET /open/v5/user-chats/{userChatId}/messages`(limit 1~500, since 페이지네이션), `.../sessions`, `GET/POST /open/v5/users/{userId}/user-chats`, `POST /open/v5/groups/{groupId}/messages`, `POST /open/v5/users/{userId}/events`, `GET /open/v5/managers`, `POST /open/v5/bots`.
- Message 객체 필드(확인됨): `id·chatId·personType·personId·plainText·blocks·files·createdAt` (`plainText` = 사용자 입력 본문 → 개인정보 위험).
- 개인정보보호법(PIPA) — 공개 법령.

> 주의: 위 경로·헤더·필드는 공개 문서에서 **확인한 사실**이지만, 표면 전체(모든 필드·응답 스키마)는 **재구성한 mock**이며 `provenance`로 신뢰도를 표기한다(§8): 문서로 확인한 것은 `mock`, 형태만 추론한 것(주로 webhook payload)은 `inferred`. 라이브 응답으로 단정하지 않는다.

---

## 2. 핵심 설계 원칙

1. **온보딩 우선**: 사이트별로 처음엔 **정량 질문**으로 프로필을 잡고, 이미 있으면 **뎁스를 쌓는다**(§3).
2. **신규 기능 감시**: baseline(과거 연동) ↔ 현재 표면 **diff**. 목표기반 재정렬 없이, "추가된 기능 + 연동법"만. (사용자 결정)
3. **순수 모킹 = SSOT 대역**: `api-doc.channel.io`를 SSOT로 "선언"하되, 실제 표면은 로컬 mock(`api-surface.json`)이 대역. 오프라인·결정적. 키·라이브 fetch 불필요.
4. **개인정보 우선**: 기계 게이트(예제 secret 차단·PII 필드 플래그) + 프로필 정책 강도 + 감독관 검증. 특히 **우리→채널톡 전송**과 **webhook 본문**.
5. **maker ≠ checker**: 작성 에이전트와 채점(감독관/검증 스크립트)을 분리. 매 라운드 신선 채점. 지어냄 금지.
6. **정직한 provenance**: `mock`(문서 기반)·`inferred`(추론). 절대 `verified-live` 로 단정 안 함.
7. **뎁스 누적 & 마지막 뎁스에서 export**: 각 실행이 하나의 뎁스 레이어. 누적하고, **맨 마지막 뎁스에서** 제출물로 패키징.

---

## 3. 엔트리 플로우 — 온보딩 → 뎁스 누적

```
사이트 요청
   │
   ├─ 프로필 없음 → [온보딩] 정량 질문 → profile.json + baseline.json 생성 (depth 0)
   │
   └─ 프로필 있음 → [신규기능 체크 & 뎁스 쌓기]
                     diff(기계 게이트) → 매뉴얼 작성(maker) → 검증(checker) → depth-ledger 누적(depth+1)
```

### 3.1 온보딩 정량 질문 (4문항) — 프로필의 근거

| # | 질문 | 정량 선택지 | 프로필 필드 | 영향 |
|---|---|---|---|---|
| 1 | 현재 채널톡 연동 단계 | 미연동 / 위젯·SDK만 / Open API 일부 / Open API 상당수 | `integration_stage` | baseline 초기값(미연동=빈 baseline) |
| 2 | 1순위 목표(의도) | 상담자동화 / 프로필동기화 / 상담이벤트→내부 / 운영최적화 / **신규기능 감시** | `primary_intent` | 매뉴얼 강조점(기본=신규기능 감시) |
| 3 | 월 상담/문의 규모 | ~100 / 100–1k / 1k–10k / 10k+ | `monthly_inquiries` | 연동 노력·ROI 가중 |
| 4 | 개인정보 채널톡 전송 가능? | 전송불가(최소화) / 동의시 가능 / 이미 전송중 / 미정 | `pii_policy` | **개인정보 게이트 강도**(§6) |

### 3.2 신규 vs 기존 분기
- **신규(프로필 없음)**: 온보딩 질문 → `profile.json` + `baseline.json`(미연동이면 `integrated: []`) 생성. 첫 실행은 **현재 표면 전체 = 붙일 수 있는 카탈로그**.
- **기존(프로필 있음)**: 온보딩 생략, 바로 신규기능 체크. 실제로 붙인 기능은 `baseline.integrated`에 추가돼 다음부터 빠짐(멱등).

### 3.3 뎁스 누적 모델
- 각 실행 = **하나의 뎁스 레이어**. `depth-ledger.jsonl`에 append, `profile.depth`를 +1.
- 뎁스가 쌓일수록: (a) 표면 버전이 오르며 새 delta가 잡히고, (b) 붙인 기능이 baseline으로 이동하며 "진짜 신규"만 남는다.
- **export는 맨 마지막 뎁스에서** 한 번 수행(§10) — 매 실행마다 생성하지 않는다.

---

## 4. 데이터 모델 (JSON 계약)

경로 규약: 앱 루트 아래 `ssot/`, `customers/<사이트>/`, `out/<yymmddhhmmss>-<고객사>/`. `in/` 없음.

### 4.1 `ssot/api-surface.json` — 채널톡 API 표면(모킹 SSOT)
실제 v5 경로·헤더·필드 기반. 전체 시드는 §12. 아래는 한 feature의 계약 형태:
```jsonc
{
  "source": "https://api-doc.channel.io/",   // 선언 SSOT
  "base_url": "https://api.channel.io/open/v5",
  "provenance_default": "mock",
  "surface_version": 4,                        // 신기능 추가마다 +1
  "features": [
    {
      "id": "openapi.user.get",                // 안정적 식별자(불변). baseline/changes 가 이걸로 추적
      "category": "User",                       // User/UserChat/Message/Manager/Group/Bot/Channel/Webhook
      "method": "GET", "path": "/open/v5/users/{userId}",
      "auth": ["x-access-key", "x-access-secret"],   // webhook 은 ["x-signature (HMAC)"]
      "summary": "단일 유저(고객) 조회",
      "params": [{ "name": "userId", "in": "path", "required": true }],
      "pii_fields": ["name", "email", "mobileNumber", "avatarUrl", "profile"], // 개인정보 필드(비면 없음)
      "example_request": "GET /open/v5/users/{userId}\nx-access-key: <KEY>\nx-access-secret: <SECRET>",
      "example_response": { "user": { "id": "u_1", "name": "<PII:name>", "email": "<PII:email>",
                                       "mobileNumber": "<PII:mobile>", "profile": { "<custom>": "<PII>" } } },
      "value": "채널톡 고객 프로필을 서비스 계정과 매핑",
      "provenance": "mock",                     // mock | inferred (verified-live 금지)
      "added_in_version": 1
    }
  ]
}
```
> `profile`(커스텀 필드)은 무엇이든 담길 수 있어 개인정보로 간주. 발신 메시지 본문에는 개인정보를 넣지 않는다.

### 4.2 `customers/<사이트>/profile.json` — 온보딩 결과(정량)
```jsonc
{
  "customer": "www.ranode.net",
  "onboarded_at": "2026-07-05",
  "integration_stage": "none",            // 4.1 온보딩 Q1
  "primary_intent": "new-feature-watch",  // Q2
  "monthly_inquiries": "1k-10k",          // Q3
  "pii_policy": "no-transmit",            // Q4 (no-transmit|consent|transmitting|undecided)
  "depth": 0                               // 실행마다 +1
}
```

### 4.3 `customers/<사이트>/baseline.json` — 이미 연동한 기능
```jsonc
{
  "customer": "www.ranode.net",
  "baseline_version": 1,
  "integrated_at_surface_version": 0,
  "integrated": []          // 미연동이면 빈 배열. diff = 표면 features − integrated
}
```

### 4.4 `out/<run>/changes.json` — 결정적 diff 산출(기계 근거)
```jsonc
{
  "customer": "www.ranode.net",
  "surface_version": 4, "baseline_version": 1,
  "profile": { "integration_stage": "none", "pii_policy": "no-transmit", "depth": 0 },
  "new_features": [   // 미연동 → 표면 22개 전부 신규. 아래는 발췌 1건
    { "id": "openapi.user.upsert", "category": "User", "method": "PUT",
      "has_pii": true, "pii_fields": ["name","email","mobileNumber","profile"],
      "provenance": "mock", "added_in_version": 2,
      "policy_flag": "hold_pii_transmit" }   // §6: 프로필 정책 기반 플래그
  ],
  "removed": [],            // 연동했는데 표면에서 사라진 id(폐기 감시)
  "counts": { "surface": 22, "integrated": 0, "new": 22, "new_with_pii": 9, "policy_hold": 1, "new_inferred": 4 },
  "gates": { "diff_completeness": true, "no_fabricated_endpoint": true,
             "no_secret_in_example": true, "every_pii_flagged": true },
  "gate_offenders": {}
}
```

### 4.5 `customers/<사이트>/depth-ledger.jsonl` — 뎁스 누적(append-only)
```jsonc
{ "depth": 1, "stamp": "260705190000", "at": "...", "surface_version": 4, "new": 22, "new_with_pii": 9, "adopted": [] }
```

### 4.6 `out/<run>/manual-verdict.json` — 감독관 채점(선택, §5)
```jsonc
{ "round": 1, "scores": { "accurate": 9, "complete": 10, "privacy_safe": 9 },
  "weighted": 9.3, "verdict": "approve",
  "missed": [], "fabricated": [], "privacy_gaps": [], "fixes": [] }
```

---

## 5. 에이전트 루프 (maker→checker) & 게이트

| 단계 | 종류 | 담당 | 산출 |
|---|---|---|---|
| 0. 온보딩(프로필 없을 때만) | 질문 | 오케스트레이터 | `profile.json` + `baseline.json` |
| 1. 결정적 diff | **기계** | `diff_surface` | `changes.json` + 4 게이트 |
| 2. 매뉴얼 작성 | 에이전트(maker) | writer | `update-manual.md` |
| 3. 검증 | **기계**(verify) + 에이전트(감독관) | verify script / supervisor | `revise`/`approve` |
| 4. 뎁스 기록 | 기계 | `record_depth` | `depth-ledger.jsonl` 추가, `profile.depth`+1 |

### 5.1 결정적 diff 게이트 4개 (에이전트 전에 실행, 하나라도 실패 시 중단)
1. **diff_completeness** — 표면 = (신규 ∪ 기연동), 누락 없음.
2. **no_fabricated_endpoint** — changes의 모든 id가 표면에 실재.
3. **no_secret_in_example** — 예제에 실키·실 secret 없음(24자+ base64/hex 토큰 차단, `<KEY>`/`<SECRET>` 플레이스홀더만).
4. **every_pii_flagged** — `pii_fields` 있는 신규 기능은 `has_pii:true`.

### 5.2 매뉴얼 작성 (maker) — 기능마다
- provenance 배지(mock/inferred; inferred는 "문서 검증 필요")
- 무엇/왜(summary + value)
- 어떻게: method+path, auth 헤더, params, 예제(플레이스홀더 그대로)
- **개인정보 주의**(pii_fields 또는 policy_flag 있으면 필수) — §6
- 근거는 `changes.json` + `surface.snapshot.json`뿐. **지어내지 않는다.**

### 5.3 검증 (checker)
- **결정적 verify**(서브에이전트 없는 Codex도 루프 가능): 신규 id 누락·PII 주의 누락·secret 누출 검사 → `approve`/`revise`.
- **감독관(선택, Claude)**: 정확(SSOT 일치·지어냄 없음)·완전(누락 없음)·개인정보 안전 3축 채점.

### 5.4 done / 가드레일 / keep-best
- **done**: diff 게이트 4개 전부 true **그리고** verify(및/또는 감독관) `approve`(누락·PII누락·secret = 0).
- **가드레일**: 최대 3라운드, 2R 개선 없으면 조기종료.
- **keep-best**: 최고 점수 매뉴얼 채택(가드레일 도달 시 clean pass 아님을 ledger에 명시).

---

## 6. 개인정보(PII) 규칙 (PIPA)

### 무엇이 PII인가 (채널톡 기준)
- 고객 식별·연락: `name`, `email`, `mobileNumber`, 프로필 커스텀 필드.
- 상담 본문: 메시지 `plainText`(고객이 이름·연락처·주문번호를 적을 수 있음).
- 매니저(상담원) 이름·이메일도 개인정보. 목록이 id·상태만 반환하면 아님.
- 정본은 `surface.features[].pii_fields`.

### 방향성 (매뉴얼이 반드시 구분)
| 방향 | 예 | 주의 |
|---|---|---|
| 읽기(GET) 채널톡→우리 | user.get | 최소 필드 요청·화면노출 최소·마스킹 |
| 쓰기(PUT/POST) 우리→채널톡 | user.upsert | **개인정보를 외부로 전송** → 수집·이용 동의 범위, 위탁/제3자 제공 검토 |
| webhook 채널톡→우리 콜백 | message.created | 서명 검증 필수, 수신 본문(plainText) **마스킹** |

### 프로필 정책 강도 (`profile.pii_policy` → `policy_flag`)
- `no-transmit`(전송 불가·최소화): **우리→채널톡 PII 전송**(PUT/POST + pii) → `hold_pii_transmit`(도입 보류 권고). 수신(GET/webhook + pii) → `mask_inbound`.
- `consent`(동의 시 가능): 전송형은 매뉴얼이 **동의·위탁 체크리스트** 강제.
- `transmitting`(이미 동의·전송 중): 전송형도 추천하되 마스킹·보관기간 안내.
- `undecided`(미정): PII 기능은 보수적으로 "법무/보안 검토 필요" 플래그.

### 절대 규칙
- 예제·데이터에 **실 API 키/실 개인정보 금지**(플레이스홀더만). secret 게이트가 실키 토큰을 차단.

---

## 7. 산출물 구조 (앱별 out/)

개발은 **3앱**(관심사 분리), 제출은 **단일 플러그인**으로 조립(§10). 각 앱이 자기 `out/`을 가진다.

```
main/apps/
├── channeltalk-api-mock/            엔진·표면 소유 — ssot/·schemas/·lib/{surface,pii,gates,diff}·scripts/diff_surface·test/run
│   └── out/                          engine-selftest·surface-report (고정 이름, 결정적)
├── channeltalk-integration-researcher/   루프·검증·시드 — scripts/{verify_manual,record_depth}·customers/·.claude/{agents,skills}
│   ├── out/<yymmddhhmmss>-<고객사>/  (런 = 뎁스 1개)
│   │   ├── surface.snapshot.json     대조한 표면 스냅샷
│   │   ├── changes.json              결정적 diff + 게이트 + 프로필 요약
│   │   ├── update-manual.md          ← 최종 산출(연동 업데이트 매뉴얼)
│   │   ├── manual-verdict.json       결정적/평가 채점
│   │   └── run-receipt.json          영수증(produced·commands·gates·not_verified·risks)
│   └── customers/<고객사>/depth-ledger.jsonl   뎁스 누적(런 전반, 추적)
└── channeltalk-plugin/              조립 대상 — plugin-src·skill-src·README-src·scripts/build_submission
    └── out/                          src/ 스테이징 · submission.zip (빌드 산출)
```
- **모든 `out/`은 재생성 가능**(gitignore, 슬래시 앞 없어 어느 깊이든 매칭). `ssot/`·`customers/`·소스·`.claude/`는 추적.
- `in/`·`research/`는 **필요할 때만** 생성(agent-factory 규약) — 디폴트로 안 판다.
- `--stamp` 주입 시 out 경로·산출 바이트 고정(테스트 재현), 미주입 시 실시계.

---

## 8. 모킹 정책 (SSOT 대역)

- `api-doc.channel.io`는 **SPA + 키 필요**라 라이브 fetch 불안정 → `ssot/api-surface.json`이 **정본 대역**.
- 각 feature `provenance`: `mock`(공개 문서 기반 재구성) / `inferred`(형태 추론). **verified-live 금지**.
- **신기능 시뮬레이션**: 채널톡이 API를 추가했다고 가정 → `features[]`에 항목 추가 + `surface_version`+1 + 새 항목 `added_in_version` → 다음 실행이 그 **delta만** 잡는다.
- 실제 연동 전에는 공개 문서로 표면을 재검증(그때 provenance 갱신).

---

## 9. 주기 감시 / 자동화

- 실행(diff)만 cron/스케줄러로 주기 등록 → 신규가 생기면 알림.
- 예) `0 9 * * * node <앱>/scripts/diff_surface.mjs --customer ranode.net`
- 훅으로 강제 갱신 가능하나 **자동 설치는 하지 않고** 문서로만 안내(사용자 선택).

---

## 10. Codex 플러그인 제출물 (AX 해커톤)

### 제출 구조 (`channeltalk-plugin/scripts/build_submission.mjs` 로 조립 — 빌드·검증 완료)
```
submission.zip                            ← 24파일, 105KB, self-inclusion 없음
├── src/                                  ← 플러그인 루트(전부 src 안)
│   ├── .codex-plugin/plugin.json         ← 필수 매니페스트
│   └── skills/channeltalk-integration-researcher/
│       ├── SKILL.md                      ← 런타임 절차 + ## Commands · ## Boundaries(✅/⚠️/🚫) · ## Exit criteria
│       ├── lib/{surface,pii,gates,diff}.mjs
│       ├── scripts/{diff_surface,verify_manual,record_depth}.mjs
│       ├── ssot/api-surface.json · schemas/*.json
│       ├── agents/{manual-maker,accuracy,completeness,privacy}.md
│       ├── test/run.mjs
│       └── customers/<고객사>/{profile,baseline}.json
├── README.md                             ← 제출 설명 + 질문 5문항 답변 + ## 검증
└── logs/                                 ← AI 대화 로그(무편집)
```
> 모킹은 **스크립트만**(`.mcp.json` 미사용, 사용자 결정). `verify_manual`·`record_depth`의 `../../channeltalk-api-mock/lib/` import 는 조립 시 `../lib/`로 **재작성**(런타임 실증됨).

### plugin.json (핵심 필드; 공식 문서 기준)
```json
{ "name": "channeltalk-integration-researcher", "version": "1.0.0",
  "description": "...", "skills": "./skills/" }
```
- `name` 필수. 경로는 `./` 상대. 스킬은 `skills/<name>/SKILL.md`, frontmatter `name`+`description` 필수.
- Codex엔 Claude의 Workflow/Agent API가 없으므로 **루프는 SKILL.md에 절차로**: diff(기계 게이트) → 매뉴얼 작성 → verify 스크립트(결정적 checker) → 수정 반복.

### 로그 훅 (log-hooks / axwar)
- 작업 폴더 루트에 훅을 두면 매 턴/세션 종료 시 대화를 `logs/<tool>/<session>.jsonl`로 자동 저장.
- Claude Code: `.claude/settings.json`의 `Stop`·`SessionEnd`가 `${CLAUDE_PROJECT_DIR}/tools/save_log.py --tool claude-code`.
- Codex: `.codex/hooks.json`의 `Stop`가 `tools/save_log.py --tool codex`.
- **반드시 repo 루트에서 세션을 켜야** 훅 경로·`logs/` 위치가 맞는다.
- **로그는 원본 그대로**(편집·발췌·삭제 시 실격). 손으로 만들지 않는다.
- export는 **맨 마지막에 한 번** 수동 실행(자동 아님): `src`(단일 소스에서 조립) + `README.md` + `logs/`(무편집 복사) → `submission.zip`.

### 질문 5문항 (요지)
1. **무엇/누가/언제**: 채널톡 연동사(개발자·PM)가, baseline 기준 신규 API 기능을 개인정보 주의와 함께 매뉴얼로 받는다.
2. **왜 이 문제**: 채널톡 Open API는 계속 확장되는데 "내 연동 대비 신규"를 알려주는 장치가 없고, 연동은 PII/PIPA 리스크가 있다(공개 문서·법령 근거).
3. **어떻게 작동**: 온보딩→결정적 diff(4게이트)→매뉴얼 작성(maker)→결정적 verify(checker)→뎁스 누적.
4. **AI 활용**: 설계·구현을 AI 대화로(logs), 공개 문서 조사→표면 mock 재구성, maker≠checker 루프 설계, 작성은 AI·채점은 스크립트.
5. **검증**: happy/멱등/secret 음성/신기능 delta/verify 음성 결정적 테스트 + 스킬 구조 검증 + 로그·플러그인·답변 정합.

---

## 11. 검증 방법 (결정적) — `channeltalk-api-mock/test/run.mjs` 9종 + 게이트 실측

| 테스트 | 기대 | 상태 |
|---|---|---|
| surface_schema_valid | api-surface.json 이 스키마 통과 | ✅ |
| happy | ranode baseline:[] vs 표면 v4 → 신규 22, 게이트 4/4 PASS(exit 0) | ✅ |
| 멱등 | baseline=전체 → 신규 0 | ✅ |
| secret 음성 | 예제에 실키 주입 → secret 게이트 FAIL, offender 지목 | ✅ |
| 신규기능 시뮬(delta) | 표면 +1 → 그 delta 1개만 노출 | ✅ |
| 정책 플래그 | `no-transmit` + user.upsert(W+PII) → `hold_pii_transmit`, get(R) → `mask_inbound` | ✅ |
| counts_shape_ranode | new 22 · new_with_pii 9 · policy_hold 1 · new_inferred 4 (§4.4 계약) | ✅ |
| **no_false_positive_on_slug** | 식별자·경로·마크다운 앵커(예: `--openapi…`) → secret 오탐 **0** | ✅ (런타임 루프가 잡은 버그 회귀방지) |
| **teeth_real_token** | 실 base64 키·40자 hex → 여전히 **잡힘** | ✅ |

- **verify 음성**(결정적 checker): 개인정보 주의/누락 id/secret 주입 매뉴얼 → `verify_manual` `revise`(누락 지목, exit 3). ✅
- **실제 매뉴얼 게이트**: ranode 22기능 `update-manual.md` → `verify_manual` `approve`(missed 0). ✅ 영수증(`run-receipt.json`)에 `not_verified`(inferred 4건) 결정적 도출.
- **스킬/플러그인 구조**: `plugin.json` JSON.parse, `SKILL.md` frontmatter+3섹션, 조립 트리 `node --check` 8/8, 스모크 diff new 22. ✅
- **표현 방식**: 위 결과는 손으로 주장하지 않고 러너 출력·게이트 exit·영수증에서 인용(재현: `node test/run.mjs`).

---

## 12. 부록 A — 현실적 mock 표면 시드 (실제 채널톡 Open API v5 기반)

실제 문서에서 확인한 경로·헤더·필드로 구성한 `ssot/api-surface.json` 시드. `surface_version: 4`, 22 features.
방향(dir): R=읽기(채널톡→우리) · W=쓰기(우리→채널톡) · CB=webhook 콜백(채널톡→우리). prov: 문서확인=mock, 추론=inferred.

| id | cat | method · path | v | pii_fields | dir | prov |
|---|---|---|---|---|---|---|
| openapi.user.list | User | GET /users | 1 | name,email,mobileNumber | R | mock |
| openapi.user.get | User | GET /users/{userId} | 1 | name,email,mobileNumber,avatarUrl,profile | R | mock |
| openapi.user.upsert | User | PUT /users/{userId} | 2 | name,email,mobileNumber,profile | **W** | mock |
| openapi.user.delete | User | DELETE /users/{userId} | 2 | — | W | mock |
| openapi.user.event.create | Event | POST /users/{userId}/events | 3 | property | W | mock |
| openapi.userchat.list | UserChat | GET /user-chats | 1 | — | R | mock |
| openapi.userchat.get | UserChat | GET /user-chats/{userChatId} | 1 | — | R | mock |
| openapi.user.userchats.list | UserChat | GET /users/{userId}/user-chats | 1 | — | R | mock |
| openapi.user.userchats.create | UserChat | POST /users/{userId}/user-chats | 2 | — | W | mock |
| openapi.userchat.sessions.list | UserChat | GET /user-chats/{userChatId}/sessions | 2 | — | R | mock |
| openapi.message.list | Message | GET /user-chats/{userChatId}/messages | 1 | plainText,files | R | mock |
| openapi.message.send | Message | POST /user-chats/{userChatId}/messages | 1 | — | W | mock |
| openapi.group.message.send | Message | POST /groups/{groupId}/messages | 2 | — | W | mock |
| openapi.manager.list | Manager | GET /managers | 1 | name,email | R | mock |
| openapi.manager.get | Manager | GET /managers/{managerId} | 2 | name,email | R | mock |
| openapi.group.list | Group | GET /groups | 2 | — | R | mock |
| openapi.bot.create | Bot | POST /bots | 3 | — | W | mock |
| openapi.bot.list | Bot | GET /bots | 3 | — | R | mock |
| openapi.channel.get | Channel | GET /channel | 2 | — | R | inferred |
| webhook.message.created | Webhook | POST (콜백) | 3 | entity.plainText | CB | inferred |
| webhook.userchat.opened | Webhook | POST (콜백) | 3 | — | CB | inferred |
| webhook.user.created | Webhook | POST (콜백) | 4 | entity.name,entity.email,entity.mobileNumber | CB | inferred |

경로는 모두 `base_url = https://api.channel.io/open/v5` 상대. REST auth = `x-access-key`+`x-access-secret`, webhook = `x-signature (HMAC)`.
버전 스토리(신기능 진화): v1 = 코어 8개(조회·상담·메시지·매니저) · v2 = 확장 8개(쓰기·세션·그룹·채널) · v3 = 자동화 5개(이벤트·봇·webhook) · v4 = 신규 1개(user.created webhook).

대표 feature 계약(발췌):
```jsonc
// PII 전송(W) — 미연동 ranode 의 no-transmit 정책에서 hold_pii_transmit
{ "id": "openapi.user.upsert", "category": "User", "method": "PUT", "path": "/open/v5/users/{userId}",
  "auth": ["x-access-key","x-access-secret"], "pii_fields": ["name","email","mobileNumber","profile"],
  "example_request": "PUT /open/v5/users/{userId}\nx-access-key: <KEY>\nx-access-secret: <SECRET>\n{\"profile\":{\"name\":\"<PII:name>\",\"email\":\"<PII:email>\"}}",
  "value": "회원정보를 상담원이 보게 동기화(단, 개인정보 외부 전송 — 동의·위탁 검토)",
  "provenance": "mock", "added_in_version": 2 }
// 상담 본문 수신(R) — plainText 는 사용자 입력 → 마스킹
{ "id": "openapi.message.list", "category": "Message", "method": "GET",
  "path": "/open/v5/user-chats/{userChatId}/messages", "pii_fields": ["plainText","files"],
  "params": [{"name":"limit","in":"query","required":false},{"name":"since","in":"query","required":false}],
  "provenance": "mock", "added_in_version": 1 }
// webhook 신규(CB, inferred) — 유저 생성 콜백에 PII 유입
{ "id": "webhook.user.created", "category": "Webhook", "method": "POST", "path": "(구독자 콜백 URL)",
  "event": "user.created", "auth": ["x-signature (HMAC)"],
  "pii_fields": ["entity.name","entity.email","entity.mobileNumber"],
  "example_response": { "type": "user", "entity": { "id":"u_1", "name":"<PII:name>", "email":"<PII:email>" } },
  "provenance": "inferred", "added_in_version": 4 }
```

## 12-B. 부록 B — 두 baseline 시나리오 (diff 현실성)

같은 표면(v4, 22개)에 baseline만 달리해 "신규 기능 감시"를 보여준다.

**(a) `www.ranode.net` — 온보딩 미연동** (`integrated: []`)
- 온보딩 응답: 미연동 · 신규기능 감시 · 월 1k~10k · 개인정보 **전송 불가(최소화)**.
- 첫 실행 = **전체 22개 카탈로그**. 정책 적용:
  - `hold_pii_transmit`(도입 보류): `openapi.user.upsert`(W+PII).
  - `mask_inbound`(수신 마스킹): `user.list`·`user.get`·`message.list`·`manager.list`·`manager.get`·`webhook.user.created`.
  - `user.event.create` 는 `property` 에 PII 섞임 가능 → 이벤트 속성에서 개인정보 제외 권고.

**(b) 성숙 연동사 — v1 코어만 연동** (`integrated: [v1 8개]`)
- diff = **v2~v4 신규 14개만**. 이게 진짜 "이런 기능이 추가로 나왔다":
  - v2(8): user.upsert·user.delete·user.userchats.create·userchat.sessions.list·group.message.send·manager.get·group.list·channel.get
  - v3(5): user.event.create·bot.create·bot.list·webhook.message.created·webhook.userchat.opened
  - v4(1): webhook.user.created
- 이후 고객사가 `bot.create` 를 실제로 붙이면 `record_depth --adopt openapi.bot.create` → 다음 뎁스부터 빠지고, 표면이 v5로 오르면 그 delta만 새로 뜬다.

---

## 13. 구현 규약 (MUST — 구현 전 반드시 준수)

이 앱을 실제로 구현할 때 지켜야 하는 강제 규칙이다. 위반은 리뷰에서 반려한다.

1. **하드코딩 금지.** 표면·PII 필드·게이트 임계·경로·고객명·임계치 등 모든 값·규칙은 **이 문서(정본) → `ssot/*.json` · `schemas/*.json` · config**에서 읽는다. 스크립트/에이전트 프롬프트에 값을 박지 않는다. 새 값이 필요하면 §4·§12를 먼저 고치고 구현이 그걸 참조한다.

2. **유즈케이스 체크.** 모듈·기능을 추가할 때마다 §1(쓰는 사람·상황)·§11(결정적 테스트)의 유즈케이스에 매핑되는지 확인한다. 어떤 유즈케이스도 커버하지 않는 코드는 넣지 않는다. "이 코드가 어느 시나리오를 만족시키는가"를 근거로 남긴다.

3. **모듈화.** 관심사를 분리한다 — `diff_surface`(결정적 diff+게이트) · `verify_manual`(결정적 checker) · `record_depth`(뎁스 누적) · PII 게이트 · 모킹 로더를 각각 독립 모듈로. 한 파일에 로직을 몰지 않고, 각 모듈은 단독 테스트·재사용 가능해야 한다.

4. **에이전트 루프는 "직접 돌리지 말고 시켜서" 구성.** 오케스트레이터가 매뉴얼을 손으로 쓰지 않는다. **maker→checker 팀을 구성해 루프를 위임**한다(작성=maker 에이전트, 채점=checker/평가 에이전트). 오케스트레이터는 라운드·점수만 중계하고, 실제 생성·채점은 팀이 한다. → 규칙 8·9와 연결.

5. **lint · 모킹을 제대로 처리.** 모든 스크립트는 `node --check` 통과 + 스키마는 `JSON.parse` 검증. 모킹은 §8 정책대로 `ssot/api-surface.json`이 라이브 fetch 대역이며 **오프라인·결정적**이어야 한다(네트워크 호출·실키 의존 금지). `provenance`(mock/inferred)를 반드시 표기하고 `verified-live`로 단정하지 않는다. secret 게이트가 실키 토큰을 차단하는지 lint에 포함.

6. **평가(checker) 에이전트를 별도로 추가.** maker와 분리된 **신선 평가 에이전트**를 두어 §5.3의 3축(정확·완전·개인정보 안전)으로 채점하고 게이트한다. 평가 에이전트는 매 라운드 새 눈으로 채점하고, 자기 작성물을 자기가 채점하지 않는다(maker≠checker). 결정적 verify(스크립트)와 의미 채점(에이전트)을 함께 건다.

7. **완성 후 테스트코드 구성.** 전부 완성되면 §11 결정적 테스트(happy·멱등·secret 음성·신기능 delta·verify 음성·정책 플래그·스킬 구조)를 실제 테스트 코드로 작성해 회귀 가능 상태로 만든다. 테스트는 마지막에 몰아서가 아니라 "완성 시점의 게이트"로 둔다.

8. **에이전트 루프는 `agent-factory` 사용법을 따른다.** 루프(maker→checker 팀·게이트·keep-best·ledger)를 새로 발명하지 말고 **`main/apps/agent-factory`** 의 방식을 재사용한다: 한 줄 brief/spec → maker(architect) 생성 → 신선 checker(inspector) 채점 → 게이트까지 재생성 → 호출자 실측 출하. 워크플로/스키마/검증 게이트 패턴을 그대로 차용한다(SSOT: `main/apps/agent-factory/.claude/skills/agent-factory/SKILL.md`).

9. **스킬보다 에이전트 md 방식 우선.** 역할(maker·checker·평가)은 **`.claude/agents/*.md` 서브에이전트 정의**로 두는 것을 우선한다. 스킬(SKILL.md)은 진입점·절차에만 쓰고, 안정적인 "역할+기준"은 에이전트 md로 분리한다(휘발성 task·경로·schema만 오케스트레이션이 주입). Codex 제출 패키징(§10)에서 스킬이 필요하면 에이전트 정의를 근거로 얇게 감싼다.

---

### 이 문서의 위치
- 도메인/설계 정본. 실제 구현(스킬·스크립트·에이전트·제출 패키징)은 이 문서를 근거로 새로 작성한다.
- 값·규칙 변경 시 이 문서를 먼저 고치고 구현을 맞춘다.
- 구현 시 §13 구현 규약(MUST)을 전제로 한다.
