---
name: channeltalk-integration-researcher
description: 한 고객사(사이트)가 이미 붙여둔 채널톡(Channel Talk) Open API 연동(baseline)을 기준으로, pin 된 실 OpenAPI 스펙 스냅샷(swagger.json)에 대조·교정한 표면(api-surface.json)에 새로 생긴 기능을 개인정보(PII) 유출 없는 "이렇게 연동한다" 매뉴얼로 뽑고 뎁스를 누적하는 maker→checker 리서처. 키 없이 로컬 pin 만 읽어 오프라인·결정적 실행. "채널톡 API 뭐가 새로 생겼지", "내 연동 대비 신규 기능", "연동 업데이트 매뉴얼", "PIPA 안전하게 붙이기" 요청에 사용.
---

# 채널톡 연동 리서처 (신규 기능 감시기)

**신규 채널톡 기능을 도입하기 전에 개인정보(PIPA) 검토를 강제하는 게이트.** 한 고객사가
**이미 붙여둔 채널톡 연동(baseline)** 을 기준으로 표면에 새로 생긴 기능을 골라내고, 각 기능의
**PII 방향성**을 판정한다 — 전송형 PII(우리→채널톡)는 **`hold_pii_transmit`(도입 보류 권고)**,
수신형 PII(채널톡→우리 GET/webhook)는 **`mask_inbound`(마스킹 강제)**. 부차적으로 이 diff 가
**baseline 대비 신규 기능**을 잡아 준다. 정적 카탈로그가 아니라 **"게이트가 걸린 신규 기능 도입
검토기"**. 표면은 손 저작 mock 이 아니라 **pin 된 실 OpenAPI 스펙 스냅샷**(공개 `swagger.json@57249a6`,
"Channel Open Api" v28.0.3, 163 ops)에 대조·교정한 것이며, 키 없이 로컬 pin 만 읽어 오프라인·결정적이다.
maker(작성)≠checker(채점) 루프로 뎁스를 쌓는다.

- 도메인 정본: `CHANNELTALK.md`(§3 온보딩·§5 루프·§6 PII·§8 pin 정책·§10 제출·§11 검증·§12 표면 시드).
- 표면 SSOT 대역: `ssot/api-surface.json`(`surface_version` 5·`spec_lock`·`features[]` 21개, provenance = `pinned`(스펙 실재·해시 고정)|`inferred`(webhook, 스펙 밖), **`verified-live` 금지**). pin 원본 = `ssot/channel-swagger.json` + 해시 lock `ssot/provenance-lock.json`.
- 스크립트: `scripts/{diff_surface,verify_manual,record_depth,build_receipt,refresh_surface}.mjs`(순수 lib `lib/*.mjs` 위 얇은 CLI). `build_receipt` 는 changes·verdict·reviews 를 읽어 `run-receipt.json` 을 파생 조립. `refresh_surface` 는 pin 된 스펙에 표면을 대조·교정(기본 오프라인·dry-run; `--fetch` 로만 online 재다운로드).
- 역할 에이전트: `agents/channeltalk-manual-maker.md`(writer) + `agents/channeltalk-{accuracy,completeness,privacy}-reviewer.md`(신선 checker 3축).
- 고객사 상태: `customers/<site>/{profile,baseline}.json`(+ 실행마다 `depth-ledger.jsonl` 누적).

## 파이프라인 (§3 · §5)

절차 순서. Codex 엔 Claude 의 Workflow/Agent API 가 없으므로 **루프는 이 절차로** 돈다.

1. **온보딩 (프로필 없을 때만, depth 0)** — `customers/<site>/profile.json` 이 없으면 §3.1 정량 4문항을
   물어 `profile.json`(integration_stage·primary_intent·monthly_inquiries·pii_policy·depth:0) +
   `baseline.json`(미연동이면 `integrated: []`) 을 만든다. 이미 있으면 온보딩을 건너뛰고 바로 2로.
2. **결정적 diff (기계, 5게이트 — FAIL 시 즉시 중단)** — `diff_surface.mjs` 로
   `out/<stamp>-<site>/{surface.snapshot.json,changes.json}` 을 낸다. 게이트
   (diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged·**surface_in_pinned_spec**) 중
   **하나라도 FAIL(exit 2)이면 매뉴얼 단계로 넘어가지 않는다.** 5번째 게이트는 표면의 비-inferred(pinned)
   feature 가 pin 된 실 스펙(`ssot/channel-swagger.json`)의 operation 에 실재하는지 오프라인 대조한다.
3. **매뉴얼 작성 (maker)** — `agents/channeltalk-manual-maker` 서브에이전트에게
   `changes.json` + `surface.snapshot.json` **만** 근거로 `out/<run>/update-manual.md` 를 쓰게 한다
   (오케스트레이터가 손으로 쓰지 않는다 — 시켜서 위임). provenance 배지·무엇/왜·method+path+auth+params+예제(플레이스홀더 그대로)·개인정보 주의(§6).
4. **verify_manual 하드게이트 (checker, approve 까지 재작성)** — `verify_manual.mjs` 로 결정적 검증.
   `revise`(exit 3)면 심판이 지목한 누락 id·PII 주의 누락·secret 누출만 고쳐 3으로 되돌아가 **approve(exit 0, missed 0) 까지 반복**한다(가드레일: 최대 3라운드, 2R 개선 없으면 조기종료·keep-best).
   신선 평가 3축(`accuracy`/`completeness`/`privacy` 리뷰어)을 **병행**해 의미 채점을 함께 건다(maker≠checker).
5. **뎁스 기록 (기계)** — `record_depth.mjs` 로 `depth-ledger.jsonl` 에 한 줄 append + `profile.depth`+1.
   고객사가 어떤 기능을 실제로 붙였으면 `--adopt <id>` 로 `baseline.integrated` 에 넣어 다음 뎁스부터 빠지게 한다(멱등, §12-B).
6. **영수증 조립 (기계)** — `build_receipt.mjs` 로 `run-receipt.json` 을 **입력 파일에서 파생**한다:
   `changes.json`(diff 게이트·counts·provenance) + `manual-verdict.json`(verdict·missed) + `reviews/*.json`(신선 3축).
   `gates.{diff,manual_deterministic,llm_semantic}`·`counts`·`not_verified`·`clean` 이 전부 계산값이다 —
   **authored 상수 없음**(`generated_by:"build_receipt"`). receipt 는 손으로 쓴 요약이 아니라 감사 가능한 파생 산출.

**export 는 맨 마지막 뎁스에서 한 번만**(§10) — 매 실행마다 하지 않는다.

## Commands

복붙 가능한 실제 명령(경로는 스킬 루트 = `skills/channeltalk-integration-researcher/` 기준). `<site>` 예: `www.example.com`.

```bash
# 2. 결정적 diff + 5게이트 → out/<stamp>-<site>/{surface.snapshot.json,changes.json}
#    게이트 FAIL 시 exit 2(5번째 = pin 된 실 스펙 대조). --stamp 주입 시 stamp 고정(재현/테스트).
node scripts/diff_surface.mjs \
  --surface ssot/api-surface.json \
  --baseline customers/<site>/baseline.json \
  --profile customers/<site>/profile.json \
  --out out/<stamp>-<site> --stamp <stamp>

# 4. 결정적 verify(하드게이트) → approve|revise. revise=exit 3, approve=exit 0.
#    --out 주면 manual-verdict.json 도 쓴다. approve(missed 0) 까지 3→4 재작성.
node scripts/verify_manual.mjs \
  --changes out/<run>/changes.json \
  --manual out/<run>/update-manual.md \
  --out out/<run>/manual-verdict.json

# 5. 뎁스 누적 → depth-ledger.jsonl append + profile.depth+1.
#    --adopt <id> 는 baseline.integrated 에 추가(멱등) — --baseline 필요.
node scripts/record_depth.mjs \
  --changes out/<run>/changes.json \
  --profile customers/<site>/profile.json \
  --baseline customers/<site>/baseline.json \
  --ledger customers/<site>/depth-ledger.jsonl \
  [--adopt openapi.bot.create] --stamp <stamp>

# 6. run-receipt.json 조립 → changes.json·manual-verdict.json·reviews/*.json 에서 전부 파생.
#    --reviews 없으면 gates.llm_semantic="not_run". clean 도 계산값(authored 아님).
node scripts/build_receipt.mjs \
  --changes out/<run>/changes.json \
  --verdict out/<run>/manual-verdict.json \
  --reviews out/<run>/reviews \
  --out out/<run>/run-receipt.json --stamp <stamp> --site <site>

# (선택) pin 된 실 스펙에 표면 대조·교정 리포트. 기본 오프라인·dry-run(네트워크 0).
#    --write 로 api-surface.json 재생성, --fetch(online 1회) 로 공개 swagger 재다운로드·pin 갱신.
node scripts/refresh_surface.mjs            # 대조 리포트만(pin 읽기, dry-run)
# node scripts/refresh_surface.mjs --fetch  # 공개 swagger 재다운로드 → pin·lock 갱신(유일한 online 스텝)

# §11. 결정적 회귀 테스트 25 케이스(스키마·happy·멱등·delta·정책 플래그·counts·secret
#      오탐/이빨/꺾쇠우회/접두/hex24/40자/구분자분리/순수숫자·영수증 일치·receipt 파생·
#      pin 된 실 스펙 대조 4종[all_pinned_in_spec·fabricated_fails·spec_lock·upsert_patch/list_absent]).
node test/run.mjs
```

## Boundaries

**✅ Always**
- diff 5게이트를 매뉴얼 작성 **전에** 통과시킨다. FAIL 이면 중단하고 offender 를 보고한다.
  게이트의 정확한 범위(과장 금지):
  - `diff_completeness` — 표면 = 신규 ∪ 기연동(누락·중복 없음).
  - `no_fabricated_endpoint` — 신규 id 가 전부 **표면 파일 안에 실재**하는지(표면 내부 정합성).
  - `no_secret_in_example` — 예제/산출의 실 토큰 형태(긴 base64·hex 등)를 차단하는 **best-effort** 필터. 흔한 실토큰 다수를 잡고 식별자·경로·앵커 오탐은 거르되, **완전 보장은 아니다**(플레이스홀더 규약 병행).
  - `every_pii_flagged` — `pii_fields` 있으면 `has_pii` 로 표시.
  - `surface_in_pinned_spec` — **(5번째)** 표면의 비-inferred(pinned) feature 가 pin 된 실 OpenAPI 스펙(`ssot/channel-swagger.json`)의 operation 에 method+path 로 **실재**하는지 대조. 오프라인(로컬 pin, 네트워크 0)이지만 **현실 대비 검증**이라 `no_fabricated_endpoint`(표면 내부 정합성)를 넘어선다. inferred(webhook)는 스펙 밖이라 제외. 정직성 경계: pinned = 스냅샷 일치이지 라이브 호출 확인 아님.
- 수신(inbound) PII(GET/webhook + `pii_fields`)는 매뉴얼에 **마스킹**(`mask_inbound`)을 명시하고,
  `plainText` 같은 상담 본문은 마스킹 대상으로 표기한다.
- provenance 를 정직하게 — `pinned`(스펙 실재·해시 고정)|`inferred`(webhook, 스펙 밖) 만. `inferred` 기능은 **`not_verified`(라이브 미검증·문서 재확인 필요)로 보고**한다.

**⚠️ Ask (사용자 확인 후)**
- `record_depth.mjs --adopt <id>` — 고객 `baseline.json` 을 변이(integrated 추가)시키므로 실제로 붙였는지 확인 후.
- 제출물(§10) **공개**·zip 배포 — 로그·산출을 외부로 내보내기 전에.

**🚫 Never**
- provenance 를 `verified-live` 로 단정(라이브 응답으로 확인했다고 말하지 않는다).
- 예제·산출·매뉴얼에 **실 API 키/실 secret/실 개인정보** — 플레이스홀더(`<KEY>`·`<SECRET>`·`<PII:*>`)만. secret 게이트가 실토큰 형태를 best-effort 로 차단하지만(완전 보장 아님) 플레이스홀더 규약을 1차 방어로 지킨다.
- diff 게이트 미통과 상태로 매뉴얼을 출하하거나, verify `revise` 상태로 제출.

## Exit criteria (관측 가능한 done — 점수 아님)

- diff 게이트 **5/5 true** (`changes.gates` 전부 — diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged·surface_in_pinned_spec).
- `verify_manual` **approve** 이고 `missed` 길이 **0** (신규 id 누락·PII 주의 누락·secret 누출 없음).
- `changes.new_features` 의 **신규 id 전수**가 매뉴얼에 각각 섹션으로 커버됨(완전성).
- `inferred` 기능이 **`not_verified` 로 보고**됨(정직한 provenance).

## 정보 부족·잘 안 풀릴 때 (degraded)

원칙: **모르면 지어내지 말고, 막히면 멈추고 이유를 보고**한다.

- **프로필/baseline 없음** → 온보딩 4문항으로 채운다(미연동이면 `integrated:[]` = 전체 카탈로그).
- **`diff_surface` exit 1** (필수 인자 없음·스키마 위반) → 진행 중단, 메시지 그대로 보고.
- **diff 게이트 FAIL(exit 2)** → 매뉴얼 작성으로 넘어가지 말고 `gate_offenders` 를 보고(지어냄·누락·secret·PII 미플래그·**실 스펙 미실재** 사전 차단). `surface_in_pinned_spec` 이 FAIL 이면 표면 REST feature 가 pin 된 스펙에 없다는 뜻 — `refresh_surface.mjs` 로 교정하거나 제거한다.
- **`provenance=inferred`** → 매뉴얼에 "문서 검증 필요" 배지 + `not_verified` 로 보고. **라이브로 단정 금지.**
- **PII 정책 `undecided`/`consent`/`transmitting`** → 기계 flag 없음 → 매뉴얼이 동의·위탁·법무/보안 검토를 서술로 강제(보수적).
- **verify `revise` 가 3라운드/2R 비개선** → 조기종료 + keep-best, **clean pass 아님을 ledger 에 명시**.
- **표면이 실제와 어긋날 위험** → 표면은 **pin 된 실 OpenAPI 스펙 스냅샷**(해시 고정)이라 REST feature 는 5번째 게이트 `surface_in_pinned_spec` 이 스펙 실재를 강제한다(자동 상시 감시는 아님). 이 스킬의 핵심 가치는 실시간 감시가 아니라 **baseline 대비 결정적 delta + 신규 기능마다 PII 게이트**다. 공개 스펙이 바뀌면 `refresh_surface.mjs --fetch`(online 1회)로 pin·lock 을 갱신하고 표면을 재생성한다(§8). **`pinned` ≠ `verified-live`**: 스냅샷 일치이지 라이브 호출 확인이 아니라 `verified-live` 로 단정 금지.
