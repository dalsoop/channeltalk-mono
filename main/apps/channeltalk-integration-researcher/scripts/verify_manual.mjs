#!/usr/bin/env node
// scripts/verify_manual.mjs — 결정적 checker (§5.3). maker≠checker 의 기계 검증축.
//
// 입력: --changes <out/<run>/changes.json> --manual <out/<run>/update-manual.md>
//       [--out <manual-verdict.json>] [--round <n>]
// 검사(신선 눈, 지어냄 없음):
//   1. missing_feature     — changes.new_features 의 신규 id 가 매뉴얼에 언급 안 됨.
//   2. missing_pii_notice  — pii_fields 또는 policy_flag 있는 기능인데 매뉴얼에 개인정보 주의 없음.
//   3. secret_leak         — 매뉴얼 본문에 실키/실 secret 토큰 누출(§5.1-3, lib/gates 재사용).
// 산출: §4.6 manual-verdict.json — verdict(approve|revise), missed[].
// exit: revise → 3, approve → 0 (검증 실패를 CI 가 잡도록).
//
// lib 재사용: 모킹 앱(channeltalk-api-mock)의 lib/gates(secret 스캐너)를 상대 import.

import { readFileSync, writeFileSync } from "node:fs";
import { findSecrets } from "../../channeltalk-api-mock/lib/gates.mjs";
import { loadJson } from "../../channeltalk-api-mock/lib/surface.mjs";

// 개인정보 주의로 인정하는 표지어(§5.2/§6). 매뉴얼이 이 중 하나 근처에서 id 를 다루면 통과.
const PII_NOTICE_MARKERS = ["개인정보", "PII", "마스킹", "동의", "위탁", "hold_pii_transmit", "mask_inbound"];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

// 기능 id 가 매뉴얼에 언급됐는지(정확 문자열).
function mentions(manual, id) {
  return manual.includes(id);
}

// 해당 id 를 다루는 매뉴얼 섹션에 개인정보 주의 표지어가 있는지.
// 섹션 경계를 잡기 어려우므로: id 언급 위치 앞뒤 창(window) 안에 표지어가 있으면 통과.
const NOTICE_WINDOW = 600; // id 언급 지점 기준 앞뒤 문자 창

function hasPiiNoticeNear(manual, id) {
  let idx = manual.indexOf(id);
  while (idx !== -1) {
    const start = Math.max(0, idx - NOTICE_WINDOW);
    const end = Math.min(manual.length, idx + id.length + NOTICE_WINDOW);
    const window = manual.slice(start, end);
    if (PII_NOTICE_MARKERS.some((m) => window.includes(m))) return true;
    idx = manual.indexOf(id, idx + 1);
  }
  return false;
}

function needsPiiNotice(nf) {
  const hasFields = Array.isArray(nf.pii_fields) && nf.pii_fields.length > 0;
  return hasFields || (nf.policy_flag !== null && nf.policy_flag !== undefined);
}

export function verifyManual(changes, manual) {
  const missed = [];

  for (const nf of changes.new_features) {
    if (!mentions(manual, nf.id)) {
      missed.push({ id: nf.id, reason: "missing_feature", detail: "매뉴얼에 신규 기능 id 언급 없음" });
      continue; // 언급이 없으면 PII 주의 검사도 무의미
    }
    if (needsPiiNotice(nf) && !hasPiiNoticeNear(manual, nf.id)) {
      missed.push({
        id: nf.id,
        reason: "missing_pii_notice",
        detail: "pii_fields/policy_flag 있는 기능인데 개인정보 주의 서술 없음",
      });
    }
  }

  const leaked = findSecrets(manual);
  for (const tok of leaked) {
    missed.push({ id: "(manual)", reason: "secret_leak", detail: `실 토큰 누출 의심: ${tok.slice(0, 8)}…` });
  }

  const verdict = missed.length === 0 ? "approve" : "revise";
  return { verdict, missed };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.changes || !args.manual) {
    process.stderr.write("verify_manual: required --changes <p> --manual <p> [--out <p>] [--round <n>]\n");
    process.exit(1);
  }

  const changes = loadJson(args.changes);
  const manual = readFileSync(args.manual, "utf8");
  const round = typeof args.round === "string" ? Number(args.round) : 1;

  const { verdict, missed } = verifyManual(changes, manual);

  const result = {
    round,
    verdict,
    missed,
    fabricated: [],
    privacy_gaps: missed.filter((m) => m.reason === "missing_pii_notice").map((m) => m.id),
    fixes: missed.map((m) => `${m.id}: ${m.detail}`),
  };

  if (typeof args.out === "string") {
    writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  process.exit(verdict === "approve" ? 0 : 3);
}

// 직접 실행일 때만 main (import 재사용 시 부작용 없음).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
