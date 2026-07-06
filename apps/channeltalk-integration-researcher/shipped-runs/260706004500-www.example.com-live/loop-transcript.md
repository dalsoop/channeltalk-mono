# 라이브 maker→checker 실행 로그 — 260706004500-www.example.com

실제 AI 루프를 한 번 돌린 재현 가능한 기록. 손으로 쓴 verdict 아님 — maker 서브에이전트가 실제 입력을 읽고 매뉴얼을 썼고,
결정적 게이트(`verify_manual.mjs`, node)와 신선 심사관 3축이 그 산출을 채점했다.

## 입력
- `changes.json` — 신규 기능 21건 (baseline=[] 대비 표면 전량)
- `surface.snapshot.json` — pin 된 실 스펙 스냅샷 표면

## 라운드 1
| 단계 | 실행 주체 | 결과 |
|---|---|---|
| maker (초안) | AI 서브에이전트 | `update-manual.md` 15552자, 신규 21건 전수 커버 |
| 결정적 게이트 | `node verify_manual.mjs` | **approve** (누락 0, 지어냄 0, PII갭 0) · exit 0 |
| 정확성 심판 | 신선 AI checker | count 0 · **pass** |
| 완전성 심판 | 신선 AI checker | count 0 · **pass** |
| 개인정보 심판 | 신선 AI checker | count 0 · **pass** |

**게이트: 지어냄 0 · 누락 0 · PII/secret 0 → clean pass (0/0/0) ✅**

## 재현
```bash
node scripts/verify_manual.mjs --changes out/<run>/changes.json --manual out/<run>/update-manual.md
# → verdict approve (exit 0)
```

## 근거 (심판이 실제로 대조한 것 — 발췌)
- 정확성: 21개 매뉴얼 엔드포인트의 method+path 를 surface.snapshot.json features[].method/path 화이트리스트와 1:1 대조 — 18 REST + 3 webhook 전부 실재(users.get/upsert/delete, user.event.create, userchat list/get/user-chats.list/create/sessions.list, message list/send, group.message.send, manager list/get, group.list, bot create/list, channel.get, webhook message.created/userchat.opened/user.created). /open/v5/... 형태인데 표면에 없는 지어낸 경로 없음. · 각 기능의 params 를 surface features[].params 와 대조 — userchat.list(state,sortOrder,limit), message.list(userChatId,limit,since), manager.list/group.list/bot.list(limit) 등 전부 표면 계약과 일치. 표면에 없는 param 추가 없음.
- 완전성: changes.json new_features has exactly 21 ids (counts.new=21); each has a dedicated '## <id>' section in update-manual.md. · openapi.user.get (L32), user.upsert (L68), user.delete (L97), user.event.create (L126) each have 무엇/왜 + 어떻게(method+path+auth+params+example) + 개인정보 주의 filled.
- 개인정보: PII/정책 필수 대상 8건 확정: openapi.user.get(R,mask_inbound), openapi.user.upsert(W,hold_pii_transmit), openapi.user.event.create(W,pii), openapi.message.list(R,mask_inbound), openapi.manager.list(R,mask_inbound), openapi.manager.get(R,mask_inbound), webhook.message.created(CB,mask_inbound), webhook.user.created(CB,mask_inbound). · openapi.user.get(R): 개인정보 주의 존재 — 최소 필드 요청·화면 노출 최소화·마스킹, 'policy_flag=mask_inbound → 수신 마스킹' 문구(update-manual.md:63-66). R 방향 정합.
