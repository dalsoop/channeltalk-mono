// lib/diff.mjs — computeChanges(surface, baseline, profile) → §4.4 changes 객체.
// 순수·결정적: Date.now / Math.random / network 사용 금지. 정렬은 표면 순서 보존.
// policy_flag 는 lib/pii, 게이트는 lib/gates 에서만 계산(단일책임).

import { policyFlag, hasPii } from "./pii.mjs";
import {
  diffCompleteness,
  noFabricatedEndpoint,
  noSecretInExample,
  everyPiiFlagged,
} from "./gates.mjs";

// 신규 feature 를 §4.4 new_features 항목 형태로 투영한다.
function projectNewFeature(f, pii_policy) {
  return {
    id: f.id,
    category: f.category,
    method: f.method,
    path: f.path,
    dir: f.dir,
    has_pii: hasPii(f),
    pii_fields: Array.isArray(f.pii_fields) ? f.pii_fields : [],
    provenance: f.provenance,
    added_in_version: f.added_in_version,
    policy_flag: policyFlag(f, pii_policy),
  };
}

export function computeChanges(surface, baseline, profile) {
  const features = surface.features;
  const surfaceIds = features.map((f) => f.id);
  const integrated = Array.isArray(baseline.integrated) ? baseline.integrated : [];
  const integratedSet = new Set(integrated);

  // 신규 = 표면 features − baseline.integrated (표면 순서 보존 → 결정적).
  const newSurface = features.filter((f) => !integratedSet.has(f.id));
  const newIds = newSurface.map((f) => f.id);

  const pii_policy = profile.pii_policy;
  const new_features = newSurface.map((f) => projectNewFeature(f, pii_policy));

  // removed = 연동했는데 표면에서 사라진 id(폐기 감시).
  const surfaceIdSet = new Set(surfaceIds);
  const removed = integrated.filter((id) => !surfaceIdSet.has(id));

  // counts (§4.4).
  const counts = {
    surface: features.length,
    integrated: integrated.length,
    new: new_features.length,
    new_with_pii: new_features.filter((n) => n.has_pii).length,
    policy_hold: new_features.filter((n) => n.policy_flag === "hold_pii_transmit").length,
    new_inferred: new_features.filter((n) => n.provenance === "inferred").length,
  };

  // 게이트 4개 (§5.1).
  const g1 = diffCompleteness(surfaceIds, integrated, newIds);
  const g2 = noFabricatedEndpoint(surfaceIds, newIds);
  const g3 = noSecretInExample(features);
  const g4 = everyPiiFlagged(new_features);

  const gates = {
    diff_completeness: g1.ok,
    no_fabricated_endpoint: g2.ok,
    no_secret_in_example: g3.ok,
    every_pii_flagged: g4.ok,
  };

  const gate_offenders = {};
  if (!g1.ok) gate_offenders.diff_completeness = g1.offenders;
  if (!g2.ok) gate_offenders.no_fabricated_endpoint = g2.offenders;
  if (!g3.ok) gate_offenders.no_secret_in_example = g3.offenders;
  if (!g4.ok) gate_offenders.every_pii_flagged = g4.offenders;

  return {
    customer: profile.customer ?? baseline.customer,
    surface_version: surface.surface_version,
    baseline_version: baseline.baseline_version,
    profile: {
      integration_stage: profile.integration_stage,
      pii_policy: profile.pii_policy,
      depth: profile.depth,
    },
    new_features,
    removed,
    counts,
    gates,
    gate_offenders,
  };
}

// 모든 게이트 통과 여부(스크립트 exit code 판정용).
export function gatesPass(changes) {
  return Object.values(changes.gates).every((v) => v === true);
}
