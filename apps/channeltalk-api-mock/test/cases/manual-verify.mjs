// test/cases/manual-verify.mjs — maker→checker 루프의 "기계 검증축"(verify_manual.verifyManual) 회귀.
//
// 왜: 심사 패널이 "AI maker→checker 루프의 재현 가능한 실행/검증 증거가 약하다"고 지적했다.
//     루프의 산출(update-manual.md)은 shipped-runs 에 있고, 그 산출을 node 로 독립·결정적으로
//     재검증하는 축이 verify_manual(§5.3, exit 0/3 계약)이다. 이 케이스는 그 축이 정상(approve)과
//     예외(신규 누락·PII주의 누락·secret 누출)를 재현 가능하게 잡는지 단위로 못박는다.
//     → "AI 루프 산출은 결정적 checker 로 node 재검증된다"를 테스트로 증명(신뢰가 아니라 재현).
//
// import 경로: receipt.mjs 와 동일한 확립된 크로스앱 패턴(../../../channeltalk-integration-researcher/…)
//   — 소스 트리와 조립 트리(skills/channeltalk-integration-researcher/) 양쪽에서 같은 상대경로가 성립.
import { verifyManual } from "../../../channeltalk-integration-researcher/scripts/verify_manual.mjs";

// findSecrets 가 실키로 잡는 합성 토큰(실제 키 아님, 40자 혼합 alnum). §5.1-3 secret 스캐너 대상.
const SYNTHETIC_SECRET = "aB3dE7gH1jK2mN4pQ6rS8tU0vW9xYz1AbCd2EfGh";
// verify_manual 의 NOTICE_WINDOW(±600자)보다 넓게 벌리는 스페이서 — 섹션 간 표지어 누수 방지.
const PAD = "\n(연동 절차 상세 설명 반복 채움) ".repeat(40);

// 공용 changes 픽스처: 신규 3건 — PII 필드형 1 · 정책 플래그형 1 · 비-PII 1.
const changes = {
  new_features: [
    { id: "openapi.user.get", pii_fields: ["email", "mobileNumber"], policy_flag: null },
    { id: "openapi.user.upsert", pii_fields: [], policy_flag: "hold_pii_transmit" },
    { id: "openapi.manager.list", pii_fields: [], policy_flag: null },
  ],
};

// 정상 매뉴얼: 3건 전부 언급 + PII 2건은 표지어 근처 + secret 없음.
const OK_MANUAL = [
  "## openapi.user.get\n반환에 email·mobileNumber 포함. 개인정보 마스킹 후 저장.", PAD,
  "## openapi.user.upsert\n전송형이므로 hold_pii_transmit. 개인정보 위탁 동의 확인.", PAD,
  "## openapi.manager.list\nPII 없음.",
].join("\n");

export function run({ record }) {
  // ── 정상: approve, missed 0 ──
  {
    const r = verifyManual(changes, OK_MANUAL);
    record(
      "manual_verify_approve_clean",
      { new: 3, pii_needed: 2, secret: "none" },
      { verdict: "approve", missed: 0 },
      { verdict: r.verdict, missed: r.missed.length },
    );
  }

  // ── 예외 A: 신규 id 하나 누락 → revise · missing_feature ──
  {
    const manual = OK_MANUAL.replace(/openapi\.manager\.list/g, "(생략)");
    const r = verifyManual(changes, manual);
    const miss = r.missed.find((m) => m.reason === "missing_feature");
    record(
      "manual_verify_missing_feature",
      { drop: "openapi.manager.list" },
      { verdict: "revise", reason: "missing_feature", id: "openapi.manager.list" },
      { verdict: r.verdict, reason: miss?.reason ?? null, id: miss?.id ?? null },
    );
  }

  // ── 예외 B: PII 기능 언급하되 주의 표지어 없음 → revise · missing_pii_notice ──
  {
    // user.get 은 표지어 없이, upsert 표지어와는 PAD 로 격리(±600 창 밖).
    const manual = [
      "## openapi.user.get\n반환에 email·mobileNumber 포함.", PAD, PAD,
      "## openapi.user.upsert\n전송형이므로 hold_pii_transmit. 개인정보 위탁 동의 확인.", PAD, PAD,
      "## openapi.manager.list\nPII 없음.",
    ].join("\n");
    const r = verifyManual(changes, manual);
    const gap = r.missed.find((m) => m.reason === "missing_pii_notice");
    record(
      "manual_verify_missing_pii_notice",
      { id: "openapi.user.get", notice: "absent" },
      { verdict: "revise", reason: "missing_pii_notice", id: "openapi.user.get" },
      { verdict: r.verdict, reason: gap?.reason ?? null, id: gap?.id ?? null },
    );
  }

  // ── 예외 C: 예제에 실 토큰 누출 → revise · secret_leak ──
  {
    const manual = OK_MANUAL + "\n예: curl -H 'x-access-secret: " + SYNTHETIC_SECRET + "'";
    const r = verifyManual(changes, manual);
    const leak = r.missed.find((m) => m.reason === "secret_leak");
    record(
      "manual_verify_secret_leak",
      { leaked: "x-access-secret 예제" },
      { verdict: "revise", reason: "secret_leak" },
      { verdict: r.verdict, reason: leak?.reason ?? null },
    );
  }
}
