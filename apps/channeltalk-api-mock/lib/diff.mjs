// lib/diff.mjs — computeChanges(surface, baseline, profile) → §4.4 changes 객체.
// 순수·결정적: Date.now / Math.random / network 사용 금지. 정렬은 표면 순서 보존.
// policy_flag 는 lib/pii, 게이트는 lib/gates 에서만 계산(단일책임).

import { policyFlag, hasPii } from "./pii.mjs";
import {
  diffCompleteness,
  noFabricatedEndpoint,
  noSecretInExample,
  everyPiiFlagged,
  surfaceInPinnedSpec,
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

// specOps(선택): Set<"METHOD /norm/path"> — pin 된 실 OpenAPI 스펙의 operation 집합.
// 호출자(diff_surface.mjs)가 loadSpecOps 로 미리 뽑아 넘긴다. computeChanges 는 순수 유지
// (파일·네트워크 I/O 안 함) — specOps 는 인자로만 받는다.
//   주어지면  → 5번째 게이트 surface_in_pinned_spec 을 계산(표면·신규의 비-inferred(pinned)
//               feature 가 실 스펙에 실재하는지 대조, offenders → gate_offenders).
//   미제공 시 → 하위호환: 이 게이트를 아예 생략한다(gates 에 키를 넣지 않음). 스펙 pin 을
//               못 읽은 실행(스펙 파일 부재 등)에서 "true" 로 위장하지 않기 위해 생략을 택한다.
export function computeChanges(surface, baseline, profile, specOps = null) {
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

  // 게이트 5 (선택): surface_in_pinned_spec — specOps 가 주어질 때만 계산.
  // 표면 전체의 비-inferred(pinned) feature 가 pin 된 실 스펙 operation 에 실재하는지 대조한다.
  // 신규(new)도 표면의 부분집합이므로 표면 전체를 검사하면 신규까지 함께 덮인다.
  // specOps 미제공(하위호환) 시에는 키 자체를 넣지 않는다(위 함수 주석 참조).
  if (specOps) {
    const g5 = surfaceInPinnedSpec(features, specOps);
    gates.surface_in_pinned_spec = g5.ok;
    if (!g5.ok) gate_offenders.surface_in_pinned_spec = g5.offenders;
  }

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
