# channeltalk-manual-team 철학 — 근거에 갇힌 매뉴얼을 0/0/0 까지 미는 검증 (SSOT 루브릭)

이 팀은 **결정적 diff(changes.json) + surface.snapshot.json 만 근거로** 채널톡 신규 기능별 PII-안전 연동 매뉴얼(`update-manual.md`)을 쓰고, **신선 평가 3축**으로 게이트한다. 도메인 정본: `/Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/main/CHANNELTALK.md`(§5 루프·§6 PII·§12 표면 시드). 공장 정본: `main/apps/agent-factory/.claude/skills/agent-factory/references/agent-factory-philosophy.md`(channeltalk-mono repo 내 실경로 — 실재 확인됨).

## 믿음 (한 줄)
> 좋은 매뉴얼은 문장력이 아니라 **근거(changes+surface) 안에 갇혀 있고, 실측 카운트로 0/0/0 까지 밀리는 검증 시스템**이다.
> 그래서 이 팀은 maker 만 찍지 않는다. **정확·완전·개인정보 3 checker + 채점 스키마 + 게이트 루프**를 함께 갖추고, maker 는 자기 글에 도장 찍지 않는다.

## 두 개의 분리 (팀의 정체성)
1. **maker ≠ checker.** `channeltalk-manual-maker` 가 매뉴얼을 쓰고, 신선 checker 3(정확·완전·개인정보)이 다른 렌즈로 채점한다.
2. **의미 채점 + 결정적 확인.** LLM 심판(3축)에 더해, 워크플로가 코드로 선검사(지어냄 후보·누락 id·PII 주의 창·secret 토큰)하고 호출자가 `apps/channeltalk-integration-researcher/scripts/verify_manual.mjs`(결정적 checker — `--changes`/`--manual`, exit `approve=0`·`revise=3`)로 실측한다. 의미 점수만으로 출하하지 않는다.

## 성공조건 = 3 checker 채점축 (전부 카운트, minimize, 게이트 0)

| 축 | metric | 방향 | 게이트 | checker |
|---|---|---|---|---|
| **accurate** | SSOT 대조 시 지어낸 엔드포인트/필드/헤더/provenance 단정 수 | minimize | 0 | channeltalk-accuracy-reviewer |
| **complete** | changes 신규 id 중 매뉴얼에서 누락(섹션 없음·껍데기) 수 | minimize | 0 | channeltalk-completeness-reviewer |
| **privacy_safe** | (pii/policy 기능의 방향별 PII 주의 누락) + (예제 secret 누출) 수 | minimize | 0 | channeltalk-privacy-reviewer |

게이트는 **실측 카운트**다(느낌 합격 금지). 세 축이 모두 0 이어야 `pass`. 하나라도 >0 이면 `revise`.

## 매뉴얼 작성 규율 (maker — CHANNELTALK.md §5.2)
- **근거 밖 지어내기 금지**: changes+surface 에 없는 엔드포인트·필드·auth 헤더·params 를 만들지 않는다.
- **provenance 정직**: `mock`(문서 기반)·`inferred`(형태 추론)만. `inferred` 는 "문서 검증 필요". `verified-live` 단정 금지.
- **기능마다 섹션**: provenance 배지 · 무엇/왜(summary+value) · 어떻게(method+path+auth+params+예제 플레이스홀더) · 개인정보 주의.
- **예제 플레이스홀더 그대로**: `<KEY>`·`<SECRET>`·`<PII:*>`. 실키·실 개인정보 금지.

## 개인정보 규율 (§6 방향성 — privacy checker 정본)
| 방향 | 예 | 필수 주의 |
|---|---|---|
| **R** 읽기(GET, 채널톡→우리) | user.get | 최소 필드 요청·화면노출 최소·**마스킹** |
| **W** 쓰기(PUT/POST, 우리→채널톡) | user.upsert | **개인정보 외부 전송** → 수집·이용 동의 범위·위탁/제3자 제공 검토 |
| **CB** webhook(채널톡→우리) | message.created | **서명 검증(x-signature HMAC) 필수** + 수신 본문(plainText) **마스킹** |

정책 플래그(`profile.pii_policy` → `policy_flag`): `hold_pii_transmit` → "도입 보류 권고", `mask_inbound` → "수신 마스킹". 예제·데이터에 실 API 키/실 개인정보 절대 금지(secret 게이트가 24자+ base64/hex 실키 토큰 차단, 플레이스홀더만).

## 안티패턴 (이 팀이 찍으면 안 되는 신호)
| ID | Tell | 처방 |
|---|---|---|
| M-1 | 표면에 없는 엔드포인트/필드/헤더를 매뉴얼이 주장 | accuracy checker 로 지어냄 count +1, best 에서 SSOT 로 제한 |
| M-2 | 신규 id 를 나열만 하고 알맹이 없는 껍데기 | completeness checker 가 누락으로 카운트, method+path+예제 채움 |
| M-3 | pii/policy 기능인데 개인정보 주의 없음/방향 안 맞음 | privacy checker count +1, §6 방향별 주의 강제 |
| M-4 | 예제에 실키/실 개인정보 | privacy checker secret 누출 +1, `<KEY>`/`<SECRET>`/`<PII:*>` 로 치환 |
| M-5 | provenance 를 verified-live 로 단정 | accuracy checker 가 잡음, `mock`/`inferred` 로 정정 |
| M-6 | maker 가 자기 매뉴얼 자기 채점 | 신선 checker 3 분리(F-2) |

## Goodhart 방어 (점수를 정직하게)
1. **신선 checker 3** — maker 산출을 새로 읽어 채점만(자기 채점 금지). 매 라운드 새 눈.
2. **결정적 선검사 + verify_manual.mjs** — 워크플로가 코드로 지어냄·누락·PII·secret 을 먼저 세고(각 축 = max(코드, 심판)), 호출자가 결정적 verify(`apps/channeltalk-integration-researcher/scripts/verify_manual.mjs`, exit `approve=0`·`revise=3`)로 실측. 의미 점수만으로 출하 안 함.
3. **큰 재작성 감점** — 재생성은 best 에서 출발, 통과분·사실·범위 불변. 대량 변경은 표적 맞추기 의심.
4. **정직 > 칭찬** — checker 는 후하게 주지 않는다. 애매하면 결함으로 센다(특히 개인정보는 보수적).

## 종료 규칙 (keep-best · run ledger)
`stop = (accurate==0 AND complete==0 AND privacy==0) OR (round >= max_rounds) OR (2R 연속 q 개선 < 0.3)`.
keep-best: q(= -(지어냄×4)-(누락×3)-(PII/secret×5))가 최고인 매뉴얼 채택. 가드레일 도달(비-clean pass) 시 `run-ledger.json` 에 `clean:false` 명시. 무인 진행(루프 중 사람에게 안 묻는다).
