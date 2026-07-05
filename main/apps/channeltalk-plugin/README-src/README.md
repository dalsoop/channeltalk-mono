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
에이전트)** → **결정적 verify(checker 스크립트) + 신선 평가 3축** → **뎁스 누적**. 표면은 라이브 fetch 가
아니라 `ssot/api-surface.json` mock 이 SSOT 대역(오프라인·결정적). provenance 는 `mock`|`inferred` 만
표기하고 `verified-live` 로 단정하지 않는다.

**4. AI 를 어떻게 활용했나?**
설계·구현을 AI 대화로 진행(무편집 `logs/`). 공개 문서를 조사해 API 표면을 mock 으로 재구성했고,
**maker≠checker** 루프를 설계했다 — 매뉴얼 **작성은 AI 에이전트**(`channeltalk-manual-maker`),
**채점은 결정적 스크립트**(`verify_manual`) + **신선 평가 에이전트 3축**(accuracy·completeness·privacy).
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
- 조립 트리 안에서 `scripts/*.mjs`·`lib/*.mjs`·`test/run.mjs` 전부 `node --check` 통과, import 재작성(`../lib/`)으로 스모크 diff 재현.

---

## 구조

```
src/
├── .codex-plugin/plugin.json                 필수 매니페스트
└── skills/channeltalk-integration-researcher/
    ├── SKILL.md                              절차·명령·경계
    ├── scripts/{diff_surface,verify_manual,record_depth}.mjs
    ├── lib/*.mjs · schemas/*.json · ssot/api-surface.json
    ├── test/run.mjs                          §11 결정적 테스트
    ├── agents/channeltalk-*.md               maker + reviewer 3축
    └── customers/<site>/{profile,baseline}.json
README.md                                     이 문서(질문 5문항 + 검증)
logs/                                         AI 대화 로그(무편집)
```

정직성: 표면은 공개 문서 기반 **mock**(`inferred` 는 형태 추론)이며 **`verified-live` 로 단정하지 않는다**.
예제·산출에 실키·실 개인정보를 넣지 않는다(secret 게이트가 실토큰을 차단).
