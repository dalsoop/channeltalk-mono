#!/usr/bin/env node
// scripts/diff_surface.mjs — CLI: 결정적 diff + 게이트. lib 를 import 해 얇게.
// 게이트는 5개다: 4개(diff_completeness·no_fabricated_endpoint·no_secret_in_example·
// every_pii_flagged) 는 항상, 5번째 surface_in_pinned_spec 은 pin 된 실 스펙
// (ssot/channel-swagger.json)을 로컬 파일로 읽어(네트워크 0) specOps 를 뽑을 수 있을 때만.
// 스펙 파일이 없으면 정직하게 이 게이트를 생략하고 stdout summary 에 그 사실을 표기한다.
//
// 사용:
//   node scripts/diff_surface.mjs \
//     --surface  <ssot/api-surface.json> \
//     --baseline <customers/<site>/baseline.json> \
//     --profile  <customers/<site>/profile.json> \
//     [--out <dir>] [--stamp <yymmddhhmmss>]
//
// 산출: <out>/surface.snapshot.json · <out>/changes.json · <out>/run-receipt.json
// 게이트 하나라도 FAIL → exit 2. 정상 → exit 0.
//
// 결정성: --stamp 주입 시 stamp 고정(테스트/재현). 미주입 시에만 실시계(Date) 사용.
// lib(순수)는 Date/random 을 절대 쓰지 않는다 — 시각은 이 스크립트 경계에서만.

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurface, loadJson, validate } from "../lib/surface.mjs";
import { computeChanges, gatesPass } from "../lib/diff.mjs";
import { loadSpecOps } from "../lib/gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function realStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()).slice(2) +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

function die(msg, code = 1) {
  process.stderr.write(`diff_surface: ${msg}\n`);
  process.exit(code);
}

// site 유추: --site 인자 우선. 없으면 customers/<site>/{profile,baseline}.json 경로에서
// 파일이 든 디렉터리명(<site>)을 뽑는다. 그마저 못 뽑으면 changes.customer 로 폴백.
function inferSite(args, fallback) {
  if (typeof args.site === "string") return args.site;
  for (const p of [args.profile, args.baseline]) {
    if (typeof p === "string") {
      const dir = basename(dirname(p));
      if (dir && dir !== "." && dir !== "customers") return dir;
    }
  }
  return fallback;
}

// run-receipt.json 본문을 changes 에서 파생한다(단일 진실원천: changes.json).
// 순수·결정적: 시각·랜덤 없음(stamp·site 는 호출자가 주입). 테스트에서 재사용.
export function buildReceipt(changes, stamp, site) {
  return {
    stamp,
    site,
    surface_version: changes.surface_version,
    counts: {
      new: changes.counts.new,
      new_with_pii: changes.counts.new_with_pii,
      policy_hold: changes.counts.policy_hold,
      new_inferred: changes.counts.new_inferred,
      removed: changes.removed.length,
    },
    // 게이트는 changes.gates 를 그대로 반영한다(4개 항상 + surface_in_pinned_spec 은
    // specOps 를 뽑은 실행에서만 존재). 하드코딩 키 열거 대신 changes 에서 통째로 파생 —
    // 게이트가 늘어도 receipt 가 자동 동기화된다(단일 진실원천: changes.gates).
    gates: { ...changes.gates },
    not_verified: changes.new_features
      .filter((n) => n.provenance === "inferred")
      .map((n) => n.id),
    generated_by: "diff_surface",
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.surface || !args.baseline || !args.profile) {
    die("required: --surface <p> --baseline <p> --profile <p> [--out <dir>] [--stamp <s>]");
  }

  // stamp: 주입되면 고정, 아니면 실시계.
  const stamp = typeof args.stamp === "string" ? args.stamp : realStamp();

  const surface = loadSurface(args.surface);
  const baseline = loadJson(args.baseline);
  const profile = loadJson(args.profile);

  // 표면 스키마 검증(하드코딩 대신 schemas/ 참조).
  const surfaceSchema = loadJson(join(__dirname, "..", "schemas", "surface.schema.json"));
  const sv = validate(surface, surfaceSchema);
  if (!sv.ok) die("surface schema invalid:\n" + sv.errors.join("\n"), 1);

  // pin 된 실 OpenAPI 스펙을 로컬 파일로만 읽는다(네트워크 0). 있으면 specOps 를 뽑아
  // 5번째 게이트(surface_in_pinned_spec)를 켠다. 없으면 정직하게 스킵(게이트 생략)하고
  // stdout summary 의 spec_pin 에 그 사실을 표기한다.
  const specPath = typeof args.spec === "string"
    ? args.spec
    : join(__dirname, "..", "ssot", "channel-swagger.json");
  let specOps = null;
  let specPinNote;
  if (existsSync(specPath)) {
    specOps = loadSpecOps(loadJson(specPath));
    specPinNote = { spec: basename(specPath), ops: specOps.size, gate: "surface_in_pinned_spec" };
  } else {
    specPinNote = { spec: null, skipped: true, reason: `pinned spec not found at ${specPath}` };
  }

  const changes = computeChanges(surface, baseline, profile, specOps);

  // changes 스키마 자체검증(산출 계약 준수 확인).
  const changesSchema = loadJson(join(__dirname, "..", "schemas", "changes.schema.json"));
  const cv = validate(changes, changesSchema);
  if (!cv.ok) die("computed changes violate schema:\n" + cv.errors.join("\n"), 1);

  const customer = changes.customer ?? "unknown";
  const outDir = typeof args.out === "string" ? args.out : join(process.cwd(), "out", `${stamp}-${customer}`);
  mkdirSync(outDir, { recursive: true });

  const snapshotPath = join(outDir, "surface.snapshot.json");
  const changesPath = join(outDir, "changes.json");
  writeFileSync(snapshotPath, JSON.stringify(surface, null, 2) + "\n");
  writeFileSync(changesPath, JSON.stringify(changes, null, 2) + "\n");

  // run-receipt.json — 실행 감사 영수증. changes.json 에서 파생(SSOT 일치 유지).
  // 결정적: stamp 는 --stamp 인자(위에서 고정), Date.now/random 없음.
  // not_verified: provenance=inferred 인 신규 id (라이브 검증 안 된 추론분).
  const receipt = buildReceipt(changes, stamp, inferSite(args, customer));
  const receiptPath = join(outDir, "run-receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

  const pass = gatesPass(changes);
  process.stdout.write(
    JSON.stringify(
      {
        stamp,
        out: outDir,
        counts: changes.counts,
        gates: changes.gates,
        gate_offenders: changes.gate_offenders,
        spec_pin: specPinNote,
        pass,
      },
      null,
      2,
    ) + "\n",
  );

  if (!pass) process.exit(2); // §11: 게이트 FAIL → exit 2
  process.exit(0);
}

// CLI 로 직접 실행될 때만 main() 을 돈다. 모듈로 import(테스트에서 buildReceipt 재사용)될
// 때는 실행하지 않는다 — top-level 부수효과(process.exit) 방지.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
