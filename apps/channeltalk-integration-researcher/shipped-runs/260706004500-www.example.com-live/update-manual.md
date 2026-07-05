# 채널톡 연동 업데이트 매뉴얼 — www.example.com

이 매뉴얼은 결정적 diff(`changes.json`)와 표면 스냅샷(`surface.snapshot.json`)만을 근거로 작성되었습니다. 표면에 없는 엔드포인트·필드·헤더는 담지 않았습니다.

- 고객: `www.example.com`
- 표면 버전: 5 (baseline 1)
- 스펙 고정: Channel Open API v28.0.3 (swagger.json@57249a6, sha256 `57249a6…f1a4`)
- 기준 URL: `https://api.channel.io/open/v5`
- 신규 기능: 21개 (PII 포함 8개, 정책 보류 1개, 추론(inferred) 3개)
- 프로필 정책: `pii_policy = no-transmit` (개인정보 외부 전송 억제)

## provenance 배지 안내

- **pinned** — 공개 스펙 스냅샷과 해시 고정으로 일치. 단, "라이브 호출 확인"은 아닙니다.
- **inferred** — 스펙 밖(형태 추론). webhook 3종이 이에 해당하며, 도입 전 **⚠️ 문서 검증 필요**.

## 공통 인증 헤더 (Open API)

모든 Open API 호출은 아래 두 헤더를 사용합니다. 예제의 키 값은 **반드시 플레이스홀더** `<KEY>` · `<SECRET>` 로만 표기하며, 실제 키를 절대 넣지 않습니다.

```
x-access-key: <KEY>
x-access-secret: <SECRET>
```

webhook(CB) 콜백은 별도로 `x-signature (HMAC)` 서명 헤더를 사용합니다(해당 섹션 참고).

---

# User

## openapi.user.get

**provenance:** `pinned`

**무엇/왜** — 단일 유저(고객)를 조회합니다. 채널톡 고객 프로필을 서비스 계정과 매핑하는 데 사용합니다.

**어떻게**
- `GET /open/v5/users/{userId}`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
GET /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예 (개인정보 필드는 플레이스홀더):

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

**개인정보 주의** (dir: R / 읽기, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `name`, `email`, `mobileNumber`, `avatarUrl`, `profile`
- 읽기(수신) 방향이므로 **필요한 최소 필드만 요청**하고, 화면 노출을 최소화하며 저장·표시 시 **마스킹**합니다.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

## openapi.user.upsert

**provenance:** `pinned`

**무엇/왜** — 유저 프로필을 생성·갱신합니다. 회원정보를 상담원이 보게 동기화하지만, **개인정보를 외부(채널톡)로 전송**하는 쓰기 동작입니다. 동의·위탁 검토가 필요합니다.

**어떻게**
- `PATCH /open/v5/users/{userId}`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
PATCH /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
{"profile":{"name":"<PII:name>","email":"<PII:email>"}}
```

응답 예:

```json
{ "user": { "id": "u_1", "name": "<PII:name>", "email": "<PII:email>" } }
```

**개인정보 주의** (dir: W / 쓰기, `has_pii=true`, `policy_flag=hold_pii_transmit`)
- pii_fields: `name`, `email`, `mobileNumber`, `profile`
- 쓰기(전송) 방향으로 **개인정보를 외부로 전송**합니다. 수집·이용 **동의** 범위와 위탁/제3자 제공 여부를 반드시 검토하세요.
- 이 고객 프로필은 `pii_policy=no-transmit`이며 `policy_flag=hold_pii_transmit`입니다 → **도입 보류 권고**. 개인정보 전송이 동의·위탁 검토로 정당화되기 전에는 활성화하지 마세요.

## openapi.user.delete

**provenance:** `pinned`

**무엇/왜** — 유저를 삭제합니다. 탈퇴 회원의 채널톡 프로필 정리에 사용하며, 보관기간·파기 정책과 연계합니다.

**어떻게**
- `DELETE /open/v5/users/{userId}`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
DELETE /open/v5/users/{userId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "deleted": true }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음. 다만 삭제 동작은 개인정보 파기와 직결되므로 보관기간·파기 정책과 연계해 운영하세요.

---

# Event

## openapi.user.event.create

**provenance:** `pinned`

**무엇/왜** — 유저 이벤트를 기록합니다. 행동 이벤트로 세그먼트·자동화를 트리거합니다.

**어떻게**
- `POST /open/v5/users/{userId}/events`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
POST /open/v5/users/{userId}/events
x-access-key: <KEY>
x-access-secret: <SECRET>
{"name":"<event>","property":{"<key>":"<value>"}}
```

응답 예:

```json
{ "event": { "id": "ev_1", "name": "<event>" } }
```

**개인정보 주의** (dir: W / 쓰기, `has_pii=true`)
- pii_fields: `property`
- 쓰기(전송) 방향입니다. `property`에 **개인정보가 혼입**되지 않도록 주의하고, 개인정보가 담긴다면 수집·이용 **동의** 범위와 위탁/제3자 제공을 검토하세요. 이벤트 속성에는 개인정보를 넣지 않는 것을 권장합니다.

---

# UserChat

## openapi.userchat.list

**provenance:** `pinned`

**무엇/왜** — 상담(유저챗) 목록을 조회합니다. 진행 중/종료 상담 목록을 내부 대시보드에 집계합니다.

**어떻게**
- `GET /open/v5/user-chats`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `state` (query, 선택), `sortOrder` (query, 선택), `limit` (query, 선택)

```
GET /open/v5/user-chats?state=opened&limit=100
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "userChats": [ { "id": "uc_1", "state": "opened" } ] }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

## openapi.userchat.get

**provenance:** `pinned`

**무엇/왜** — 단일 상담(유저챗)을 조회합니다. 특정 상담의 상태·메타를 내부 로직에서 참조합니다.

**어떻게**
- `GET /open/v5/user-chats/{userChatId}`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userChatId` (path, 필수)

```
GET /open/v5/user-chats/{userChatId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "userChat": { "id": "uc_1", "state": "opened" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

## openapi.user.userchats.list

**provenance:** `pinned`

**무엇/왜** — 유저별 상담 목록을 조회합니다. 한 고객의 상담 이력을 서비스 화면에 연결합니다.

**어떻게**
- `GET /open/v5/users/{userId}/user-chats`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
GET /open/v5/users/{userId}/user-chats
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "userChats": [ { "id": "uc_1", "state": "closed" } ] }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

## openapi.user.userchats.create

**provenance:** `pinned`

**무엇/왜** — 유저 대상 상담을 생성합니다. 서비스 이벤트에서 능동적으로 상담 세션을 엽니다.

**어떻게**
- `POST /open/v5/users/{userId}/user-chats`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userId` (path, 필수)

```
POST /open/v5/users/{userId}/user-chats
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "userChat": { "id": "uc_2", "state": "opened" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

## openapi.userchat.sessions.list

**provenance:** `pinned`

**무엇/왜** — 상담 세션 목록을 조회합니다. 상담 참여 세션(읽음·참여 상태)을 추적합니다.

**어떻게**
- `GET /open/v5/user-chats/{userChatId}/sessions`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userChatId` (path, 필수)

```
GET /open/v5/user-chats/{userChatId}/sessions
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "sessions": [ { "id": "s_1", "personType": "user" } ] }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

---

# Message

## openapi.message.list

**provenance:** `pinned`

**무엇/왜** — 상담 메시지 목록을 조회합니다. 상담 본문을 내부 분석/CS에 연동합니다.

**어떻게**
- `GET /open/v5/user-chats/{userChatId}/messages`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userChatId` (path, 필수), `limit` (query, 선택), `since` (query, 선택)

```
GET /open/v5/user-chats/{userChatId}/messages?limit=100
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예 (본문은 플레이스홀더):

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

**개인정보 주의** (dir: R / 읽기, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `plainText`, `files`
- 읽기(수신) 방향이며 상담 **본문에 개인정보가 혼입**될 수 있습니다. 필요한 최소 범위만 요청하고, 화면 노출을 최소화하며 저장·표시 시 **마스킹**하세요.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

## openapi.message.send

**provenance:** `pinned`

**무엇/왜** — 상담에 메시지를 발신합니다. 서비스 로직에서 상담에 자동 응답을 발신합니다.

**어떻게**
- `POST /open/v5/user-chats/{userChatId}/messages`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `userChatId` (path, 필수)

```
POST /open/v5/user-chats/{userChatId}/messages
x-access-key: <KEY>
x-access-secret: <SECRET>
{"blocks":[{"type":"text","value":"<message>"}]}
```

응답 예:

```json
{ "message": { "id": "m_2", "chatId": "uc_1" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음. 발신 본문에는 개인정보를 넣지 마세요.

## openapi.group.message.send

**provenance:** `pinned`

**무엇/왜** — 그룹에 메시지를 발신합니다. 팀 그룹 채널에 내부 알림·운영 메시지를 보냅니다.

**어떻게**
- `POST /open/v5/groups/{groupId}/messages`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `groupId` (path, 필수)

```
POST /open/v5/groups/{groupId}/messages
x-access-key: <KEY>
x-access-secret: <SECRET>
{"blocks":[{"type":"text","value":"<message>"}]}
```

응답 예:

```json
{ "message": { "id": "gm_1", "groupId": "g_1" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

---

# Manager

## openapi.manager.list

**provenance:** `pinned`

**무엇/왜** — 매니저(상담원) 목록을 조회합니다. 상담원 목록을 내부 배정 로직에 연동합니다.

**어떻게**
- `GET /open/v5/managers`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `limit` (query, 선택)

```
GET /open/v5/managers
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예 (개인정보 필드는 플레이스홀더):

```json
{ "managers": [ { "id": "mgr_1", "name": "<PII:name>", "email": "<PII:email>" } ] }
```

**개인정보 주의** (dir: R / 읽기, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `name`, `email`
- 상담원의 이름·이메일도 **개인정보**입니다. 읽기(수신) 방향이므로 필요한 최소 필드만 요청하고 화면 노출을 최소화하며 **마스킹**하세요.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

## openapi.manager.get

**provenance:** `pinned`

**무엇/왜** — 단일 매니저(상담원)를 조회합니다. 특정 상담원 정보를 서비스 화면에 표시합니다(개인정보 최소 노출).

**어떻게**
- `GET /open/v5/managers/{managerId}`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `managerId` (path, 필수)

```
GET /open/v5/managers/{managerId}
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "manager": { "id": "mgr_1", "name": "<PII:name>", "email": "<PII:email>" } }
```

**개인정보 주의** (dir: R / 읽기, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `name`, `email`
- 상담원 이름·이메일은 **개인정보**입니다. 읽기(수신) 방향이므로 최소 필드만 요청하고 화면 노출을 최소화하며 **마스킹**하세요.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

---

# Group

## openapi.group.list

**provenance:** `pinned`

**무엇/왜** — 그룹 목록을 조회합니다. 팀 그룹 구조를 내부 라우팅에 연동합니다.

**어떻게**
- `GET /open/v5/groups`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `limit` (query, 선택)

```
GET /open/v5/groups
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "groups": [ { "id": "g_1", "name": "<group>" } ] }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

---

# Bot

## openapi.bot.create

**provenance:** `pinned`

**무엇/왜** — 봇을 생성합니다. 자동화 봇을 프로그램적으로 프로비저닝합니다.

**어떻게**
- `POST /open/v5/bots`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: 없음

```
POST /open/v5/bots
x-access-key: <KEY>
x-access-secret: <SECRET>
{"name":"<bot>"}
```

응답 예:

```json
{ "bot": { "id": "b_1", "name": "<bot>" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

## openapi.bot.list

**provenance:** `pinned`

**무엇/왜** — 봇 목록을 조회합니다. 등록된 봇 목록을 운영 콘솔에 표시합니다.

**어떻게**
- `GET /open/v5/bots`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: `limit` (query, 선택)

```
GET /open/v5/bots
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "bots": [ { "id": "b_1", "name": "<bot>" } ] }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

---

# Channel

## openapi.channel.get

**provenance:** `pinned`

**무엇/왜** — 채널(워크스페이스) 정보를 조회합니다. 채널 메타(플랜·설정)를 내부 표시에 활용합니다.

**어떻게**
- `GET /open/v5/channel`
- auth 헤더: `x-access-key`, `x-access-secret`
- params: 없음

```
GET /open/v5/channel
x-access-key: <KEY>
x-access-secret: <SECRET>
```

응답 예:

```json
{ "channel": { "id": "c_1", "name": "<channel>" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음.

---

# Webhook

> webhook 3종은 provenance가 모두 `inferred`(스펙 밖 형태 추론)입니다. **⚠️ 문서 검증 필요** — 도입 전 채널톡 공식 webhook 문서로 이벤트·페이로드·서명 방식을 반드시 확인하세요.
>
> 모든 콜백은 구독자 콜백 URL로 `POST` 되며, `x-signature (HMAC)` 서명 헤더를 포함합니다. **서명 검증(HMAC)은 필수**입니다. 예제의 서명 값은 플레이스홀더 `<SIGNATURE>`로만 표기합니다.

## webhook.message.created

**provenance:** `inferred` — **⚠️ 문서 검증 필요**

**무엇/왜** — 상담 메시지 생성(`message.created`) 이벤트를 실시간으로 수신합니다. 상담 메시지 발생을 실시간 수신해 내부 로직에 반영합니다.

**어떻게**
- `POST (구독자 콜백 URL)`
- event: `message.created`
- auth 헤더: `x-signature (HMAC)`
- params: 없음

```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"message","entity":{...}}
```

수신 페이로드 예 (본문은 플레이스홀더):

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

**개인정보 주의** (dir: CB / webhook, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `entity.plainText`
- webhook 수신이므로 **서명 검증(x-signature HMAC)이 필수**입니다. 검증에 실패한 요청은 폐기하세요.
- 수신 **본문(plainText)에 개인정보가 혼입**될 수 있습니다. 저장·로그·표시 시 **마스킹**하세요.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

## webhook.userchat.opened

**provenance:** `inferred` — **⚠️ 문서 검증 필요**

**무엇/왜** — 상담 오픈(`userChat.opened`) 이벤트를 실시간으로 수신합니다. 상담 시작 이벤트를 실시간 수신해 내부 워크플로를 트리거합니다.

**어떻게**
- `POST (구독자 콜백 URL)`
- event: `userChat.opened`
- auth 헤더: `x-signature (HMAC)`
- params: 없음

```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"userChat","entity":{...}}
```

수신 페이로드 예:

```json
{ "type": "userChat", "entity": { "id": "uc_1", "state": "opened" } }
```

**개인정보 주의** — `has_pii=false`, `policy_flag` 없음. 다만 webhook 수신이므로 **서명 검증(x-signature HMAC)은 필수**입니다. 검증에 실패한 요청은 폐기하세요.

## webhook.user.created

**provenance:** `inferred` — **⚠️ 문서 검증 필요**

**무엇/왜** — 유저 생성(`user.created`) 이벤트를 실시간으로 수신합니다. 신규 고객 생성을 실시간 수신합니다.

**어떻게**
- `POST (구독자 콜백 URL)`
- event: `user.created`
- auth 헤더: `x-signature (HMAC)`
- params: 없음

```
POST <구독자 콜백 URL>
x-signature: <SIGNATURE>
{"type":"user","entity":{...}}
```

수신 페이로드 예 (개인정보 필드는 플레이스홀더):

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

**개인정보 주의** (dir: CB / webhook, `has_pii=true`, `policy_flag=mask_inbound`)
- pii_fields: `entity.name`, `entity.email`, `entity.mobileNumber`
- webhook 수신이므로 **서명 검증(x-signature HMAC)이 필수**입니다. 검증에 실패한 요청은 폐기하세요.
- 유입되는 **개인정보(이름·이메일·전화번호)**를 저장·로그·표시 시 **마스킹**하세요.
- `policy_flag=mask_inbound` → **수신 마스킹**을 적용하세요.

---

## 요약 표

| # | id | category | method + path | dir | provenance | PII | policy_flag |
|---|----|----------|---------------|-----|------------|-----|-------------|
| 1 | openapi.user.get | User | GET /open/v5/users/{userId} | R | pinned | 예 | mask_inbound |
| 2 | openapi.user.upsert | User | PATCH /open/v5/users/{userId} | W | pinned | 예 | hold_pii_transmit |
| 3 | openapi.user.delete | User | DELETE /open/v5/users/{userId} | W | pinned | 아니오 | — |
| 4 | openapi.user.event.create | Event | POST /open/v5/users/{userId}/events | W | pinned | 예 | — |
| 5 | openapi.userchat.list | UserChat | GET /open/v5/user-chats | R | pinned | 아니오 | — |
| 6 | openapi.userchat.get | UserChat | GET /open/v5/user-chats/{userChatId} | R | pinned | 아니오 | — |
| 7 | openapi.user.userchats.list | UserChat | GET /open/v5/users/{userId}/user-chats | R | pinned | 아니오 | — |
| 8 | openapi.user.userchats.create | UserChat | POST /open/v5/users/{userId}/user-chats | W | pinned | 아니오 | — |
| 9 | openapi.userchat.sessions.list | UserChat | GET /open/v5/user-chats/{userChatId}/sessions | R | pinned | 아니오 | — |
| 10 | openapi.message.list | Message | GET /open/v5/user-chats/{userChatId}/messages | R | pinned | 예 | mask_inbound |
| 11 | openapi.message.send | Message | POST /open/v5/user-chats/{userChatId}/messages | W | pinned | 아니오 | — |
| 12 | openapi.group.message.send | Message | POST /open/v5/groups/{groupId}/messages | W | pinned | 아니오 | — |
| 13 | openapi.manager.list | Manager | GET /open/v5/managers | R | pinned | 예 | mask_inbound |
| 14 | openapi.manager.get | Manager | GET /open/v5/managers/{managerId} | R | pinned | 예 | mask_inbound |
| 15 | openapi.group.list | Group | GET /open/v5/groups | R | pinned | 아니오 | — |
| 16 | openapi.bot.create | Bot | POST /open/v5/bots | W | pinned | 아니오 | — |
| 17 | openapi.bot.list | Bot | GET /open/v5/bots | R | pinned | 아니오 | — |
| 18 | openapi.channel.get | Channel | GET /open/v5/channel | R | pinned | 아니오 | — |
| 19 | webhook.message.created | Webhook | POST (구독자 콜백 URL) | CB | inferred | 예 | mask_inbound |
| 20 | webhook.userchat.opened | Webhook | POST (구독자 콜백 URL) | CB | inferred | 아니오 | — |
| 21 | webhook.user.created | Webhook | POST (구독자 콜백 URL) | CB | inferred | 예 | mask_inbound |
