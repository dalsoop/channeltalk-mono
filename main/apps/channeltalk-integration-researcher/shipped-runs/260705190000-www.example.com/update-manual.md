# 채널톡 연동 업데이트 매뉴얼 — www.example.com

미연동 → 신규 = 전체 pinned 카탈로그 21건.

이 고객사는 현재 채널톡 미연동(`integration_stage: none`) 상태이며, 이 매뉴얼은 공개 swagger 스냅샷(`swagger.json@57249a6`, Channel Open Api v28.0.3, sha256 `57249a6c…f1a4`)에 고정(pinned)된 신규 표면 **21건 전체**를 기능별로 문서화한다. 근거는 이 실행의 `changes.json` + `surface.snapshot.json` 뿐이며, 그 밖의 엔드포인트·필드·헤더는 지어내지 않았다.

## provenance 배지 규칙

- **[pinned]** — 공개 swagger 스냅샷과 해시 일치(spec 고정). 라이브 호출로 확인한 것은 아니다. 실제 연동 전 스테이징에서 응답 형태를 검증할 것.
- **[inferred]** — webhook 등 공개 스펙 밖에서 형태를 추론. **문서 검증 필요** — 실제 콜백 페이로드·서명 방식은 채널톡 공식 webhook 문서로 반드시 확인한 뒤 도입한다.

## 인증(공통)

- OpenAPI(`openapi.*`): 모든 요청에 `x-access-key: <KEY>`, `x-access-secret: <SECRET>` 헤더. 키/시크릿은 서버 사이드에만 보관, 클라이언트 노출 금지.
- Webhook(`webhook.*`): 수신 콜백은 `x-signature (HMAC)` 서명 검증 필수. `<SIGNATURE>`는 플레이스홀더다.
- Base URL: `https://api.channel.io/open/v5`.
- 아래 예제의 `<KEY>`·`<SECRET>`·`<SIGNATURE>`·`<PII:*>`는 **플레이스홀더 그대로**다. 실제 키·실제 개인정보를 절대 붙여넣지 않는다.

## 개인정보 방향성 요약(§6)

| 방향 | 의미 | 필수 주의 |
|---|---|---|
| **R** | GET, 채널톡→우리(읽기) | 최소 필드 요청·화면 노출 최소·**마스킹** |
| **W** | PATCH/POST/DELETE, 우리→채널톡(쓰기) | **개인정보 외부 전송** → 수집·이용 동의 범위·위탁/제3자 제공 검토 |
| **CB** | webhook, 채널톡→우리(콜백) | **x-signature HMAC 서명 검증 필수** + 수신 본문(plainText 등) **마스킹** |

정책 플래그: `hold_pii_transmit` → **도입 보류 권고**, `mask_inbound` → **수신 마스킹** 명시.
이 카탈로그에서 PII 포함 21건 중 8건, 도입 보류 대상 1건(`openapi.user.upsert`), inferred 3건.

---

## openapi.user.get

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 단일 유저(고객) 조회.
**왜** — 채널톡 고객 프로필을 서비스 계정과 매핑.

**어떻게**
- Method + Path: `GET /open/v5/users/{userId}`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
GET /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "user": {
    "id": "u_1",
    "name": "<PII:name>",
    "email": "<PII:email>",
    "mobileNumber": "<PII:mobile>",
    "profile": { "<custom>": "<PII>" }
  }
}
```

**개인정보 주의** (pii_fields: name, email, mobileNumber, avatarUrl, profile / policy_flag: `mask_inbound`)
- 방향 R: **필요한 최소 필드만 요청**하고 화면 노출을 최소화한다.
- `mask_inbound` — 수신한 이름·이메일·연락처·프로필은 **마스킹**해 저장·표시한다(예: `홍*동`, `a***@example.com`).

---

## openapi.user.upsert

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 유저 프로필 생성·갱신.
**왜** — 회원정보를 상담원이 보게 동기화(단, 개인정보 외부 전송 — 동의·위탁 검토).

**어떻게**
- Method + Path: `PATCH /open/v5/users/{userId}` (PUT 아님)
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
PATCH /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
{"profile":{"name":"<PII:name>","email":"<PII:email>"}}
```

예제 응답:
```json
{
  "user": {
    "id": "u_1",
    "name": "<PII:name>",
    "email": "<PII:email>"
  }
}
```

**개인정보 주의** (pii_fields: name, email, mobileNumber, profile / policy_flag: `hold_pii_transmit`)
- 방향 W: 이름·이메일·연락처를 채널톡으로 **외부 전송**하는 동작이다. 수집·이용 동의 범위 내인지, 위탁/제3자 제공 검토가 끝났는지 확인해야 한다.
- `hold_pii_transmit` — **도입 보류 권고**. 이 고객사(`pii_policy: no-transmit`)는 개인정보 외부 전송을 하지 않는 정책이므로, 동의·위탁 검토가 완료되기 전까지 이 기능은 보류한다.

---

## openapi.user.delete

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 유저 삭제.
**왜** — 탈퇴 회원의 채널톡 프로필 정리(보관기간·파기 정책 연계).

**어떻게**
- Method + Path: `DELETE /open/v5/users/{userId}`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
DELETE /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{ "deleted": true }
```

개인정보: 이 엔드포인트 자체는 PII 필드를 반환하지 않는다(pii_fields 없음). 다만 파기는 되돌릴 수 없으므로 내부 보관기간·파기 정책과 연계해 실행한다.

---

## openapi.user.event.create

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 유저 이벤트 기록.
**왜** — 행동 이벤트로 세그먼트·자동화 트리거(속성에 개인정보 혼입 주의).

**어떻게**
- Method + Path: `POST /open/v5/users/{userId}/events`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
POST /open/v5/users/{userId}/events
x-access-key: <KEY>
x-access-secret: <SECRET>
{"name":"<event>","property":{"<key>":"<value>"}}
```

예제 응답:
```json
{
  "event": {
    "id": "ev_1",
    "name": "<event>"
  }
}
```

**개인정보 주의** (pii_fields: property)
- 방향 W: `property`에 개인정보(이름·연락처 등)가 **혼입**되면 외부 전송이 된다. 속성에는 개인정보를 넣지 않는다. 부득이 넣어야 하면 W 규칙(동의 범위·위탁/제3자 제공 검토)을 적용한다.

---

## openapi.userchat.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 상담(유저챗) 목록 조회.
**왜** — 진행 중/종료 상담 목록을 내부 대시보드에 집계.

**어떻게**
- Method + Path: `GET /open/v5/user-chats`
- Auth: `x-access-key`, `x-access-secret`
- Params: `state` (query, 선택), `sortOrder` (query, 선택), `limit` (query, 선택)

예제 요청:
```
GET /open/v5/user-chats?state=opened&limit=100
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "userChats": [
    { "id": "uc_1", "state": "opened" }
  ]
}
```

개인정보: pii_fields 없음. 목록 메타(상태 등)만 다룬다.

---

## openapi.userchat.get

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 단일 상담(유저챗) 조회.
**왜** — 특정 상담의 상태·메타를 내부 로직에서 참조.

**어떻게**
- Method + Path: `GET /open/v5/user-chats/{userChatId}`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userChatId` (path, 필수)

예제 요청:
```
GET /open/v5/user-chats/{userChatId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "userChat": { "id": "uc_1", "state": "opened" }
}
```

개인정보: pii_fields 없음. 상담 상태·메타만 다룬다.

---

## openapi.user.userchats.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 유저별 상담 목록 조회.
**왜** — 한 고객의 상담 이력을 서비스 화면에 연결.

**어떻게**
- Method + Path: `GET /open/v5/users/{userId}/user-chats`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
GET /open/v5/users/{userId}/user-chats
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "userChats": [
    { "id": "uc_1", "state": "closed" }
  ]
}
```

개인정보: pii_fields 없음. 상담 목록 메타만 다룬다.

---

## openapi.user.userchats.create

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 유저 대상 상담 생성.
**왜** — 서비스 이벤트에서 능동적으로 상담 세션을 연다.

**어떻게**
- Method + Path: `POST /open/v5/users/{userId}/user-chats`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userId` (path, 필수)

예제 요청:
```
POST /open/v5/users/{userId}/user-chats
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "userChat": { "id": "uc_2", "state": "opened" }
}
```

개인정보: pii_fields 없음. 상담 세션 생성만 수행한다(본문에 개인정보 미포함).

---

## openapi.userchat.sessions.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 상담 세션 목록 조회.
**왜** — 상담 참여 세션(읽음·참여 상태)을 추적.

**어떻게**
- Method + Path: `GET /open/v5/user-chats/{userChatId}/sessions`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userChatId` (path, 필수)

예제 요청:
```
GET /open/v5/user-chats/{userChatId}/sessions
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "sessions": [
    { "id": "s_1", "personType": "user" }
  ]
}
```

개인정보: pii_fields 없음. 세션 상태 메타만 다룬다.

---

## openapi.message.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 상담 메시지 목록 조회.
**왜** — 상담 본문을 내부 분석/CS에 연동(본문에 개인정보 혼입 — 마스킹).

**어떻게**
- Method + Path: `GET /open/v5/user-chats/{userChatId}/messages`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userChatId` (path, 필수), `limit` (query, 선택), `since` (query, 선택)

예제 요청:
```
GET /open/v5/user-chats/{userChatId}/messages?limit=100
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "messages": [
    {
      "id": "m_1",
      "chatId": "uc_1",
      "personType": "user",
      "plainText": "<PII:plainText>",
      "files": []
    }
  ]
}
```

**개인정보 주의** (pii_fields: plainText, files / policy_flag: `mask_inbound`)
- 방향 R: 상담 **본문(plainText)에 고객 개인정보가 혼입**될 수 있고, 첨부(files)도 민감할 수 있다. 최소 필드만 요청하고 화면 노출을 최소화한다.
- `mask_inbound` — 수신 본문·첨부는 **마스킹**해 저장·표시한다.

---

## openapi.message.send

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 상담에 메시지 발신.
**왜** — 서비스 로직에서 상담에 자동 응답 발신(본문에 개인정보 넣지 않음).

**어떻게**
- Method + Path: `POST /open/v5/user-chats/{userChatId}/messages`
- Auth: `x-access-key`, `x-access-secret`
- Params: `userChatId` (path, 필수)

예제 요청:
```
POST /open/v5/user-chats/{userChatId}/messages
x-access-key: <KEY>
x-access-secret: <SECRET>
{"blocks":[{"type":"text","value":"<message>"}]}
```

예제 응답:
```json
{
  "message": { "id": "m_2", "chatId": "uc_1" }
}
```

개인정보: pii_fields 없음. 다만 방향 W이므로 발신 본문에 개인정보를 넣지 않는다(필요 시 W 동의·위탁 규칙 적용).

---

## openapi.group.message.send

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 그룹에 메시지 발신.
**왜** — 팀 그룹 채널에 내부 알림·운영 메시지 발신.

**어떻게**
- Method + Path: `POST /open/v5/groups/{groupId}/messages`
- Auth: `x-access-key`, `x-access-secret`
- Params: `groupId` (path, 필수)

예제 요청:
```
POST /open/v5/groups/{groupId}/messages
x-access-key: <KEY>
x-access-secret: <SECRET>
{"blocks":[{"type":"text","value":"<message>"}]}
```

예제 응답:
```json
{
  "message": { "id": "gm_1", "groupId": "g_1" }
}
```

개인정보: pii_fields 없음. 내부 운영 메시지 발신이므로 본문에 개인정보를 넣지 않는다.

---

## openapi.manager.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 매니저(상담원) 목록 조회.
**왜** — 상담원 목록을 내부 배정 로직에 연동(상담원 이름·이메일도 개인정보).

**어떻게**
- Method + Path: `GET /open/v5/managers`
- Auth: `x-access-key`, `x-access-secret`
- Params: `limit` (query, 선택)

예제 요청:
```
GET /open/v5/managers
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "managers": [
    { "id": "mgr_1", "name": "<PII:name>", "email": "<PII:email>" }
  ]
}
```

**개인정보 주의** (pii_fields: name, email / policy_flag: `mask_inbound`)
- 방향 R: **상담원의 이름·이메일도 개인정보**다. 최소 필드만 요청하고 화면 노출을 최소화한다.
- `mask_inbound` — 수신한 상담원 이름·이메일은 **마스킹**해 저장·표시한다.

---

## openapi.manager.get

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 단일 매니저(상담원) 조회.
**왜** — 특정 상담원 정보를 서비스 화면에 표시(개인정보 최소 노출).

**어떻게**
- Method + Path: `GET /open/v5/managers/{managerId}`
- Auth: `x-access-key`, `x-access-secret`
- Params: `managerId` (path, 필수)

예제 요청:
```
GET /open/v5/managers/{managerId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "manager": { "id": "mgr_1", "name": "<PII:name>", "email": "<PII:email>" }
}
```

**개인정보 주의** (pii_fields: name, email / policy_flag: `mask_inbound`)
- 방향 R: 상담원 이름·이메일은 개인정보다. 최소 노출 원칙을 지킨다.
- `mask_inbound` — 수신한 상담원 이름·이메일은 **마스킹**해 저장·표시한다.

---

## openapi.group.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 그룹 목록 조회.
**왜** — 팀 그룹 구조를 내부 라우팅에 연동.

**어떻게**
- Method + Path: `GET /open/v5/groups`
- Auth: `x-access-key`, `x-access-secret`
- Params: `limit` (query, 선택)

예제 요청:
```
GET /open/v5/groups
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "groups": [
    { "id": "g_1", "name": "<group>" }
  ]
}
```

개인정보: pii_fields 없음. 그룹 구조 메타만 다룬다.

---

## openapi.bot.create

**[pinned]** · 방향 W(쓰기, 우리→채널톡)

**무엇** — 봇 생성.
**왜** — 자동화 봇을 프로그램적으로 프로비저닝.

**어떻게**
- Method + Path: `POST /open/v5/bots`
- Auth: `x-access-key`, `x-access-secret`
- Params: 없음

예제 요청:
```
POST /open/v5/bots
x-access-key: <KEY>
x-access-secret: <SECRET>
{"name":"<bot>"}
```

예제 응답:
```json
{
  "bot": { "id": "b_1", "name": "<bot>" }
}
```

개인정보: pii_fields 없음. 봇 메타만 다룬다.

---

## openapi.bot.list

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 봇 목록 조회.
**왜** — 등록된 봇 목록을 운영 콘솔에 표시.

**어떻게**
- Method + Path: `GET /open/v5/bots`
- Auth: `x-access-key`, `x-access-secret`
- Params: `limit` (query, 선택)

예제 요청:
```
GET /open/v5/bots
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "bots": [
    { "id": "b_1", "name": "<bot>" }
  ]
}
```

개인정보: pii_fields 없음. 봇 목록 메타만 다룬다.

---

## openapi.channel.get

**[pinned]** · 방향 R(읽기, 채널톡→우리)

**무엇** — 채널(워크스페이스) 정보 조회.
**왜** — 채널 메타(플랜·설정)를 내부 표시에 활용.

**어떻게**
- Method + Path: `GET /open/v5/channel`
- Auth: `x-access-key`, `x-access-secret`
- Params: 없음

예제 요청:
```
GET /open/v5/channel
x-access-key: <KEY>
x-access-secret: <SECRET>
```

예제 응답:
```json
{
  "channel": { "id": "c_1", "name": "<channel>" }
}
```

개인정보: pii_fields 없음. 채널 메타만 다룬다.

---

## webhook.message.created

**[inferred]** · 방향 CB(콜백, 채널톡→우리) · **문서 검증 필요**

이 항목은 공개 스펙 밖에서 형태를 추론한 것이다. 실제 콜백 페이로드·서명 방식은 채널톡 공식 webhook 문서로 반드시 확인한 뒤 도입한다.

**무엇** — 메시지 생성 webhook 콜백(event: `message.created`).
**왜** — 상담 메시지 발생을 실시간 수신(서명 검증 필수, 본문 마스킹).

**어떻게**
- Method + Path: `POST (구독자 콜백 URL)`
- Auth: `x-signature (HMAC)`
- Params: 없음

예제 요청(수신):
```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"message","entity":{...}}
```

예제 페이로드:
```json
{
  "type": "message",
  "entity": {
    "id": "m_1",
    "chatId": "uc_1",
    "plainText": "<PII:plainText>"
  }
}
```

**개인정보 주의** (pii_fields: entity.plainText / policy_flag: `mask_inbound`)
- 방향 CB: 수신 요청은 **x-signature HMAC 서명 검증 필수**다. 서명이 유효하지 않은 콜백은 폐기한다.
- `entity.plainText`에 고객 개인정보가 혼입될 수 있다. `mask_inbound` — 수신 본문은 **마스킹**해 저장·처리한다.

---

## webhook.userchat.opened

**[inferred]** · 방향 CB(콜백, 채널톡→우리) · **문서 검증 필요**

이 항목은 공개 스펙 밖에서 형태를 추론한 것이다. 실제 콜백 페이로드·서명 방식은 채널톡 공식 webhook 문서로 반드시 확인한 뒤 도입한다.

**무엇** — 상담 오픈 webhook 콜백(event: `userChat.opened`).
**왜** — 상담 시작 이벤트를 실시간 수신해 내부 워크플로 트리거(서명 검증 필수).

**어떻게**
- Method + Path: `POST (구독자 콜백 URL)`
- Auth: `x-signature (HMAC)`
- Params: 없음

예제 요청(수신):
```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"userChat","entity":{...}}
```

예제 페이로드:
```json
{
  "type": "userChat",
  "entity": { "id": "uc_1", "state": "opened" }
}
```

**개인정보 주의** (pii_fields 없음)
- 방향 CB: 수신 요청은 **x-signature HMAC 서명 검증 필수**다. 서명이 유효하지 않은 콜백은 폐기한다. 이 이벤트 페이로드는 PII 필드를 포함하지 않지만, 서명 검증은 방향 CB의 무조건 요건이다.

---

## webhook.user.created

**[inferred]** · 방향 CB(콜백, 채널톡→우리) · **문서 검증 필요**

이 항목은 공개 스펙 밖에서 형태를 추론한 것이다. 실제 콜백 페이로드·서명 방식은 채널톡 공식 webhook 문서로 반드시 확인한 뒤 도입한다.

**무엇** — 유저 생성 webhook 콜백(event: `user.created`).
**왜** — 신규 고객 생성을 실시간 수신(서명 검증 필수, 유입 PII 마스킹).

**어떻게**
- Method + Path: `POST (구독자 콜백 URL)`
- Auth: `x-signature (HMAC)`
- Params: 없음

예제 요청(수신):
```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"user","entity":{...}}
```

예제 페이로드:
```json
{
  "type": "user",
  "entity": {
    "id": "u_1",
    "name": "<PII:name>",
    "email": "<PII:email>",
    "mobileNumber": "<PII:mobile>"
  }
}
```

**개인정보 주의** (pii_fields: entity.name, entity.email, entity.mobileNumber / policy_flag: `mask_inbound`)
- 방향 CB: 수신 요청은 **x-signature HMAC 서명 검증 필수**다. 서명이 유효하지 않은 콜백은 폐기한다.
- 유입 페이로드에 이름·이메일·연락처가 들어온다. `mask_inbound` — 수신 PII는 **마스킹**해 저장·처리한다.

---

## 커버 요약

pinned 카탈로그 21건 전수 문서화 완료. PII 포함 8건은 방향별(R 마스킹 / W 동의·위탁 / CB 서명검증+마스킹) 주의 명시. `openapi.user.upsert`는 `hold_pii_transmit` — 도입 보류 권고. inferred 3건(webhook.*)은 "문서 검증 필요" 명시. 예제의 키·시크릿·서명·개인정보는 모두 플레이스홀더(`<KEY>`·`<SECRET>`·`<SIGNATURE>`·`<PII:*>`)로 유지.
