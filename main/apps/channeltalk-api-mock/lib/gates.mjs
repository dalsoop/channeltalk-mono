// lib/gates.mjs — §5.1 결정적 diff 게이트 4개. 각 순수함수, 반환 { ok, offenders[] }.
// 임계·정규식 상수는 이 모듈 상단 한 곳에만 둔다(매직값 산재 금지).
//
// 1. diffCompleteness    — 표면 = (신규 ∪ 기연동), 누락·초과 없음.
// 2. noFabricatedEndpoint — changes 의 모든 신규 id 가 표면에 실재.
// 3. noSecretInExample   — 예제에 실토큰 없음. 순수 플레이스홀더만 허용.
// 4. everyPiiFlagged     — pii_fields 있는 신규 기능은 has_pii:true.

// 실토큰 판정 임계: 연속 24자 이상의 base64/hex 문자열이면 secret 로 본다(§5.1-3).
export const SECRET_MIN_LEN = 24;

// 24자+ 연속 base64/hex 후보 토큰.
const TOKEN_RE = new RegExp(`[A-Za-z0-9+/=_-]{${SECRET_MIN_LEN},}`, "g");
// hex(16진) 전용 판정.
const HEX_RE = /^[0-9a-fA-F]+$/;
// base64 계열(대소문자·숫자 + / = _ -) 판정.
const BASE64_RE = /^[A-Za-z0-9+/=_-]+$/;

// hex 는 base64 와 대칭 임계(24)로 잡는다. 24자+ 순수 hex 는 실토큰으로 본다.
// (과거 32 비대칭 완화 — <KEY:40자hex> 같은 우회를 닫기 위함. slug 오탐은
//  looksLikeRealToken 의 문자종류 규칙이 별도로 막는다: 순수 hex 는 [a-f0-9]로 항상
//  최소 2종 이상 → hex 경로에서만 판정, base64 slug 경로와 충돌 없음.)
const HEX_MIN_LEN = 24;

// 구분자 없는 연속 실토큰 임계(레드팀 재현 방어): 40자 all-lowercase 처럼 문자 종류는
// 1종(순소문자)이라 kinds<2 로 새던 실토큰을 잡는다. 핵심 구별자는 "구분자 없는 한 덩어리
// 의 길이": slug·anchor·path 는 - _ / + = 구분자로 잘게 쪼개진다(method/path/auth/params/
// → 최장 덩어리 params(6), --openapiusereventcreate → openapiusereventcreate(22)). 반면 진짜
// secret 은 구분자 없이 40자+ 한 덩어리로 이어진다. 그래서 "가장 긴 [a-z0-9] 무구분자 런"이
// 이 임계 이상이면 kinds 가 1종이어도 실토큰으로 본다. label=token 처럼 앞에 key= 가 붙어
// 캡처가 = 를 물어도, = 뒤 런만 재어 정확히 판정한다. 40 은 산문 단어·식별자·앵커 슬러그가
// 구분자 없이 도달하기 어려운 길이라 기존 오탐 0 을 지킨다.
const CONTIGUOUS_MIN_LEN = 40;
// 무구분자 [A-Za-z0-9] 런(구분자 - _ / + = 로 쪼갠 조각). 최장 조각 길이로 slug 와 secret 을 가른다.
// 소·대문자 모두 포함 — all-lowercase 뿐 아니라 all-UPPERCASE 40자+ 단일종 토큰도 잡는다(레드팀 재현 차단).
const ALNUM_RUN_RE = /[A-Za-z0-9]+/g;

// 토큰 안에서 구분자로 쪼갠 가장 긴 소문자/숫자 연속 런의 길이.
function longestContiguousRun(token) {
  let max = 0;
  const runs = token.match(ALNUM_RUN_RE);
  if (runs) for (const r of runs) if (r.length > max) max = r.length;
  return max;
}

// 알려진 provider 키 접두(길이 무관 즉시 secret). 여기 걸리면 <...> 래핑·짧은 길이여도 잡는다.
// AKIA…(AWS), sk-…(OpenAI 등), ghp_…(GitHub PAT), xoxb-…(Slack bot).
const KNOWN_KEY_PREFIX_RE = /(?:AKIA[0-9A-Z]{6,}|sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|xoxb-[A-Za-z0-9-]{8,})/g;

// 순수 플레이스홀더 판정: <...> 안이 대문자 키워드/식별자·PII 라벨만 있고 실토큰이 아닌 것.
// 통과(플레이스홀더): <KEY> <SECRET> <SIGNATURE> <ACCESS_KEY> <PII:name> <PII:email> <custom_id>
// 불통(실토큰 래핑):  <KEY:0123…40hex> <sk-abc…> — 꺾쇠 안이 실토큰이면 플레이스홀더 아님.
const PLACEHOLDER_INNER_RE = /^[A-Za-z][A-Za-z0-9_]*(?::[A-Za-z][A-Za-z0-9_.-]*)?$/;

// haystack[index]에서 시작하는 token 을 감싼 <...> 의 내부 문자열을 돌려준다(없으면 null).
function enclosingAngleInner(haystack, index, tokenLen) {
  const before = haystack.lastIndexOf("<", index);
  if (before === -1) return null;
  const close = haystack.indexOf(">", before);
  if (close === -1 || close < index + tokenLen) return null;
  return haystack.slice(before + 1, close);
}

// token 이 순수 플레이스홀더로 감싸져 있으면 true(→ secret 아님).
// 꺾쇠 안 전체가 플레이스홀더 문법(대문자 키워드 / PII:라벨 / 식별자)일 때만 신뢰한다.
// 꺾쇠 안에 실토큰 문자열이 섞이면(looksLikeRealToken) 신뢰하지 않는다(우회 차단).
function isPlaceholderToken(token, haystack, index) {
  const inner = enclosingAngleInner(haystack, index, token.length);
  if (inner === null) return false;
  const trimmed = inner.trim();
  // 꺾쇠 안이 순수 플레이스홀더 문법이 아니면(예: 콜론 뒤 값이 숫자로 시작) 플레이스홀더 아님.
  if (!PLACEHOLDER_INNER_RE.test(trimmed)) return false;
  // 콜론으로 나뉜 어느 조각이라도 실토큰이면 플레이스홀더 아님(우회 차단).
  //   <KEY:abcdef…40hex> · <TOKEN:aG9u…base64> 처럼 콜론 뒤 값이 문자로 시작해도
  //   그 값(VALUE)을 실토큰 검사에 다시 통과시켜 밀수 토큰을 잡는다. 순수 라벨
  //   (<PII:name>·<ACCESS_KEY> 등)은 조각이 짧아 looksLikeRealToken 이 false → 플레이스홀더 유지.
  for (const seg of trimmed.split(":")) {
    if (looksLikeRealToken(seg)) return false;
  }
  return true;
}

function looksLikeRealToken(token) {
  if (HEX_RE.test(token)) return token.length >= HEX_MIN_LEN;
  // base64 계열: 대문자·소문자·숫자가 최소 2종 이상 섞여야 토큰다움(순수 단어 배제).
  if (!BASE64_RE.test(token)) return false;
  // 구분자(- _ / + =)는 산문·경로·마크다운 앵커에도 흔하므로 "문자 종류"로 세지 않는다.
  // [a-z] [A-Z] [0-9] 세 종류 중 2종 이상 섞여야 실토큰으로 본다. 순수 소문자(+구분자)
  // 식별자·경로·앵커 슬러그(예: --openapiusereventcreate, method/path/auth/params/)는 통과.
  const kinds =
    (/[a-z]/.test(token) ? 1 : 0) +
    (/[A-Z]/.test(token) ? 1 : 0) +
    (/[0-9]/.test(token) ? 1 : 0);
  if (kinds >= 2) return true;
  // 문자 1종(예: 40자 all-lowercase)이라도 구분자 없는 한 덩어리(무구분자 최장 런)가
  // CONTIGUOUS_MIN_LEN 이상이면 실토큰으로 본다(레드팀 재현 차단). slug·path 는 구분자로
  // 잘게 쪼개져 최장 런이 짧아 여기 안 걸린다.
  if (longestContiguousRun(token) >= CONTIGUOUS_MIN_LEN) return true;
  return false;
}

// 한 문자열에서 실토큰(secret)들을 뽑는다.
export function findSecrets(text) {
  if (typeof text !== "string") return [];
  const hits = [];

  // (a) 알려진 키 접두: 길이·꺾쇠 래핑 무관 즉시 잡는다.
  let k;
  KNOWN_KEY_PREFIX_RE.lastIndex = 0;
  while ((k = KNOWN_KEY_PREFIX_RE.exec(text)) !== null) {
    if (!hits.includes(k[0])) hits.push(k[0]);
  }

  // (b) 일반 base64/hex 후보 토큰: 순수 플레이스홀더 래핑만 면제.
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const token = m[0];
    if (hits.includes(token)) continue; // (a)에서 이미 잡힘
    if (isPlaceholderToken(token, text, m.index)) continue;
    if (looksLikeRealToken(token)) hits.push(token);
  }
  return hits;
}

// ── 게이트 1: diff_completeness ─────────────────────────────────────
// 표면 id 집합 == (신규 id ∪ 기연동 id). 어긋나면 offenders 에 사유별 id.
export function diffCompleteness(surfaceIds, integratedIds, newIds) {
  const surface = new Set(surfaceIds);
  const covered = new Set([...integratedIds, ...newIds]);
  const offenders = [];
  for (const id of surface) if (!covered.has(id)) offenders.push(id); // 표면에 있는데 어디에도 없음
  for (const id of covered) if (!surface.has(id)) offenders.push(id); // 신규/기연동인데 표면에 없음
  return { ok: offenders.length === 0, offenders };
}

// ── 게이트 2: no_fabricated_endpoint ────────────────────────────────
// ⚠️ 정직성 한계(설계상 오프라인): 이 게이트는 "표면 파일 내부 정합성"만 본다 —
//    changes 의 모든 신규 id 가 표면(ssot/api-surface.json) 안에 실재하는지.
//    이것은 채널톡 실제 라이브 API 와의 대응을 검증하지 '못한다'. 존재하지 않는
//    엔드포인트라도 표면에 넣기만 하면 이 게이트는 통과한다(가짜 표면 → 통과).
//    즉 "표면에 없는 id 를 지어내지 않았다"는 보장일 뿐, "표면 자체가 진짜다"는
//    보장이 아니다. 라이브 검증은 이 오프라인 도구의 범위가 아니며(의도적),
//    표면의 진위는 표면 저작·리뷰 단계(provenance 표기·사람 검수)의 책임이다.
export function noFabricatedEndpoint(surfaceIds, newIds) {
  const surface = new Set(surfaceIds);
  const offenders = newIds.filter((id) => !surface.has(id));
  return { ok: offenders.length === 0, offenders };
}

// ── 게이트 3: no_secret_in_example ──────────────────────────────────
// features 의 example_request / example_response 문자열들을 훑어 실토큰을 잡는다.
export function noSecretInExample(features) {
  const offenders = [];
  for (const f of features) {
    const chunks = [];
    if (typeof f.example_request === "string") chunks.push(f.example_request);
    if (f.example_response !== undefined) chunks.push(JSON.stringify(f.example_response));
    for (const c of chunks) {
      if (findSecrets(c).length > 0 && !offenders.includes(f.id)) offenders.push(f.id);
    }
  }
  return { ok: offenders.length === 0, offenders };
}

// ── 게이트 4: every_pii_flagged ─────────────────────────────────────
// 신규 feature 객체(pii_fields 보유)에 대해 has_pii 가 true 인지.
export function everyPiiFlagged(newFeatures) {
  const offenders = [];
  for (const nf of newFeatures) {
    const hasFields = Array.isArray(nf.pii_fields) && nf.pii_fields.length > 0;
    if (hasFields && nf.has_pii !== true) offenders.push(nf.id);
  }
  return { ok: offenders.length === 0, offenders };
}
