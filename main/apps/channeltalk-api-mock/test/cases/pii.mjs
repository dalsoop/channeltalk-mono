// test/cases/pii.mjs — PII 정책 flag(전송형 hold·수신형 mask·consent null).
import { policyFlag } from "../../lib/pii.mjs";

export function run({ record, surface }) {
  // ── 5. policy_flag ──────────────────────────────────────────────
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
