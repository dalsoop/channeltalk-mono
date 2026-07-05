#!/usr/bin/env node
// scripts/record_depth.mjs — 뎁스 누적(§4.5, §5 단계4). 기계 단계.
//
// 입력: --changes <changes.json> --profile <profile.json>
//       --ledger <depth-ledger.jsonl> [--baseline <baseline.json>]
//       [--adopt <id>]... [--stamp <yymmddhhmmss>]
// 동작:
//   1. depth-ledger.jsonl 에 한 줄(§4.5) append. depth = profile.depth + 1.
//   2. profile.depth 를 +1 하여 다시 쓴다.
//   3. --adopt <id> 가 있으면 그 id 들을 baseline.integrated 에 추가(멱등, §12-B)
//      → 다음 뎁스부터 그 기능은 "신규"에서 빠진다. (--baseline 필요)
//
// 결정성: --stamp 주입 시 고정, 미주입 시에만 실시계.
// lib(순수) import: loadJson(파싱 재사용).

import { appendFileSync, writeFileSync, existsSync } from "node:fs";
import { loadJson } from "../../channeltalk-api-mock/lib/surface.mjs";

function parseArgs(argv) {
  const out = { adopt: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      if (key === "adopt") out.adopt.push(val);
      else out[key] = val;
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

// stamp(yymmddhhmmss) → ISO-ish 'at' 문자열(결정적, 시각대 없이 표기).
function stampToAt(stamp) {
  if (!/^\d{12}$/.test(stamp)) return stamp;
  const yy = stamp.slice(0, 2);
  const mm = stamp.slice(2, 4);
  const dd = stamp.slice(4, 6);
  const HH = stamp.slice(6, 8);
  const MM = stamp.slice(8, 10);
  const SS = stamp.slice(10, 12);
  return `20${yy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
}

export function buildLedgerLine(changes, prevDepth, stamp, adopt) {
  return {
    depth: prevDepth + 1,
    stamp,
    at: stampToAt(stamp),
    surface_version: changes.surface_version,
    new: changes.counts.new,
    new_with_pii: changes.counts.new_with_pii,
    adopted: adopt,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.changes || !args.profile || !args.ledger) {
    process.stderr.write(
      "record_depth: required --changes <p> --profile <p> --ledger <p> [--baseline <p>] [--adopt <id>]... [--stamp <s>]\n",
    );
    process.exit(1);
  }

  const stamp = typeof args.stamp === "string" ? args.stamp : realStamp();
  const changes = loadJson(args.changes);
  const profile = loadJson(args.profile);
  const prevDepth = Number.isInteger(profile.depth) ? profile.depth : 0;

  const line = buildLedgerLine(changes, prevDepth, stamp, args.adopt);
  appendFileSync(args.ledger, JSON.stringify(line) + "\n");

  // profile.depth += 1
  profile.depth = prevDepth + 1;
  writeFileSync(args.profile, JSON.stringify(profile, null, 2) + "\n");

  // --adopt: baseline.integrated 에 id 추가(멱등).
  let adopted = [];
  if (args.adopt.length > 0) {
    if (!args.baseline || !existsSync(args.baseline)) {
      process.stderr.write("record_depth: --adopt 는 --baseline <baseline.json> 가 필요\n");
      process.exit(1);
    }
    const baseline = loadJson(args.baseline);
    const set = new Set(Array.isArray(baseline.integrated) ? baseline.integrated : []);
    for (const id of args.adopt) {
      if (!set.has(id)) {
        set.add(id);
        adopted.push(id);
      }
    }
    baseline.integrated = [...set];
    baseline.integrated_at_surface_version = changes.surface_version;
    writeFileSync(args.baseline, JSON.stringify(baseline, null, 2) + "\n");
  }

  process.stdout.write(
    JSON.stringify({ depth: line.depth, stamp, appended: args.ledger, adopted }, null, 2) + "\n",
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
