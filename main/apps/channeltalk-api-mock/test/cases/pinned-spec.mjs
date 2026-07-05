// test/cases/pinned-spec.mjs — pin 된 실 OpenAPI 스펙 대조(설계 A: pinned surface).
// 게이트가 이제 "표면 파일 내부 정합성"을 넘어 "공개 스펙 스냅샷 실재"까지 검증하는지 확인.
//
// (a) 모든 pinned feature 가 pin 된 스펙에 실재.
// (b) 일부러 만든 가짜 feature(GET /nope)가 spec 검증에 FAIL — 게이트에 이빨.
// (c) counts_shape 는 diff.mjs 에서 새 표면 수치로 갱신(여기선 provenance 분포·spec_lock 확인).
// (d) user.upsert method==PATCH · user.list 부재.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadJson } from "../../lib/surface.mjs";
import { loadSpecOps, surfaceInPinnedSpec } from "../../lib/gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "..", "..", "ssot", "channel-swagger.json");
const LOCK_PATH = join(__dirname, "..", "..", "ssot", "provenance-lock.json");

export function run({ record, surface }) {
  const spec = loadJson(SPEC_PATH);
  const lock = loadJson(LOCK_PATH);
  const specOps = loadSpecOps(spec);

  // ── (a) all_pinned_features_in_spec ─────────────────────────────
  // 표면의 비-inferred(pinned) feature 전부가 pin 된 스펙 operation 에 실재해야.
  {
    const res = surfaceInPinnedSpec(surface.features, specOps);
    const pinnedCount = surface.features.filter((f) => f.provenance === "pinned").length;
    record(
      "all_pinned_features_in_spec",
      { pinned: pinnedCount, spec_ops: specOps.size },
      { ok: true, offenders: [] },
      { ok: res.ok, offenders: res.offenders },
    );
  }

  // ── (b) fabricated_feature_fails_spec (게이트 이빨) ─────────────
  // 스펙에 없는 가짜 REST feature 를 넣으면 spec 검증이 FAIL 해야 한다(현실 대비).
  {
    const poisoned = JSON.parse(JSON.stringify(surface));
    poisoned.features.push({
      id: "openapi.user.nonexistent",
      category: "User",
      method: "GET",
      path: "/open/v5/nope",
      auth: ["x-access-key", "x-access-secret"],
      summary: "존재하지 않는 가짜 엔드포인트",
      pii_fields: [],
      dir: "R",
      provenance: "pinned",
      added_in_version: 99,
    });
    const res = surfaceInPinnedSpec(poisoned.features, specOps);
    record(
      "fabricated_feature_fails_spec",
      { injected: "openapi.user.nonexistent GET /nope (pinned but not in spec)" },
      { ok: false, offenders: ["openapi.user.nonexistent"] },
      { ok: res.ok, offenders: res.offenders },
    );
  }

  // ── (c) spec_lock_and_provenance (분포·lock 참조 정합) ──────────
  // 표면 spec_lock 이 provenance-lock 과 일치하고 provenance 가 pinned|inferred 뿐인지.
  {
    const tally = {};
    for (const f of surface.features) tally[f.provenance] = (tally[f.provenance] || 0) + 1;
    const onlyValid = Object.keys(tally).every((p) => p === "pinned" || p === "inferred");
    record(
      "spec_lock_and_provenance",
      { spec_lock: surface.spec_lock },
      {
        lock_sha_matches: true,
        op_count: 163,
        only_pinned_or_inferred: true,
        tally: { pinned: 18, inferred: 3 },
      },
      {
        lock_sha_matches: surface.spec_lock.sha256 === lock.sha256,
        op_count: surface.spec_lock.op_count,
        only_pinned_or_inferred: onlyValid,
        tally,
      },
    );
  }

  // ── (d) upsert_patch_and_list_absent (교정 반영 확인) ───────────
  {
    const upsert = surface.features.find((f) => f.id === "openapi.user.upsert");
    const listPresent = surface.features.some((f) => f.id === "openapi.user.list");
    record(
      "upsert_patch_and_list_absent",
      { check: "user.upsert method + user.list presence" },
      { upsert_method: "PATCH", upsert_path: "/open/v5/users/{userId}", list_present: false },
      { upsert_method: upsert.method, upsert_path: upsert.path, list_present: listPresent },
    );
  }
}
