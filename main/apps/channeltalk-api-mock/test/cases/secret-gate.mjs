// test/cases/secret-gate.mjs — secret 게이트 레드팀 회귀 스위트(findSecrets + no_secret_in_example 게이트).
// 신규 우회(bypass) 재현은 이 파일에 케이스로 추가한다. 각 케이스는 "실토큰 CAUGHT + slug/placeholder 오탐 0" 대칭을 지킨다.
import { computeChanges } from "../../lib/diff.mjs";
import { findSecrets } from "../../lib/gates.mjs";
import { profile, baseline } from "../harness.mjs";

export function run({ record, surface }) {
  // ── 3. secret_negative ──────────────────────────────────────────
  {
    // 표면 복제 후 한 feature 의 example 에 실키(40자 hex) 주입.
    const poisoned = JSON.parse(JSON.stringify(surface));
    poisoned.features[0].example_request =
      "GET /open/v5/users\nx-access-key: 0123456789abcdef0123456789abcdef01234567";
    const changes = computeChanges(poisoned, baseline([]), profile());
    record(
      "secret_negative",
      { injected: "40-char hex token in example_request" },
      { no_secret_in_example: false, offender: poisoned.features[0].id },
      {
        no_secret_in_example: changes.gates.no_secret_in_example,
        offender: (changes.gate_offenders.no_secret_in_example || [])[0],
      },
    );
  }

  // ── 7. no_false_positive_on_slug (마크다운 앵커·경로는 secret 아님) ─
  {
    // 구분자(- _ / + =)를 문자 종류로 세면 순소문자 슬러그·경로가 오탐된다(회귀 방지).
    const prose =
      "method/path/auth/params/ " +
      "--openapiusereventcreate --openapiuseruserchatslist --openapiuserchatsessionslist " +
      "--openapigroupmessagesend --openapichannelget-inferred --webhookmessagecreated-inferred " +
      "--webhookuserchatopened-inferred --webhookusercreated-inferred";
    record(
      "no_false_positive_on_slug",
      { text: "anchor slugs + method/path/auth/params/ prose" },
      { hits: 0 },
      { hits: findSecrets(prose).length },
    );
  }

  // ── 8. teeth_real_token_still_caught (실토큰은 계속 잡혀야 함) ─────
  {
    const base64Key = "aG9uZXN0bHlmYWtlYnV0bG9uZ2Vub3VnaHRva2VuMTIzNDU2"; // 대소문자+숫자 섞인 실키 예
    const hex40 = "0123456789abcdef0123456789abcdef01234567"; // 40자 hex 토큰
    const text = `x-access-key: ${base64Key}\nx-access-secret: ${hex40}`;
    record(
      "teeth_real_token_still_caught",
      { text: "base64 key + 40-char hex token" },
      { hits: [base64Key, hex40] },
      { hits: findSecrets(text) },
    );
  }

  // ── 9. secret_gate_angle_bypass (꺾쇠 우회 차단 + 오탐 0 유지) ─────
  {
    // <KEY:40hex> 처럼 꺾쇠 안에 실토큰이 들어오면 잡아야 한다(우회 차단).
    const wrapped = "x-access-key: <KEY:0123456789abcdef0123456789abcdef01234567>";
    // 순수 플레이스홀더는 계속 통과(오탐 0): <KEY> <SECRET> <PII:name>.
    const placeholders = "key=<KEY> secret=<SECRET> user=<PII:name> id=<ACCESS_KEY>";
    record(
      "secret_gate_angle_bypass",
      { wrapped: "<KEY:40hex>", placeholders: "<KEY> <SECRET> <PII:name> <ACCESS_KEY>" },
      { wrapped_hits: 1, placeholder_hits: 0 },
      { wrapped_hits: findSecrets(wrapped).length, placeholder_hits: findSecrets(placeholders).length },
    );
  }

  // ── 10. secret_gate_known_prefix (알려진 키 접두는 길이 무관 잡힘) ─
  {
    // AKIA…(AWS 예제 키)는 짧아도(20자) 접두 규칙으로 잡힌다.
    const aws = "aws_access_key_id = AKIAIOSFODNN7EXAMPLE";
    record(
      "secret_gate_known_prefix",
      { text: "AKIAIOSFODNN7EXAMPLE" },
      { hits: ["AKIAIOSFODNN7EXAMPLE"] },
      { hits: findSecrets(aws) },
    );
  }

  // ── 11. secret_gate_hex24 (24자+ 순수 hex 는 잡되 slug 오탐 없음) ──
  {
    // 24자 순수 hex → 잡힘(base64 와 대칭 임계). slug 텍스트(케이스7 회귀)는 계속 0.
    const hex24 = "0123456789abcdef01234567"; // 정확히 24자 hex
    const slug = "--openapiusereventcreate method/path/auth/params/";
    record(
      "secret_gate_hex24",
      { hex24: "24-char hex", slug: "anchor slug prose" },
      { hex_hits: 1, slug_hits: 0 },
      { hex_hits: findSecrets(`token=${hex24}`).length, slug_hits: findSecrets(slug).length },
    );
  }

  // ── 13. secret_gate_lowercase40 (40자 all-lowercase 실토큰 CAUGHT, slug 오탐 0) ──
  {
    // 레드팀 재현: 문자 1종(순소문자)이라 kinds<2 로 새던 40자+ 실토큰. 이제 잡혀야 한다.
    // 구별자는 "구분자 없는 최장 런": 실토큰은 40자+ 한 덩어리, slug 는 구분자로 쪼개져 짧다.
    const lower40 = "abcdefghijklmnopqrstuvwxyzabcdefghijklmno"; // 41자 all-lowercase 실키
    const glued = "x-access-secret=qwertyuiopasdfghjklzxcvbnmqwertyuiopasdf"; // key= 로 = 물린 40자
    // slug/anchor/path 는 계속 0(회귀 방지): 구분자로 쪼개져 최장 런이 임계 미만.
    const slug = "method/path/auth/params/ --openapiusereventcreate --webhookmessagecreated-inferred";
    record(
      "secret_gate_lowercase40",
      { lower40: "41-char all-lowercase token", glued: "key=<40-char lowercase>", slug: "anchor/path slugs" },
      { lower40_hits: 1, glued_hits: 1, slug_hits: 0 },
      {
        lower40_hits: findSecrets(`x-access-key: ${lower40}`).length,
        glued_hits: findSecrets(glued).length,
        slug_hits: findSecrets(slug).length,
      },
    );
  }

  // ── 16. secret_gate_uppercase40 (40자 all-UPPERCASE 실토큰 CAUGHT, 38자·짧은 라벨 오탐 0) ──
  {
    // 레드팀 재현: 연속 런 검사가 [a-z0-9] 소문자 전용이라 all-UPPERCASE 40자+ 가 kinds<2 로 샜다.
    // 이제 [A-Za-z0-9] 런으로 잡는다. 임계 40 유지 — 38자·짧은 대문자 라벨은 계속 0(오탐 회귀 방지).
    const upper40 = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNO"; // 41자 all-uppercase 실키
    const upper38 = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL"; // 38자 < 40 임계 → 미검출
    const label = "ACCESS_KEY SECRET SIGNATURE"; // 짧은 대문자 라벨 → 0
    record(
      "secret_gate_uppercase40",
      { upper40: "41-char all-uppercase token", upper38: "38-char (<40)", label: "short uppercase labels" },
      { upper40_hits: 1, upper38_hits: 0, label_hits: 0 },
      {
        upper40_hits: findSecrets(`x-access-key: ${upper40}`).length,
        upper38_hits: findSecrets(`x-access-key: ${upper38}`).length,
        label_hits: findSecrets(label).length,
      },
    );
  }

  // ── 17. secret_gate_angle_letterstart (꺾쇠 안 콜론 뒤 값이 문자로 시작하는 실토큰 CAUGHT, 순수 플레이스홀더 0) ──
  {
    // 레드팀 재현: <KEY:abcdef…40hex>·<TOKEN:aG9u…base64> 처럼 콜론 뒤 값이 '문자'로 시작하면
    // placeholder 로 오인돼 새던 우회. 이제 콜론 조각(VALUE)을 실토큰 검사에 다시 통과시켜 잡는다.
    const angleHex = "<KEY:abcdef0123456789abcdef0123456789abcdef01>"; // 40 hex, 문자시작
    const angleB64 = "<TOKEN:aG9uZXN0bHlmYWtlYnV0bG9uZ2Vub3VnaHRva2Vu>"; // base64, 문자시작
    // 순수 플레이스홀더 16종은 계속 0(오탐 회귀 방지).
    const placeholders =
      "<KEY> <SECRET> <PII:name> <PII:plainText> <PII:email> <PII:mobile> <ACCESS_KEY> <SIGNATURE> <custom> <event> <value> <message> <group> <channel> <bot> <key>";
    record(
      "secret_gate_angle_letterstart",
      { angleHex: "<KEY:40hex letter-start>", angleB64: "<TOKEN:base64 letter-start>", placeholders: "16 pure placeholders" },
      { angleHex_hits: 1, angleB64_hits: 1, placeholder_hits: 0 },
      {
        angleHex_hits: findSecrets(angleHex).length,
        angleB64_hits: findSecrets(angleB64).length,
        placeholder_hits: findSecrets(placeholders).length,
      },
    );
  }
}
