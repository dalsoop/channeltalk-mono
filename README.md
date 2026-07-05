# channeltalk-mono

> **AI 에이전트가 굴리는 모노레포.** 사람은 "무엇을" 원하는지 말하고, 에이전트가 `maker→checker`
> 루프로 구현·검증하고, `Issue → PR → Review → 사람 승인 → Merge` 로만 출하한다.
> 이 문서는 이 작업 체계를 **처음 보는 사람**을 위한 안내서다.

---

## 1. 한눈에 — 이게 뭔가요?

이 저장소는 "채널톡 연동 리서처"라는 결과물을 만드는 공간이자, 동시에 **그 결과물을 AI 에이전트로
만들어 가는 방식 자체**를 담은 곳이다. 두 가지를 같이 본다:

- **결과물(도메인)** — 한 고객사의 기존 채널톡 연동 대비 *새로 생긴 Open API 기능* 을 PII 안전하게
  매뉴얼로 뽑는 시스템. 설계 정본은 [`CHANNELTALK.md`](CHANNELTALK.md).
- **작업 체계(메타)** — 사람이 코드를 직접 치기보다, **역할이 분리된 AI 에이전트들**(만드는 maker /
  검사하는 checker)이 루프를 돌아 만들고, 출하는 사람 승인을 거친다. 이 문서가 다루는 게 이쪽이다.

핵심 철학 한 줄: **"만드는 놈과 검사하는 놈은 다른 놈이다"(maker ≠ checker)**, 그리고
**"검증 안 된 건 출하하지 않는다"**.

### AGENTS.md 우선주의

에이전트는 매 세션 `AGENTS.md` 를 **항상** 읽는다(시스템 프롬프트에 상주). 스킬처럼 "지금 찾아볼까"
망설이는 마찰이 없어서, 규칙·인덱스는 스킬보다 `AGENTS.md` 에 둔다(근거: Vercel "AGENTS.md
outperforms skills" — passive context 100% vs skills 53~79%). 그래서 각 폴더의 `AGENTS.md` 가
그 폴더의 규칙 정본이고, 가까운 `AGENTS.md` 가 상위를 override 한다.

---

## 2. 저장소 구조

```
channeltalk-mono/            ← 저장소 루트 (아래가 전부 루트 직속)
├── README.md            ← (이 문서) 작업 체계 안내
├── AGENTS.md            ← 이 저장소의 규칙 정본 (에이전트가 매 세션 읽음)
├── CHANNELTALK.md       ← 도메인 설계 정본 (데이터 계약·게이트·PII·제출)
├── .env.local           ← 로컬 비밀값 (gitignore, 절대 커밋 안 함 — §5)
├── .claude/
│   ├── agents/          ← AI 업무 역할 정의 (git-flow, pr-reviewer …)
│   └── settings.json    ← 로그 훅 (세션 종료 시 대화를 logs/ 로 저장)
├── tools/               ← 저장소 운영 스크립트 (봇 토큰 발급·로그 저장)
├── logs/                ← AI 대화 로그 (무편집 보관)
└── apps/                ← ★ 역할별로 나뉜 앱들 — 실제 작업 파일 (§6)
```

### 로컬 체크아웃은 bare + worktree

위 구조가 **저장소(= GitHub) 기준 경로**다 — `apps/`·`tools/`·`AGENTS.md` 가 전부 루트 직속이고,
이 문서 안의 링크·경로도 그 루트 기준으로 쓴다(`apps/foo`, `main/apps/foo` 아님).

로컬에서는 이 워크스페이스가 저장소를 **bare + git worktree** 로 받는다. 본판 작업 트리가
`channeltalk-mono/main/` 에 체크아웃돼 있어 디스크에선 `channeltalk-mono/main/apps/<app>/` 로
보이지만, 그 `main/` 은 **로컬 체크아웃 위치일 뿐 저장소 트리의 일부가 아니다**(커밋되는 경로엔
`main/` 이 없다). 병렬로 다른 작업을 격리할 땐 형제 worktree 를 따로 만든다(예: 실험용 브랜치를
별도 트리에서).

같은 트리를 여러 세션이 동시에 만질 수 있으므로 커밋은 **명시 경로만** 한다
(`git add -A`·`git commit -a` 금지 — 남의 변경분을 쓸어담지 않기 위해).

---

## 3. 핵심 개념 — 에이전트 루프 (maker → checker)

이 저장소의 모든 실질 작업은 **루프**로 굴러간다. 단발로 "한 방에 만들고 끝"이 아니라,
`만들고 → 검사하고 → 고치고 → 통과할 때까지 반복`이다.

```
        ┌─────────── 루프 ───────────┐
  요청 → │ maker: 만든다               │
        │   ↓                         │
        │ checker: 신선한 눈으로 채점  │ ── 통과? ──▶ 게이트 → 출하
        │   ↓ (미달)                  │
        │ maker: 지적만 고친다 ────────┘
        └─────────────────────────────┘
```

세 가지 규칙이 이 루프를 신뢰 가능하게 만든다:

1. **maker ≠ checker** — 만든 에이전트가 자기 걸 채점하지 않는다. **다른(신선한)** 에이전트가
   받은 결과물을 새로 읽어 채점한다. 자화자찬을 구조적으로 차단한다.
2. **검증 게이트** — "그럴듯함"으로 통과 못 한다. 의미 점수(리뷰 에이전트) **와** 실측
   (`node --check`·테스트 green·스키마 `JSON.parse`) **둘 다** 통과해야 출하 후보가 된다.
3. **정직** — 안 돌린 검사를 돌린 척하지 않는다. mock 은 `mock`/`inferred` 로 표기하고
   `verified-live` 로 단정하지 않는다. 실토큰이 예제에 새면 secret 게이트가 잡는다.

> 실제로 이 루프를 돌리는 방법은 여러 결이 있다 — 결정적 워크플로(코드가 라운드를 돈다),
> `agent-loop`·`app-quality-loop` 같은 스킬, 그리고 아래 **agent-factory** 가 "루프까지 포함된
> 에이전트 팀"을 통째로 찍어내는 방식. 새 자동화를 만들 땐 손으로 에이전트를 쓰지 말고
> agent-factory 로 뽑는 걸 우선한다. → [`apps/agent-factory/README.md`](apps/agent-factory/README.md)

---

## 4. 실제 작업 흐름 — 요청에서 출하까지

한 번의 변경이 실제로 어떻게 흘러가는지(이 저장소가 실제로 굴러온 방식 그대로):

```
사람: "이거 해줘"
  │
  1. 이슈화        gh issue create  ─ 무엇을·왜를 먼저 못박는다
  2. 브랜치        git switch -c <type>/<slug>   (main 직접 작업 금지)
  3. maker 구현    명시 경로만 커밋 (관용 메시지 + Co-Authored-By)
  4. 검증          node --check · test/run.mjs green · 게이트 통과분만
  5. PR            gh pr create (Closes #N) — PR 본문에 검증 결과 명시
  6. Review        pr-reviewer(신선 checker)가 diff 를 5렌즈로 채점해 gh pr review 게시
  7. 사람 승인     ★ 머지는 사람 게이트 — approve ≥ 1 필수
  8. Merge         승인 후에만
```

### 출하 규칙 (중요 — 우회 없음)

- 🚫 `main` 직접 push·commit·머지. 🚫 에이전트 자동 머지·자동 approve.
- **머지는 언제나 사람 게이트다.** `main` 은 branch protection 으로 강제된다
  (`required_approving_review_count: 1` + PR 필수).
- PR 이 리뷰 대기로 막혀도(`REVIEW_REQUIRED`) **우회하지 않는다** — `--admin`·protection 토글·
  직접 push 금지. 막히면 멈추고 "승인 필요"를 보고하고 사람 판단에 넘긴다.

### 봇 작성(정상 경로)

혼자 쓰는(solo) 계정은 **자기 PR 을 자기가 승인하지 못한다**(GitHub 규칙). 그래서 git-flow 는 PR 을
**GitHub App 봇**(`channeltalk-mono-bot[bot]`)으로 올린다 → 작성자 ≠ 사람 → **사람이 approve 하고
머지**할 수 있다. 봇 토큰은 [`tools/mint_bot_token.mjs`](tools/mint_bot_token.mjs) 가 `~/.env` 의
`GH_APP_*` 로 발급한다. 이게 "우회 없이도 solo 가 리뷰 게이트를 지키는" 장치다.

> AI 업무 역할은 [`.claude/agents/`](.claude/agents/) 에 정의돼 있다 —
> **git-flow**(출하: 이슈·브랜치·커밋·PR·리뷰 위임, 머지는 안 함),
> **pr-reviewer**(신선 리뷰 checker: approve/request_changes 만, 머지 안 함).

---

## 5. `.env.local` — 왜 필요한가

**비밀값은 코드에 넣지 않는다.** 실 API 키·토큰은 저장소에 절대 커밋하지 않고, **로컬에만 있는
untracked 파일**에 둔다. 그게 `.env.local` 이다.

- `.gitignore` 가 `.env` / `.env.*` 를 전부 무시한다(예외: `.env.example` 만 허용). 그래서
  `.env.local` 은 **git 에 올라가지 않는다** — 실수로도.
- 지금 담기는 값: 채널톡 실 자격증명(`CHANNEL_TALK_PLUGIN_KEY`, `CHANNEL_TALK_ACCESS_SECRET`).
  코어 루프 자체는 오프라인·결정적(mock/pin 만 읽음)이라 없어도 돌지만, 실 연동·검증엔 필요하다.
- PR 봇 토큰 같은 계정 단위 비밀값은 저장소가 아니라 **`~/.env`**(`GH_APP_*`)에 둔다.

이건 취향이 아니라 이 저장소의 보안 규율과 한 몸이다 — 예제에 실토큰이 새면 secret 게이트가
빌드를 떨어뜨리고, provenance 는 `verified-live` 로 지어내지 않는다. **비밀은 로컬, 코드는 공개**.

새로 셋업한다면: `.env.local` 을 직접 만들어 위 키를 채운다(값은 안전한 경로로 받는다). 커밋되지
않으니 각자 로컬에 둔다.

---

## 6. `apps/` — 왜 이렇게 나눴나

`apps/` 는 도구 하나하나가 아니라 **역할(책임) 단위로** 쪼개져 있다. 이유는 §3 의 maker≠checker
철학을 **앱 수준으로 확장**한 것이다 — 한 앱은 한 가지 책임만 지고, 만드는 쪽과 검증하는 쪽이
섞이지 않게 한다.

나뉘는 결(구체 도구 이름은 유동적이라 생략 — 각 앱의 `AGENTS.md` 를 보라):

- **엔진/모킹** — 순수 함수(diff·게이트·PII 판정)와 SSOT 표면(mock/pin). 네트워크·랜덤 없이 결정적.
- **루프/검증** — maker→checker 실행부와 결정적 verify 스크립트, 뎁스 누적.
- **조립/제출** — 위 조각들을 하나의 제출 트리로 패키징.
- **심사** — 제출물을 신선한 눈으로 채점.
- **agent-factory** — 위 앱들이 재사용하는 **루프 엔진(방법론)**. "에이전트를 만드는 에이전트."

> 각 앱의 규칙·인덱스는 그 앱의 `AGENTS.md` 가 정본이다. 도구 목록은 바뀌므로 여기 나열하지 않는다.
> **`agent-factory` 만은** 재사용 진입점이라 별도 사용법을 둔다 →
> [`apps/agent-factory/README.md`](apps/agent-factory/README.md).

---

## 7. 더 읽기

| 무엇 | 어디 |
|---|---|
| 이 저장소 규칙 정본 (git 흐름·구현 규약·인덱스) | [`AGENTS.md`](AGENTS.md) |
| 도메인 설계 정본 (데이터 계약·게이트·PII·제출) | [`CHANNELTALK.md`](CHANNELTALK.md) |
| 에이전트 루프 엔진(방법론) 사용법 | [`apps/agent-factory/README.md`](apps/agent-factory/README.md) |
| 각 앱의 규칙·인덱스 | `apps/<app>/AGENTS.md` |
| AI 업무 역할(출하·리뷰) | [`.claude/agents/`](.claude/agents/) |

---

*이 저장소는 "AI 가 만든 걸 AI 가(그리고 마지막엔 사람이) 검증한다"는 원칙 위에 서 있다.
막히면 우회하지 말고, 검증 안 된 건 출하하지 말 것 — 그게 전부다.*
