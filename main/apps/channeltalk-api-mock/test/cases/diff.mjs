// test/cases/diff.mjs — 표면 diff/counts 통합 테스트(happy·멱등·delta·counts shape).
// 5번째 게이트(surface_in_pinned_spec)를 실 diff 파이프라인처럼 배선해서 돈다:
// pin 된 실 스펙(ssot/channel-swagger.json)을 로컬로 읽어 specOps 를 뽑고 computeChanges 에
// 넘긴다 — 그래서 changes.gates 가 5키가 되고, gatesPass 는 5개 전부 true 를 요구한다.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeChanges, gatesPass } from "../../lib/diff.mjs";
import { loadSpecOps } from "../../lib/gates.mjs";
import { loadJson } from "../../lib/surface.mjs";
import { profile, baseline } from "../harness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "..", "..", "ssot", "channel-swagger.json");

export function run({ record, surface }) {
  const specOps = loadSpecOps(loadJson(SPEC_PATH));

  // gates 5키(정렬)의 값 배열 — 배선이 걸렸는지 형태로 확인하는 헬퍼.
  const gateValues = (changes) => {
    const g = changes.gates;
    return [
      g.diff_completeness,
      g.no_fabricated_endpoint,
      g.no_secret_in_example,
      g.every_pii_flagged,
      g.surface_in_pinned_spec,
    ];
  };

  // ── 1. happy ────────────────────────────────────────────────────
  {
    const changes = computeChanges(surface, baseline([]), profile(), specOps);
    record(
      "happy",
      { baseline: "[]", surface_count: surface.features.length },
      { new: 21, removed: 0, gate_count: 5, gates: [true, true, true, true, true], gatesPass: true },
      {
        new: changes.counts.new,
        removed: changes.removed.length,
        gate_count: Object.keys(changes.gates).length,
        gates: gateValues(changes),
        gatesPass: gatesPass(changes),
      },
    );
  }

  // ── 2. idempotent ───────────────────────────────────────────────
  {
    const allIds = surface.features.map((f) => f.id);
    const changes = computeChanges(surface, baseline(allIds), profile(), specOps);
    record(
      "idempotent",
      { baseline: "all current ids" },
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
      provenance: "pinned",
      added_in_version: surface.surface_version + 1,
    });
    // specOps 미제공(null) — 하위호환 경로. 이 시뮬 feature 는 실 스펙에 없는 path 라
    // 5번째 게이트를 켜면 당연히 FAIL 한다(그건 poisoned 케이스에서 따로 증명). 여기선
    // delta 카운팅만 보므로 게이트 5를 끈 채(4게이트) gatesPass:true 를 확인한다.
    const changes = computeChanges(bumped, baseline(allIds), profile());
    record(
      "delta",
      { baseline: "all current", surface: "+1 simulated feature (specOps omitted → 4 gates)" },
      { new: 1, new_id: "openapi.newfeature.simulated", gate_count: 4, gatesPass: true },
      {
        new: changes.counts.new,
        new_id: (changes.new_features[0] || {}).id,
        gate_count: Object.keys(changes.gates).length,
        gatesPass: gatesPass(changes),
      },
    );
  }

  // ── 6. policy_hold count (§4.4 counts.policy_hold=1 for example) ─
  {
    const changes = computeChanges(
      surface,
      baseline([]),
      profile({ pii_policy: "no-transmit" }),
      specOps,
    );
    record(
      "counts_shape_example",
      { baseline: "[]", policy: "no-transmit" },
      {
        new: 21,
        new_with_pii: 8,
        policy_hold: 1,
        new_inferred: 3,
        gate_keys: [
          "diff_completeness",
          "every_pii_flagged",
          "no_fabricated_endpoint",
          "no_secret_in_example",
          "surface_in_pinned_spec",
        ],
      },
      {
        new: changes.counts.new,
        new_with_pii: changes.counts.new_with_pii,
        policy_hold: changes.counts.policy_hold,
        new_inferred: changes.counts.new_inferred,
        gate_keys: Object.keys(changes.gates).sort(),
      },
    );
  }

  // ── 7. surface_in_pinned_spec live (실 diff 파이프라인 배선 회귀) ─
  // 표면 전체(비-inferred pinned)가 실 스펙에 실재 → 5번째 게이트 true, 5/5 통과.
  {
    const changes = computeChanges(surface, baseline([]), profile(), specOps);
    record(
      "surface_in_pinned_spec_true",
      { specOps: "loaded from ssot/channel-swagger.json", baseline: "[]" },
      { surface_in_pinned_spec: true, offenders: undefined, gatesPass: true },
      {
        surface_in_pinned_spec: changes.gates.surface_in_pinned_spec,
        offenders: changes.gate_offenders.surface_in_pinned_spec,
        gatesPass: gatesPass(changes),
      },
    );
  }

  // ── 8. fabricated feature → 5번째 게이트만 FAIL (게이트에 이빨) ──
  // 표면에 실 스펙에 없는 가짜 pinned feature 를 주입해 실 파이프라인처럼 돌리면,
  // surface_in_pinned_spec 만 false 로 떨어지고 offender 에 그 id 가 잡혀야 한다.
  // 나머지 4게이트는 여전히 true(파일 내부 정합·secret·pii 는 무결) → "게이트가 현실 대비 이빨".
  {
    const poisoned = JSON.parse(JSON.stringify(surface));
    poisoned.features.push({
      id: "openapi.fake.injected",
      category: "User",
      method: "GET",
      path: "/open/v5/nonexistent-endpoint",
      auth: ["x-access-key", "x-access-secret"],
      summary: "실 스펙에 없는 가짜 표면 feature",
      pii_fields: [],
      dir: "R",
      provenance: "pinned",
      added_in_version: 99,
    });
    const changes = computeChanges(poisoned, baseline([]), profile(), specOps);
    record(
      "fabricated_surface_fails_gate5",
      { injected: "openapi.fake.injected GET /nonexistent-endpoint (pinned, not in spec)" },
      {
        surface_in_pinned_spec: false,
        offenders: ["openapi.fake.injected"],
        diff_completeness: true,
        no_fabricated_endpoint: true,
        no_secret_in_example: true,
        every_pii_flagged: true,
        gatesPass: false,
      },
      {
        surface_in_pinned_spec: changes.gates.surface_in_pinned_spec,
        offenders: changes.gate_offenders.surface_in_pinned_spec,
        diff_completeness: changes.gates.diff_completeness,
        no_fabricated_endpoint: changes.gates.no_fabricated_endpoint,
        no_secret_in_example: changes.gates.no_secret_in_example,
        every_pii_flagged: changes.gates.every_pii_flagged,
        gatesPass: gatesPass(changes),
      },
    );
  }
}
