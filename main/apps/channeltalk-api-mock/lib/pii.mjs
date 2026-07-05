// lib/pii.mjs — §6 개인정보 정책 매핑. 순수·무의존.
//
// policyFlag(feature, pii_policy) → 'hold_pii_transmit' | 'mask_inbound' | null
//
// §6 프로필 정책 강도:
//  - no-transmit(전송 불가·최소화):
//      우리→채널톡 확정 PII 전송(W + 확정 식별 PII) → 'hold_pii_transmit' (도입 보류 권고)
//      수신(R/CB + pii)                              → 'mask_inbound'       (유입 PII 마스킹)
//  - consent / transmitting / undecided:
//      전송형은 매뉴얼(maker)이 동의·위탁·검토 체크리스트를 강제한다 —
//      기계 flag(hold/mask)로는 잡지 않으므로 null. (§6: 기계 게이트가 아니라 서술 강제)
//
// 확정 PII vs 조건부 PII (§12-B (a) 계약):
//   §12-B (a) 는 no-transmit·전체표면에서 hold_pii_transmit 을 `openapi.user.upsert` 단 1개로,
//   `openapi.user.event.create`(W, pii_fields:['property']) 는 hold 가 아니라
//   "이벤트 속성에서 개인정보 제외 권고"로 규정한다(policy_hold=1, §4.4).
//   → `property` 는 자유형 컨테이너(개인정보 섞일 '가능')라 확정 식별 필드가 아니다.
//     has_pii/new_with_pii 에는 세지만(9개), 전송형 hold 는 트리거하지 않는다.
//   SOFT_PII_FIELDS 로 이 구분을 상수화(매직값 산재 금지).
//
// 방향(dir)·PII 여부만 본다. 매핑 상수는 아래 표 한 곳에만 둔다.

// 확정 식별 PII 가 아니라 "섞일 가능"만 있는 자유형 필드(§12-B (a)).
// 이 필드만 가진 전송형 기능은 hold 대신 매뉴얼 권고로 다룬다.
export const SOFT_PII_FIELDS = Object.freeze(["property"]);

export const POLICY_FLAGS = Object.freeze({
  HOLD: "hold_pii_transmit",
  MASK: "mask_inbound",
});

// 방향 상수 — 표면 feature.dir 과 1:1.
export const DIR = Object.freeze({ READ: "R", WRITE: "W", CALLBACK: "CB" });

// pii_policy 값(§4.2 Q4) — 지원 목록.
export const PII_POLICIES = Object.freeze(["no-transmit", "consent", "transmitting", "undecided"]);

export function hasPii(feature) {
  return Array.isArray(feature.pii_fields) && feature.pii_fields.length > 0;
}

// 확정 식별 PII(자유형 SOFT_PII_FIELDS 를 뺀 나머지) 가 하나라도 있는가.
export function hasHardPii(feature) {
  if (!Array.isArray(feature.pii_fields)) return false;
  return feature.pii_fields.some((f) => !SOFT_PII_FIELDS.includes(f));
}

// 전송형(우리→채널톡): dir === 'W'. 수신형: dir === 'R' | 'CB'.
export function isOutbound(feature) {
  return feature.dir === DIR.WRITE;
}

export function policyFlag(feature, pii_policy) {
  if (!hasPii(feature)) return null;

  if (pii_policy === "no-transmit") {
    if (isOutbound(feature)) {
      // 전송형은 '확정 식별 PII' 가 있을 때만 hold. 자유형 property 만 있으면 hold 아님(§12-B (a)).
      return hasHardPii(feature) ? POLICY_FLAGS.HOLD : null;
    }
    return POLICY_FLAGS.MASK; // 수신형(R/CB) + pii → 마스킹
  }

  // consent / transmitting / undecided: 기계 flag 없음(매뉴얼 서술로 강제). §6.
  return null;
}
