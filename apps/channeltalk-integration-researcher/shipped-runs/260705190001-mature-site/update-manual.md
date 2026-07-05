# 채널톡 연동 업데이트 매뉴얼 — mature-site

이미 붙인 v1 코어 7개 대비 **신규 delta 14건만** 다룬다(baseline v1 → surface v5). 코어 7개(예: `openapi.user.get`, `openapi.userchat.list`, `openapi.message.send` 등)는 이 문서에 다시 쓰지 않는다.

## 이 문서를 읽는 법

- **표면 provenance는 이제 `pinned` 또는 `inferred`다(더는 `mock` 아님).**
  - `pinned`: 공개 swagger 스냅샷과 **해시 고정 일치**(published swagger.json@57249a6, Channel Open API v28.0.3, `sha256:57249a6c…f9f1a4`). **라이브 호출로 확인한 것은 아니다** — 스펙 스냅샷 일치까지만 보증한다.
  - `inferred`: webhook 콜백(공개 스펙 밖에서 형태 추론). **연동 전 실제 페이로드로 문서 검증 필요.**
- **인증(공통, OpenAPI 11건)**: `x-access-key: <KEY>` / `x-access-secret: <SECRET>` 헤더. **webhook 3건은 `x-signature`(HMAC) 서명 검증**을 대신 쓴다.
- **베이스 URL**: `https://api.channel.io/open/v5`
- **예제의 `<KEY>`·`<SECRET>`·`<SIGNATURE>`·`<PII:*>`·`<...>`는 플레이스홀더다. 실제 키·실제 개인정보를 넣지 않는다.**
- **방향(dir)** 표기: `R`=읽기(채널톡→우리), `W`=쓰기(우리→채널톡), `CB`=webhook 콜백(채널톡→우리).
- **정책(profile.pii_policy = `consent`)**: 전송형(W) PII 기능은 **수집·이용 동의 범위·위탁/제3자 제공 검토를 강제**한다. 이번 delta에 `hold_pii_transmit`/`mask_inbound` policy_flag가 걸린 기능은 없다(policy_hold=0).

카운트(근거 changes.json): surface 21 · 기연동 7 · **신규 14** · 신규 중 PII 포함 5 · inferred 3 · policy_hold 0.

---

## User

### 1. `openapi.user.upsert` — 유저 프로필 생성·갱신

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W** · 🔒 **PII 포함**

- **무엇**: 유저(고객) 프로필을 생성·갱신한다.
- **왜**: 회원정보를 상담원이 보게 동기화(단, 개인정보 외부 전송 — 동의·위탁 검토).

**어떻게**
- **method + path**: `PATCH /open/v5/users/{userId}` (PUT 아님)
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `userId` (path, required)
- **예제 요청**
  ```
  PATCH /open/v5/users/{userId}
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  {"profile":{"name":"<PII:name>","email":"<PII:email>"}}
  ```
- **예제 응답**
  ```json
  { "user": { "id": "u_1", "name": "<PII:name>", "email": "<PII:email>" } }
  ```

**개인정보 주의 (W — 우리→채널톡)**
PII 필드: `name`, `email`, `mobileNumber`, `profile`. 이 요청은 **개인정보를 채널톡으로 외부 전송**한다. 전송 전 **수집·이용 동의 범위**를 확인하고, **위탁/제3자 제공 검토**를 마쳐야 한다. 동의 범위를 벗어난 필드는 담지 않는다. 예제는 반드시 플레이스홀더(`<PII:*>`)로만 둔다.

---

### 2. `openapi.user.delete` — 유저 삭제

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W**

- **무엇**: 유저를 삭제한다.
- **왜**: 탈퇴 회원의 채널톡 프로필 정리(보관기간·파기 정책 연계).

**어떻게**
- **method + path**: `DELETE /open/v5/users/{userId}`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `userId` (path, required)
- **예제 요청**
  ```
  DELETE /open/v5/users/{userId}
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "deleted": true }
  ```

**개인정보 주의 (W — 우리→채널톡)**
요청 본문에 직접 PII를 싣지는 않지만(`pii_fields` 없음), **삭제는 파기 처리**다. 내부 **보관기간·파기 정책**과 연계해 실행하고, 되돌릴 수 없으므로 대상 `userId` 검증 후 호출한다.

---

## Event

### 3. `openapi.user.event.create` — 유저 이벤트 기록

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W** · 🔒 **PII 포함**

- **무엇**: 유저의 행동 이벤트를 기록한다.
- **왜**: 행동 이벤트로 세그먼트·자동화 트리거(속성에 개인정보 혼입 주의).

**어떻게**
- **method + path**: `POST /open/v5/users/{userId}/events`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `userId` (path, required)
- **예제 요청**
  ```
  POST /open/v5/users/{userId}/events
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  {"name":"<event>","property":{"<key>":"<value>"}}
  ```
- **예제 응답**
  ```json
  { "event": { "id": "ev_1", "name": "<event>" } }
  ```

**개인정보 주의 (W — 우리→채널톡)**
PII 필드: `property`. 이벤트 **속성(property)에 개인정보가 혼입되기 쉽다**(이름·연락처·주소 등). 속성은 **개인정보를 넣지 않는 것을 원칙**으로 하고, 불가피하면 **개인정보 외부 전송으로 보고 동의 범위·위탁/제3자 제공을 검토**한다. 예제 값은 플레이스홀더로만 둔다.

---

## UserChat

### 4. `openapi.user.userchats.create` — 유저 대상 상담 생성

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W**

- **무엇**: 특정 유저를 대상으로 상담(유저챗)을 생성한다.
- **왜**: 서비스 이벤트에서 능동적으로 상담 세션을 연다.

**어떻게**
- **method + path**: `POST /open/v5/users/{userId}/user-chats`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `userId` (path, required)
- **예제 요청**
  ```
  POST /open/v5/users/{userId}/user-chats
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "userChat": { "id": "uc_2", "state": "opened" } }
  ```

개인정보: 이 요청은 PII 필드가 없다(`pii_fields` 없음). 상담 본문·프로필을 직접 전송하지 않으므로 별도 방향별 PII 주의는 불필요하나, 후속 메시지 발신 시 본문에 개인정보를 넣지 않는다.

---

### 5. `openapi.userchat.sessions.list` — 상담 세션 목록 조회

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **R**

- **무엇**: 한 상담(유저챗)의 세션 목록을 조회한다.
- **왜**: 상담 참여 세션(읽음·참여 상태)을 추적한다.

**어떻게**
- **method + path**: `GET /open/v5/user-chats/{userChatId}/sessions`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `userChatId` (path, required)
- **예제 요청**
  ```
  GET /open/v5/user-chats/{userChatId}/sessions
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "sessions": [ { "id": "s_1", "personType": "user" } ] }
  ```

개인정보: 응답에 PII 필드가 없다(`pii_fields` 없음). 다만 R(읽기)의 일반 원칙대로 **필요한 필드만 요청·내부 화면 노출을 최소화**한다.

---

## Message

### 6. `openapi.group.message.send` — 그룹에 메시지 발신

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W**

- **무엇**: 팀 그룹 채널에 메시지를 발신한다.
- **왜**: 팀 그룹 채널에 내부 알림·운영 메시지 발신.

**어떻게**
- **method + path**: `POST /open/v5/groups/{groupId}/messages`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `groupId` (path, required)
- **예제 요청**
  ```
  POST /open/v5/groups/{groupId}/messages
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  {"blocks":[{"type":"text","value":"<message>"}]}
  ```
- **예제 응답**
  ```json
  { "message": { "id": "gm_1", "groupId": "g_1" } }
  ```

**개인정보 주의 (W — 우리→채널톡)**
PII 필드는 없다(`pii_fields` 없음). 그래도 우리→채널톡 발신이므로 **메시지 본문에 고객 개인정보를 넣지 않는다**(운영 알림 목적에 한정).

---

## Manager

### 7. `openapi.manager.get` — 단일 매니저(상담원) 조회

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **R** · 🔒 **PII 포함**

- **무엇**: 특정 매니저(상담원) 정보를 조회한다.
- **왜**: 특정 상담원 정보를 서비스 화면에 표시(개인정보 최소 노출).

**어떻게**
- **method + path**: `GET /open/v5/managers/{managerId}`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `managerId` (path, required)
- **예제 요청**
  ```
  GET /open/v5/managers/{managerId}
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "manager": { "id": "mgr_1", "name": "<PII:name>", "email": "<PII:email>" } }
  ```

**개인정보 주의 (R — 채널톡→우리)**
PII 필드: `name`, `email`. **상담원 이름·이메일도 개인정보**다. **필요한 필드만 요청**하고, **내부 화면 노출을 최소화**하며, 저장·표시 시 **마스킹**한다.

---

## Group

### 8. `openapi.group.list` — 그룹 목록 조회

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **R**

- **무엇**: 그룹 목록을 조회한다.
- **왜**: 팀 그룹 구조를 내부 라우팅에 연동.

**어떻게**
- **method + path**: `GET /open/v5/groups`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `limit` (query, optional)
- **예제 요청**
  ```
  GET /open/v5/groups
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "groups": [ { "id": "g_1", "name": "<group>" } ] }
  ```

개인정보: 응답에 PII 필드가 없다(`pii_fields` 없음). R(읽기) 일반 원칙대로 **필요한 필드만 요청**한다.

---

## Bot

### 9. `openapi.bot.create` — 봇 생성

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **W**

- **무엇**: 봇을 생성한다.
- **왜**: 자동화 봇을 프로그램적으로 프로비저닝.

**어떻게**
- **method + path**: `POST /open/v5/bots`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: 없음
- **예제 요청**
  ```
  POST /open/v5/bots
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  {"name":"<bot>"}
  ```
- **예제 응답**
  ```json
  { "bot": { "id": "b_1", "name": "<bot>" } }
  ```

개인정보: PII 필드가 없다(`pii_fields` 없음). 봇 이름 등 설정값에 고객 개인정보를 넣지 않는다.

---

### 10. `openapi.bot.list` — 봇 목록 조회

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **R**

- **무엇**: 봇 목록을 조회한다.
- **왜**: 등록된 봇 목록을 운영 콘솔에 표시.

**어떻게**
- **method + path**: `GET /open/v5/bots`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: `limit` (query, optional)
- **예제 요청**
  ```
  GET /open/v5/bots
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "bots": [ { "id": "b_1", "name": "<bot>" } ] }
  ```

개인정보: 응답에 PII 필드가 없다(`pii_fields` 없음).

---

## Channel

### 11. `openapi.channel.get` — 채널(워크스페이스) 정보 조회

**provenance: `pinned`** (swagger 스냅샷 해시 일치, 라이브 확인 아님) · dir: **R**

- **무엇**: 채널(워크스페이스) 메타 정보를 조회한다.
- **왜**: 채널 메타(플랜·설정)를 내부 표시에 활용.

**어떻게**
- **method + path**: `GET /open/v5/channel`
- **auth**: `x-access-key`, `x-access-secret`
- **params**: 없음
- **예제 요청**
  ```
  GET /open/v5/channel
  x-access-key: <KEY>
  x-access-secret: <SECRET>
  ```
- **예제 응답**
  ```json
  { "channel": { "id": "c_1", "name": "<channel>" } }
  ```

개인정보: 응답에 PII 필드가 없다(`pii_fields` 없음).

---

## Webhook (콜백 — 형태 추론)

> 아래 3건은 **provenance `inferred`**다. 공개 swagger 스펙 밖에서 페이로드 형태를 추론한 것이므로 **연동 전 실제 콜백 페이로드로 문서 검증이 필요**하다. 세 건 모두 **`x-signature`(HMAC) 서명 검증이 필수**다(미검증 수신 처리 금지).

### 12. `webhook.message.created` — 메시지 생성 콜백

**provenance: `inferred`** (문서 검증 필요) · dir: **CB** · 🔒 **PII 포함** · event: `message.created`

- **무엇**: 상담 메시지 생성 이벤트를 실시간 수신하는 webhook 콜백.
- **왜**: 상담 메시지 발생을 실시간 수신(서명 검증 필수, 본문 마스킹).

**어떻게**
- **method + path**: `POST (구독자 콜백 URL)`
- **auth**: `x-signature (HMAC)`
- **params**: 없음
- **예제 요청**
  ```
  POST <구독자 콜백 URL>
  x-signature: <SIGNATURE>
  {"type":"message","entity":{...}}
  ```
- **예제 응답(수신 페이로드)**
  ```json
  { "type": "message", "entity": { "id": "m_1", "chatId": "uc_1", "plainText": "<PII:plainText>" } }
  ```

**개인정보 주의 (CB — 채널톡→우리)**
PII 필드: `entity.plainText`. **`x-signature`(HMAC) 서명 검증을 먼저 통과한 요청만 처리**한다. 수신 본문 `plainText`는 **개인정보가 혼입된 상담 본문**이므로 저장·로그·화면 표시 시 **마스킹**한다.

---

### 13. `webhook.userchat.opened` — 상담 오픈 콜백

**provenance: `inferred`** (문서 검증 필요) · dir: **CB** · event: `userChat.opened`

- **무엇**: 상담(유저챗) 오픈 이벤트를 실시간 수신하는 webhook 콜백.
- **왜**: 상담 시작 이벤트를 실시간 수신해 내부 워크플로 트리거(서명 검증 필수).

**어떻게**
- **method + path**: `POST (구독자 콜백 URL)`
- **auth**: `x-signature (HMAC)`
- **params**: 없음
- **예제 요청**
  ```
  POST <구독자 콜백 URL>
  x-signature: <SIGNATURE>
  {"type":"userChat","entity":{...}}
  ```
- **예제 응답(수신 페이로드)**
  ```json
  { "type": "userChat", "entity": { "id": "uc_1", "state": "opened" } }
  ```

**개인정보 주의 (CB — 채널톡→우리)**
PII 필드는 없다(`pii_fields` 없음). 그래도 webhook이므로 **`x-signature`(HMAC) 서명 검증을 먼저 통과한 요청만 처리**한다(위조 콜백 차단).

---

### 14. `webhook.user.created` — 유저 생성 콜백

**provenance: `inferred`** (문서 검증 필요) · dir: **CB** · 🔒 **PII 포함** · event: `user.created`

- **무엇**: 신규 유저(고객) 생성 이벤트를 실시간 수신하는 webhook 콜백.
- **왜**: 신규 고객 생성을 실시간 수신(서명 검증 필수, 유입 PII 마스킹).

**어떻게**
- **method + path**: `POST (구독자 콜백 URL)`
- **auth**: `x-signature (HMAC)`
- **params**: 없음
- **예제 요청**
  ```
  POST <구독자 콜백 URL>
  x-signature: <SIGNATURE>
  {"type":"user","entity":{...}}
  ```
- **예제 응답(수신 페이로드)**
  ```json
  { "type": "user", "entity": { "id": "u_1", "name": "<PII:name>", "email": "<PII:email>", "mobileNumber": "<PII:mobile>" } }
  ```

**개인정보 주의 (CB — 채널톡→우리)**
PII 필드: `entity.name`, `entity.email`, `entity.mobileNumber`. **`x-signature`(HMAC) 서명 검증을 먼저 통과한 요청만 처리**한다. 유입되는 신규 고객 **PII를 저장·로그·화면 표시 시 마스킹**하고, 필요한 필드만 내부에 보관한다.

---

## 부록 — 신규 14건 요약

| # | id | method + path | dir | provenance | PII |
|---|---|---|---|---|---|
| 1 | openapi.user.upsert | PATCH /open/v5/users/{userId} | W | pinned | 🔒 name,email,mobileNumber,profile |
| 2 | openapi.user.delete | DELETE /open/v5/users/{userId} | W | pinned | — |
| 3 | openapi.user.event.create | POST /open/v5/users/{userId}/events | W | pinned | 🔒 property |
| 4 | openapi.user.userchats.create | POST /open/v5/users/{userId}/user-chats | W | pinned | — |
| 5 | openapi.userchat.sessions.list | GET /open/v5/user-chats/{userChatId}/sessions | R | pinned | — |
| 6 | openapi.group.message.send | POST /open/v5/groups/{groupId}/messages | W | pinned | — |
| 7 | openapi.manager.get | GET /open/v5/managers/{managerId} | R | pinned | 🔒 name,email |
| 8 | openapi.group.list | GET /open/v5/groups | R | pinned | — |
| 9 | openapi.bot.create | POST /open/v5/bots | W | pinned | — |
| 10 | openapi.bot.list | GET /open/v5/bots | R | pinned | — |
| 11 | openapi.channel.get | GET /open/v5/channel | R | pinned | — |
| 12 | webhook.message.created | POST (구독자 콜백 URL) | CB | inferred | 🔒 entity.plainText |
| 13 | webhook.userchat.opened | POST (구독자 콜백 URL) | CB | inferred | — |
| 14 | webhook.user.created | POST (구독자 콜백 URL) | CB | inferred | 🔒 entity.name,email,mobileNumber |

- PII 포함: 5건(#1, #3, #7, #12, #14) — changes.json `new_with_pii=5`와 일치.
- inferred: 3건(#12~#14, webhook) — `new_inferred=3`과 일치.
- policy_flag: 전 건 `null`(`policy_hold=0`) — 도입 보류·강제 마스킹 정책 플래그 없음.
- 근거: `changes.json` + `surface.snapshot.json`(이 두 파일 밖 사실은 쓰지 않음).
