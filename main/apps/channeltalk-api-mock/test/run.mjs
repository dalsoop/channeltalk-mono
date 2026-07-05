#!/usr/bin/env node
// test/run.mjs — §11 결정적 테스트. lib 순수함수만 호출(네트워크·시각 없음).
// 각 케이스: input → expected → actual → verdict. 실패 시 exit≠0.
//
// 케이스:
//   happy          baseline=[] vs 표면 22 → 신규 22, 게이트 전부 PASS
//   idempotent     baseline=전체 → 신규 0, removed 0
//   secret_negative 예제에 실키 주입 → no_secret_in_example 게이트 FAIL
//   delta          표면 +1(가짜 신기능) → 그 delta 1개만 노출
//   policy_flag    pii_policy=no-transmit + 전송형 PII(user.upsert) → hold_pii_transmit
//                  + 수신형 PII(user.get) → mask_inbound

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurface, loadJson, validate } from "../lib/surface.mjs";
import { computeChanges, gatesPass } from "../lib/diff.mjs";
import { policyFlag } from "../lib/pii.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE_PATH = join(__dirname, "..", "ssot", "api-surface.json");
const SURFACE_SCHEMA = join(__dirname, "..", "schemas", "surface.schema.json");

const surface = loadSurface(SURFACE_PATH);
const surfaceSchema = loadJson(SURFACE_SCHEMA);

let failures = 0;
const results = [];

function record(name, input, expected, actual) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  if (!pass) failures++;
  results.push({ name, input, expected, actual, verdict: pass ? "PASS" : "FAIL" });
}

// 프로필 헬퍼.
function profile(overrides = {}) {
  return {
    customer: "test",
    integration_stage: "none",
    pii_policy: "no-transmit",
    depth: 0,
    ...overrides,
  };
}
function baseline(integrated = []) {
  return { customer: "test", baseline_version: 1, integrated_at_surface_version: 0, integrated };
}

// ── 0. 시드 스키마 유효성(게이트 전 전제) ─────────────────────────
{
  const v = validate(surface, surfaceSchema);
  record(
    "surface_schema_valid",
    { file: "ssot/api-surface.json" },
    { ok: true, errorCount: 0 },
    { ok: v.ok, errorCount: v.errors.length },
  );
}

// ── 1. happy ──────────────────────────────────────────────────────
{
  const changes = computeChanges(surface, baseline([]), profile());
  record(
    "happy",
    { baseline: "[]", surface_count: surface.features.length },
    { new: 22, removed: 0, gatesPass: true },
    { new: changes.counts.new, removed: changes.removed.length, gatesPass: gatesPass(changes) },
  );
}

// ── 2. idempotent ─────────────────────────────────────────────────
{
  const allIds = surface.features.map((f) => f.id);
  const changes = computeChanges(surface, baseline(allIds), profile());
  record(
    "idempotent",
    { baseline: "all 22 ids" },
    { new: 0, removed: 0, gatesPass: true },
    { new: changes.counts.new, removed: changes.removed.length, gatesPass: gatesPass(changes) },
  );
}

// ── 3. secret_negative ────────────────────────────────────────────
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

// ── 4. delta (신규기능 시뮬) ──────────────────────────────────────
{
  // baseline = 현재 표면 전체. 표면에 가짜 신기능 1개 추가(+version) → delta 1개만.
  const allIds = surface.features.map((f) => f.id);
  const bumped = JSON.parse(JSON.stringify(surface));
  bumped.surface_version = surface.surface_version + 1;
  bumped.features.push({
    id: "openapi.newfeature.simulated",
    category: "User",
    method: "GET",
    path: "/open/v5/new-thing",
    auth: ["x-access-key", "x-access-secret"],
    summary: "시뮬레이션 신기능",
    pii_fields: [],
    dir: "R",
    provenance: "mock",
    added_in_version: surface.surface_version + 1,
  });
  const changes = computeChanges(bumped, baseline(allIds), profile());
  record(
    "delta",
    { baseline: "all current 22", surface: "+1 simulated feature" },
    { new: 1, new_id: "openapi.newfeature.simulated", gatesPass: true },
    {
      new: changes.counts.new,
      new_id: (changes.new_features[0] || {}).id,
      gatesPass: gatesPass(changes),
    },
  );
}

// ── 5. policy_flag ────────────────────────────────────────────────
{
  const upsert = surface.features.find((f) => f.id === "openapi.user.upsert");
  const userGet = surface.features.find((f) => f.id === "openapi.user.get");
  const outbound = policyFlag(upsert, "no-transmit"); // W + PII → hold
  const inbound = policyFlag(userGet, "no-transmit"); // R + PII → mask
  // consent 정책은 기계 flag 없음(null).
  const consentFlag = policyFlag(upsert, "consent");
  record(
    "policy_flag",
    { policy: "no-transmit", outbound: "user.upsert(W+PII)", inbound: "user.get(R+PII)" },
    { outbound: "hold_pii_transmit", inbound: "mask_inbound", consent: null },
    { outbound, inbound, consent: consentFlag },
  );
}

// ── 6. policy_hold count (§4.4 counts.policy_hold=1 for ranode) ───
{
  const changes = computeChanges(surface, baseline([]), profile({ pii_policy: "no-transmit" }));
  record(
    "counts_shape_ranode",
    { baseline: "[]", policy: "no-transmit" },
    { new: 22, new_with_pii: 9, policy_hold: 1, new_inferred: 4 },
    {
      new: changes.counts.new,
      new_with_pii: changes.counts.new_with_pii,
      policy_hold: changes.counts.policy_hold,
      new_inferred: changes.counts.new_inferred,
    },
  );
}

// ── 출력 ──────────────────────────────────────────────────────────
for (const r of results) {
  process.stdout.write(
    `[${r.verdict}] ${r.name}\n` +
      `  input:    ${JSON.stringify(r.input)}\n` +
      `  expected: ${JSON.stringify(r.expected)}\n` +
      `  actual:   ${JSON.stringify(r.actual)}\n`,
  );
}
process.stdout.write(`\n${results.length - failures}/${results.length} passed\n`);
process.exit(failures === 0 ? 0 : 1);
