#!/usr/bin/env node
// scripts/diff_surface.mjs — CLI: 결정적 diff + 4게이트. lib 를 import 해 얇게.
//
// 사용:
//   node scripts/diff_surface.mjs \
//     --surface  <ssot/api-surface.json> \
//     --baseline <customers/<site>/baseline.json> \
//     --profile  <customers/<site>/profile.json> \
//     [--out <dir>] [--stamp <yymmddhhmmss>]
//
// 산출: <out>/surface.snapshot.json · <out>/changes.json
// 게이트 하나라도 FAIL → exit 2. 정상 → exit 0.
//
// 결정성: --stamp 주입 시 stamp 고정(테스트/재현). 미주입 시에만 실시계(Date) 사용.
// lib(순수)는 Date/random 을 절대 쓰지 않는다 — 시각은 이 스크립트 경계에서만.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurface, loadJson, validate } from "../lib/surface.mjs";
import { computeChanges, gatesPass } from "../lib/diff.mjs";

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

  const changes = computeChanges(surface, baseline, profile);

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

  const pass = gatesPass(changes);
  process.stdout.write(
    JSON.stringify(
      {
        stamp,
        out: outDir,
        counts: changes.counts,
        gates: changes.gates,
        gate_offenders: changes.gate_offenders,
        pass,
      },
      null,
      2,
    ) + "\n",
  );

  if (!pass) process.exit(2); // §11: 게이트 FAIL → exit 2
  process.exit(0);
}

main();
