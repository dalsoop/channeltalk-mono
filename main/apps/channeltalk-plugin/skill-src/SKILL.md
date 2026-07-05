---
name: channeltalk-integration-researcher
description: 한 고객사(사이트)가 이미 붙여둔 채널톡(Channel Talk) Open API 연동(baseline)을 기준으로, 표면(api-surface.json)에 새로 생긴 기능을 개인정보(PII) 유출 없는 "이렇게 연동한다" 매뉴얼로 뽑고 뎁스를 누적하는 maker→checker 리서처. 키 없이 로컬 mock 으로 오프라인·결정적 실행. "채널톡 API 뭐가 새로 생겼지", "내 연동 대비 신규 기능", "연동 업데이트 매뉴얼", "PIPA 안전하게 붙이기" 요청에 사용.
---

# 채널톡 연동 리서처 (신규 기능 감시기)

한 고객사가 **이미 붙여둔 채널톡 연동(baseline)** 을 기준으로, 채널톡 Open API 표면에
**새로 생긴 기능**을 **개인정보(PII)를 유출하지 않는** "이렇게 연동할 수 있다" 매뉴얼로 뽑아
주고, 주기적으로 다시 돌려 **뎁스를 쌓아 가는** maker→checker 에이전트 루프다.
정적 카탈로그가 아니라 **"기존 연동 대비 신규 기능 감시기"**. 키 없이 로컬 mock 으로 오프라인·결정적.

- 도메인 정본: `CHANNELTALK.md`(§3 온보딩·§5 루프·§6 PII·§10 제출·§11 검증·§12 표면 시드).
- 표면 SSOT 대역: `ssot/api-surface.json`(`surface_version`·`features[]`, provenance = `mock`|`inferred`, **`verified-live` 금지**).
- 스크립트: `scripts/{diff_surface,verify_manual,record_depth}.mjs`(순수 lib `lib/*.mjs` 위 얇은 CLI).
- 역할 에이전트: `agents/channeltalk-manual-maker.md`(writer) + `agents/channeltalk-{accuracy,completeness,privacy}-reviewer.md`(신선 checker 3축).
- 고객사 상태: `customers/<site>/{profile,baseline}.json`(+ 실행마다 `depth-ledger.jsonl` 누적).

## 파이프라인 (§3 · §5)

절차 순서. Codex 엔 Claude 의 Workflow/Agent API 가 없으므로 **루프는 이 절차로** 돈다.

1. **온보딩 (프로필 없을 때만, depth 0)** — `customers/<site>/profile.json` 이 없으면 §3.1 정량 4문항을
   물어 `profile.json`(integration_stage·primary_intent·monthly_inquiries·pii_policy·depth:0) +
   `baseline.json`(미연동이면 `integrated: []`) 을 만든다. 이미 있으면 온보딩을 건너뛰고 바로 2로.
2. **결정적 diff (기계, 4게이트 — FAIL 시 즉시 중단)** — `diff_surface.mjs` 로
   `out/<stamp>-<site>/{surface.snapshot.json,changes.json}` 을 낸다. 게이트
   (diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged) 중
   **하나라도 FAIL(exit 2)이면 매뉴얼 단계로 넘어가지 않는다.**
3. **매뉴얼 작성 (maker)** — `agents/channeltalk-manual-maker` 서브에이전트에게
   `changes.json` + `surface.snapshot.json` **만** 근거로 `out/<run>/update-manual.md` 를 쓰게 한다
   (오케스트레이터가 손으로 쓰지 않는다 — 시켜서 위임). provenance 배지·무엇/왜·method+path+auth+params+예제(플레이스홀더 그대로)·개인정보 주의(§6).
4. **verify_manual 하드게이트 (checker, approve 까지 재작성)** — `verify_manual.mjs` 로 결정적 검증.
   `revise`(exit 3)면 심판이 지목한 누락 id·PII 주의 누락·secret 누출만 고쳐 3으로 되돌아가 **approve(exit 0, missed 0) 까지 반복**한다(가드레일: 최대 3라운드, 2R 개선 없으면 조기종료·keep-best).
   신선 평가 3축(`accuracy`/`completeness`/`privacy` 리뷰어)을 **병행**해 의미 채점을 함께 건다(maker≠checker).
5. **뎁스 기록 (기계)** — `record_depth.mjs` 로 `depth-ledger.jsonl` 에 한 줄 append + `profile.depth`+1.
   고객사가 어떤 기능을 실제로 붙였으면 `--adopt <id>` 로 `baseline.integrated` 에 넣어 다음 뎁스부터 빠지게 한다(멱등, §12-B).

**export 는 맨 마지막 뎁스에서 한 번만**(§10) — 매 실행마다 하지 않는다.

## Commands

복붙 가능한 실제 명령(경로는 스킬 루트 = `skills/channeltalk-integration-researcher/` 기준). `<site>` 예: `www.ranode.net`.

```bash
# 2. 결정적 diff + 4게이트 → out/<stamp>-<site>/{surface.snapshot.json,changes.json}
#    게이트 FAIL 시 exit 2. --stamp 주입 시 stamp 고정(재현/테스트).
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

# §11. 결정적 회귀 테스트(happy·멱등·secret 음성·delta·정책 플래그·secret 오탐/이빨).
node test/run.mjs
```

## Boundaries

**✅ Always**
- diff 4게이트(diff_completeness·no_fabricated_endpoint·no_secret_in_example·every_pii_flagged)를
  매뉴얼 작성 **전에** 통과시킨다. FAIL 이면 중단하고 offender 를 보고한다.
- 수신(inbound) PII(GET/webhook + `pii_fields`)는 매뉴얼에 **마스킹**(`mask_inbound`)을 명시하고,
  `plainText` 같은 상담 본문은 마스킹 대상으로 표기한다.
- provenance 를 정직하게 — `mock`|`inferred` 만. `inferred` 기능은 **`not_verified`(라이브 미검증·문서 재확인 필요)로 보고**한다.

**⚠️ Ask (사용자 확인 후)**
- `record_depth.mjs --adopt <id>` — 고객 `baseline.json` 을 변이(integrated 추가)시키므로 실제로 붙였는지 확인 후.
- 제출물(§10) **공개**·zip 배포 — 로그·산출을 외부로 내보내기 전에.

**🚫 Never**
- provenance 를 `verified-live` 로 단정(라이브 응답으로 확인했다고 말하지 않는다).
- 예제·산출·매뉴얼에 **실 API 키/실 secret/실 개인정보** — 플레이스홀더(`<KEY>`·`<SECRET>`·`<PII:*>`)만. secret 게이트가 실토큰을 차단한다.
- diff 게이트 미통과 상태로 매뉴얼을 출하하거나, verify `revise` 상태로 제출.

## Exit criteria (관측 가능한 done — 점수 아님)

- diff 게이트 **4/4 true** (`changes.gates` 전부).
- `verify_manual` **approve** 이고 `missed` 길이 **0** (신규 id 누락·PII 주의 누락·secret 누출 없음).
- `changes.new_features` 의 **신규 id 전수**가 매뉴얼에 각각 섹션으로 커버됨(완전성).
- `inferred` 기능이 **`not_verified` 로 보고**됨(정직한 provenance).
