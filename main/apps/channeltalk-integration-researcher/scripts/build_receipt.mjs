#!/usr/bin/env node
// scripts/build_receipt.mjs — run-receipt.json 을 입력 파일에서 조립하는 CLI.
//
// 왜: 커밋된 run-receipt.json 이 손으로 쓴 요약이면 "스크립트 산출"이라는 README 서술이
//     거짓이 된다. 이 스크립트는 receipt 의 모든 값을 실제 입력 파일에서 파생시켜 그 서술을
//     참으로 만든다 — gates.llm_semantic·clean·gates.manual_deterministic 까지 authored 상수 없이
//     changes.json·manual-verdict.json·reviews/*.json 에서 계산한다.
//
// 입력:
//   --changes  <changes.json>        (필수) counts·gates·new_features(provenance) 원천
//   --verdict  <manual-verdict.json>  (필수) verdict + missed → manual_deterministic
//   --reviews  <dir(reviews/)>        (선택) *.json 을 읽어 llm_semantic 집계. 없으면 "not_run"
//   --out      <run-receipt.json>     (선택) 지정 시 파일로 씀. 없으면 stdout 만
//   --stamp    <yymmddhhmmss>         (선택) run id 접두. 없으면 changes 파생·폴백
//   --site     <www.example.net>      (선택) 고객사. 없으면 changes.customer
//
// 결정성: Date/random 없음. produced 는 실제 존재 파일 스캔(파일시스템 사실).
// 순수 buildReceipt 를 export 해 테스트에서 재사용. main 은 직접실행 가드.
//
// 인자 파싱은 record_depth.mjs 관용을 따른다(--key val, 다음 토큰이 --로 시작하면 boolean true).

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";

// ── 인자 파싱(record_depth.mjs 와 동일 관용) ─────────────────────────
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

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// reviews/ 안의 *.json 을 이름순으로 읽어 { name, review } 배열을 만든다(결정적 순서).
// name 은 파일명에서 "-verdict.json"/".json" 을 벗긴 라벨(accuracy·completeness·privacy).
function loadReviews(reviewsDir) {
  if (!reviewsDir || !existsSync(reviewsDir) || !statSync(reviewsDir).isDirectory()) return null;
  const files = readdirSync(reviewsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  return files.map((f) => ({
    name: f.replace(/-verdict\.json$/, "").replace(/\.json$/, ""),
    review: loadJson(join(reviewsDir, f)),
  }));
}

// ── llm_semantic 집계: reviews/*.json 을 실제로 읽어 pass 수·count 합·실패 표기 ─────
// 각 리뷰의 pass 판정: verdict === "pass" (없으면 count === 0 && offenders 비었을 때 pass 로 폴백).
// clean 계산과 사람이 읽을 요약 문자열을 함께 돌려준다.
function summarizeReviews(reviews) {
  if (reviews === null) {
    return { text: "not_run", allPass: false, ran: false, total: 0, passed: 0 };
  }
  const total = reviews.length;
  if (total === 0) {
    return { text: "not_run (empty reviews/)", allPass: false, ran: false, total: 0, passed: 0 };
  }
  let passed = 0;
  let countSum = 0;
  const failedLabels = [];
  const labels = [];
  for (const entry of reviews) {
    const name = entry && entry.name;
    const review = entry && entry.review;
    labels.push(name);
    // 손상/누락 리뷰 객체(null·비객체 — 예: reviews/*.json 이 JSON 리터럴 null)는 crash 시키지
    // 않고 정직하게 not-pass 로 처리한다(clean:false 로 파생). 값 가드만 있고 컨테이너 가드가
    // 없어 buildReceipt 가 순수함수인데도 터지던 회귀 차단.
    if (!review || typeof review !== "object") {
      failedLabels.push(`${name ?? "?"}(missing)`);
      continue;
    }
    const count = Number.isInteger(review.count) ? review.count : 0;
    countSum += count;
    // pass 판정: 명시 verdict 우선, 없으면 count 0 && offenders 비었을 때만 pass.
    const offenders = Array.isArray(review.offenders) ? review.offenders : [];
    const isPass =
      review.verdict === "pass" ||
      (review.verdict === undefined && count === 0 && offenders.length === 0);
    if (isPass) passed++;
    else failedLabels.push(`${name}(${review.verdict ?? "?"}, count ${count})`);
  }
  const allPass = passed === total;
  const text = allPass
    ? `${passed}/${total} pass (${labels.join("·")}, count ${countSum})`
    : `${passed}/${total} pass — FAIL: ${failedLabels.join(", ")}`;
  return { text, allPass, ran: true, total, passed };
}

// ── diff 게이트 요약: changes.gates → "N/N pass" 또는 offender 표기 ─────────────
// 게이트 개수는 changes.gates 에 실재하는 키에서 파생한다(하드코딩 목록 아님) — 5번째
// surface_in_pinned_spec 이 켜진 실행이면 자동으로 5/5, 안 켜진(하위호환) 실행이면 4/4.
// 결정적 순서를 위해 키를 정렬한다.
function summarizeDiffGates(changes) {
  const gates = changes.gates || {};
  const names = Object.keys(gates).sort();
  const passed = names.filter((n) => gates[n] === true);
  const failed = names.filter((n) => gates[n] !== true);
  const allPass = failed.length === 0;
  if (allPass) return { text: `${passed.length}/${names.length} pass`, allPass: true };
  // 실패 게이트의 offender 를 붙여 정직하게 표기.
  const offenders = changes.gate_offenders || {};
  const detail = failed
    .map((n) => {
      const off = Array.isArray(offenders[n]) ? offenders[n] : [];
      return off.length ? `${n}[${off.join(",")}]` : n;
    })
    .join(", ");
  return { text: `${passed.length}/${names.length} pass — FAIL: ${detail}`, allPass: false };
}

// ── manual_deterministic 요약: verdict + missed 수 → "approve (missed 0)" ────────
function summarizeManual(verdict) {
  // verdict 객체 자체가 null/undefined(예: manual-verdict.json 이 JSON 리터럴 null)여도
  // crash 대신 "unknown (missed 0)" 로 정직 파생 → approved:false → clean:false.
  const v = verdict && typeof verdict.verdict === "string" ? verdict.verdict : "unknown";
  const missed = verdict && Array.isArray(verdict.missed) ? verdict.missed : [];
  const approved = v === "approve" && missed.length === 0;
  return { text: `${v} (missed ${missed.length})`, allPass: approved };
}

// ── produced: outDir 안에 실제 존재하는 산출 파일 스캔(파일시스템 사실) ──────────
// reviews/ 하위도 재귀 1단계로 포함. run-receipt.json 자신은 제외(자기참조 방지).
function scanProduced(outDir, selfName) {
  if (!outDir || !existsSync(outDir)) return [];
  const out = [];
  const entries = readdirSync(outDir).sort();
  for (const e of entries) {
    const full = join(outDir, e);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = readdirSync(full)
        .filter((f) => statSync(join(full, f)).isFile())
        .sort();
      for (const f of sub) out.push(`${e}/${f}`);
    } else if (st.isFile() && e !== selfName) {
      out.push(e);
    }
  }
  return out;
}

// ── 순수 조립: 모든 값이 입력에서 파생. authored 상수 없음 ────────────────────────
// changes: changes.json 객체
// verdict: manual-verdict.json 객체
// reviews: [{name, review}] 또는 null(디렉토리 없음/비었음)
// opts: { stamp, site, produced[] }
export function buildReceipt(changes, verdict, reviews, opts = {}) {
  const counts = changes.counts || {};
  const site = opts.site ?? changes.customer ?? "unknown";
  const stamp = opts.stamp;
  const run = stamp ? `${stamp}-${site}` : site;

  const diff = summarizeDiffGates(changes);
  const manual = summarizeManual(verdict);
  const llm = summarizeReviews(reviews);

  // not_verified: provenance=inferred 인 신규 id (라이브 미검증분). changes 에서 파생.
  // id 없는 inferred 엔트리(손편집/서드파티 changes.json)는 undefined→JSON null 로 조용히
  // 들어가지 않게 거른다 — feature id 를 정확히 명시해야 할 필드에 null 방지.
  const notVerified = (changes.new_features || [])
    .filter((n) => n && n.provenance === "inferred")
    .map((n) => n.id)
    .filter((id) => typeof id === "string" && id.length > 0);

  // clean: 모든 diff 게이트 통과 && manual approve(missed 0) && llm 실행되고 전부 pass.
  // 하나라도 안 서면 false — authored true 금지, 전부 계산.
  const clean = diff.allPass && manual.allPass && llm.ran && llm.allPass;

  return {
    run,
    site,
    stamp: stamp ?? null,
    surface_version: changes.surface_version ?? null,
    counts: {
      surface: counts.surface ?? null,
      integrated: counts.integrated ?? null,
      new: counts.new ?? null,
      new_with_pii: counts.new_with_pii ?? null,
      policy_hold: counts.policy_hold ?? null,
      new_inferred: counts.new_inferred ?? null,
      removed: Array.isArray(changes.removed) ? changes.removed.length : (counts.removed ?? 0),
    },
    gates: {
      diff: diff.text,
      manual_deterministic: manual.text,
      llm_semantic: llm.text,
    },
    not_verified: notVerified,
    produced: opts.produced ?? [],
    generated_by: "build_receipt",
    clean,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.changes || !args.verdict) {
    process.stderr.write(
      "build_receipt: required --changes <p> --verdict <p> [--reviews <dir>] [--out <p>] [--stamp <s>] [--site <s>]\n",
    );
    process.exit(1);
  }

  const changes = loadJson(args.changes);
  const verdict = loadJson(args.verdict);
  const reviews = typeof args.reviews === "string" ? loadReviews(args.reviews) : null;

  // produced: --out 이 있으면 그 디렉토리를, 없으면 changes 파일이 있는 디렉토리를 스캔.
  const outPath = typeof args.out === "string" ? args.out : null;
  const scanDir = outPath ? dirname(outPath) : dirname(args.changes);
  const selfName = outPath ? basename(outPath) : "run-receipt.json";
  const produced = scanProduced(scanDir, selfName);

  const receipt = buildReceipt(changes, verdict, reviews, {
    stamp: typeof args.stamp === "string" ? args.stamp : undefined,
    site: typeof args.site === "string" ? args.site : undefined,
    produced,
  });

  const json = JSON.stringify(receipt, null, 2) + "\n";
  if (outPath) writeFileSync(outPath, json);
  process.stdout.write(json);

  // clean:false 여도 receipt 산출은 성공(정직한 실패 기록). exit 0.
  process.exit(0);
}

// 직접 실행일 때만 main (import 재사용 시 부작용 없음).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
