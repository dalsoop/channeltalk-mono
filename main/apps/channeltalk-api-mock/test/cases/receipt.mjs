// test/cases/receipt.mjs — 영수증 파생 정합성(diff_surface·build_receipt 가 입력에서 파생하는가).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeChanges } from "../../lib/diff.mjs";
import { loadSpecOps } from "../../lib/gates.mjs";
import { loadJson } from "../../lib/surface.mjs";
import { buildReceipt } from "../../scripts/diff_surface.mjs";
import { buildReceipt as buildRunReceipt } from "../../../channeltalk-integration-researcher/scripts/build_receipt.mjs";
import { profile, baseline } from "../harness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "..", "..", "ssot", "channel-swagger.json");

export function run({ record, surface }) {
  const specOps = loadSpecOps(loadJson(SPEC_PATH));

  // ── 12. run_receipt_consistency (영수증이 changes 와 일치, 5게이트 배선 포함) ─
  {
    const changes = computeChanges(
      surface,
      baseline([]),
      profile({ pii_policy: "no-transmit" }),
      specOps,
    );
    const receipt = buildReceipt(changes, "260705120000", "example");
    // not_verified = provenance=inferred 인 신규 id.
    const inferredIds = changes.new_features
      .filter((n) => n.provenance === "inferred")
      .map((n) => n.id);
    record(
      "run_receipt_consistency",
      { stamp: "260705120000", site: "example" },
      {
        stamp: "260705120000",
        site: "example",
        surface_version: surface.surface_version,
        counts: {
          new: changes.counts.new,
          new_with_pii: changes.counts.new_with_pii,
          policy_hold: changes.counts.policy_hold,
          new_inferred: changes.counts.new_inferred,
          removed: changes.removed.length,
        },
        gates: changes.gates,
        not_verified: inferredIds,
        generated_by: "diff_surface",
      },
      {
        stamp: receipt.stamp,
        site: receipt.site,
        surface_version: receipt.surface_version,
        counts: receipt.counts,
        gates: receipt.gates,
        not_verified: receipt.not_verified,
        generated_by: receipt.generated_by,
      },
    );
  }

  // ── 14. build_receipt_derivation (receipt 가 입력 파일에서 파생·정합) ──
  {
    // 가짜 changes + verdict + reviews 를 만들어 buildReceipt 가 llm_semantic·clean·gates 를
    // 입력에서 계산하는지 검증(authored 상수 아님). 세 리뷰 전부 pass·게이트 전부 통과·approve
    // → clean:true, llm_semantic "3/3 pass". 하나라도 어긋나면 clean:false·정직 표기여야.
    const fakeChanges = {
      customer: "www.example.net",
      surface_version: 7,
      removed: [],
      counts: { surface: 3, integrated: 1, new: 2, new_with_pii: 1, policy_hold: 1, new_inferred: 1 },
      gates: {
        diff_completeness: true,
        no_fabricated_endpoint: true,
        no_secret_in_example: true,
        every_pii_flagged: true,
        surface_in_pinned_spec: true, // 5번째 게이트 배선 → build_receipt 가 5/5 로 세는지 확인
      },
      gate_offenders: {},
      new_features: [
        { id: "openapi.thing.get", provenance: "mock" },
        { id: "webhook.thing.created", provenance: "inferred" }, // → not_verified 로 파생
      ],
    };
    const fakeVerdict = { round: 1, verdict: "approve", missed: [] };
    const fakeReviews = [
      { name: "accuracy", review: { count: 0, verdict: "pass", offenders: [] } },
      { name: "completeness", review: { count: 0, verdict: "pass", offenders: [] } },
      { name: "privacy", review: { count: 0, verdict: "pass", offenders: [] } },
    ];

    const receiptPass = buildRunReceipt(fakeChanges, fakeVerdict, fakeReviews, {
      stamp: "260705120000",
      produced: ["changes.json", "reviews/accuracy-verdict.json"],
    });

    // 실패 변형: 한 리뷰가 fail → llm_semantic 이 "2/3 pass — FAIL…", clean:false 로 정직 파생.
    const failReviews = [
      { name: "accuracy", review: { count: 2, verdict: "fail", offenders: ["x", "y"] } },
      { name: "completeness", review: { count: 0, verdict: "pass", offenders: [] } },
      { name: "privacy", review: { count: 0, verdict: "pass", offenders: [] } },
    ];
    const receiptFail = buildRunReceipt(fakeChanges, fakeVerdict, failReviews, {});

    // 리뷰 디렉토리 없음(null) → llm_semantic "not_run", clean:false.
    const receiptNoReviews = buildRunReceipt(fakeChanges, fakeVerdict, null, {});

    record(
      "build_receipt_derivation",
      { reviews: "3 pass / 1 fail / none", verdict: "approve", gates: "5/5 pass" },
      {
        pass_site: "www.example.net",
        pass_run: "260705120000-www.example.net",
        pass_gates: {
          diff: "5/5 pass",
          manual_deterministic: "approve (missed 0)",
          llm_semantic: "3/3 pass (accuracy·completeness·privacy, count 0)",
        },
        pass_counts_new: 2,
        pass_not_verified: ["webhook.thing.created"],
        pass_generated_by: "build_receipt",
        pass_clean: true,
        fail_llm_semantic: "2/3 pass — FAIL: accuracy(fail, count 2)",
        fail_clean: false,
        noreviews_llm_semantic: "not_run",
        noreviews_clean: false,
      },
      {
        pass_site: receiptPass.site,
        pass_run: receiptPass.run,
        pass_gates: receiptPass.gates,
        pass_counts_new: receiptPass.counts.new,
        pass_not_verified: receiptPass.not_verified,
        pass_generated_by: receiptPass.generated_by,
        pass_clean: receiptPass.clean,
        fail_llm_semantic: receiptFail.gates.llm_semantic,
        fail_clean: receiptFail.clean,
        noreviews_llm_semantic: receiptNoReviews.gates.llm_semantic,
        noreviews_clean: receiptNoReviews.clean,
      },
    );
  }
}
