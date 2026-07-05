// test/cases/diff.mjs — 표면 diff/counts 통합 테스트(happy·멱등·delta·counts shape).
import { computeChanges, gatesPass } from "../../lib/diff.mjs";
import { profile, baseline } from "../harness.mjs";

export function run({ record, surface }) {
  // ── 1. happy ────────────────────────────────────────────────────
  {
    const changes = computeChanges(surface, baseline([]), profile());
    record(
      "happy",
      { baseline: "[]", surface_count: surface.features.length },
      { new: 22, removed: 0, gatesPass: true },
      { new: changes.counts.new, removed: changes.removed.length, gatesPass: gatesPass(changes) },
    );
  }

  // ── 2. idempotent ───────────────────────────────────────────────
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

  // ── 4. delta (신규기능 시뮬) ────────────────────────────────────
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

  // ── 6. policy_hold count (§4.4 counts.policy_hold=1 for example) ─
  {
    const changes = computeChanges(surface, baseline([]), profile({ pii_policy: "no-transmit" }));
    record(
      "counts_shape_example",
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
}
