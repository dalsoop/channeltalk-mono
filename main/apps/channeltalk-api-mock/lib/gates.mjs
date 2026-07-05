// lib/gates.mjs — §5.1 결정적 diff 게이트 4개. 각 순수함수, 반환 { ok, offenders[] }.
// 임계·정규식 상수는 이 모듈 상단 한 곳에만 둔다(매직값 산재 금지).
//
// 1. diffCompleteness    — 표면 = (신규 ∪ 기연동), 누락·초과 없음.
// 2. noFabricatedEndpoint — changes 의 모든 신규 id 가 표면에 실재.
// 3. noSecretInExample   — 예제에 24자+ base64/hex 실토큰 없음. 플레이스홀더만.
// 4. everyPiiFlagged     — pii_fields 있는 신규 기능은 has_pii:true.

// 실토큰 판정 임계: 연속 24자 이상의 base64/hex 문자열이면 secret 로 본다(§5.1-3).
export const SECRET_MIN_LEN = 24;

// 24자+ 연속 base64/hex 후보 토큰.
const TOKEN_RE = new RegExp(`[A-Za-z0-9+/=_-]{${SECRET_MIN_LEN},}`, "g");
// hex(16진) 전용 판정.
const HEX_RE = /^[0-9a-fA-F]+$/;
// base64 계열(대소문자·숫자 + / = _ -) 판정.
const BASE64_RE = /^[A-Za-z0-9+/=_-]+$/;

// 플레이스홀더는 secret 이 아니다: <KEY> <SECRET> <SIGNATURE> <PII:...> <custom> 등
// 홑화살괄호로 감싼 토큰, 또는 그 안에 화살괄호/콜론/공백이 섞인 형태.
function isPlaceholderToken(token, haystack, index) {
  // 토큰이 <...> 안에 들어있으면 플레이스홀더.
  const before = haystack.lastIndexOf("<", index);
  const closeAfterOpen = before === -1 ? -1 : haystack.indexOf(">", before);
  if (before !== -1 && closeAfterOpen !== -1 && closeAfterOpen >= index + token.length) {
    return true;
  }
  return false;
}

// hex 는 정보량이 낮아(글자 종류 16) 자연어와 겹칠 수 있으니 hex 는 32자+ 만 실토큰으로 본다.
const HEX_MIN_LEN = 32;

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
  return kinds >= 2;
}

// 한 문자열에서 실토큰(secret)들을 뽑는다.
export function findSecrets(text) {
  if (typeof text !== "string") return [];
  const hits = [];
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const token = m[0];
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
