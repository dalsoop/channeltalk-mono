#!/usr/bin/env node
// scripts/refresh_surface.mjs — pin 된 실 OpenAPI 스펙에 표면을 대조·교정해 재생성.
// 무의존·결정적. 기본은 네트워크 0 (로컬 pin ssot/channel-swagger.json 만 읽음).
//
// 사용:
//   node scripts/refresh_surface.mjs                # pin 대조 + 리포트(기본, dry-run)
//   node scripts/refresh_surface.mjs --write        # api-surface.json 재생성(교정 반영)
//   node scripts/refresh_surface.mjs --fetch        # (선택·online) source_url 에서 스펙 재다운로드해 pin 갱신
//
// 인자 관용(record_depth.mjs 규약): --key val, 값 없는 --flag 는 true.
//
// 대조/분류:
//   - 매칭: method + 정규화 path(/open/vN 제거, {param}→{}) 로 스펙 operation 집합과 대조.
//   - REST 실재  → provenance "pinned"
//   - webhook(dir=CB) → provenance "inferred" (스펙 밖·별도 문서)
//   - 스펙에 없는 REST → CORRECTIONS 로 교정하거나 리포트(교정 없으면 제거 후보로 보고).
//
// 교정(CORRECTIONS): 실 스펙과 어긋난 손저작 흔적을 결정적으로 바로잡는다.
//   - openapi.user.upsert : method PUT → PATCH (path /users/{userId} 유지). 실 스펙은 PATCH.
//   - openapi.user.list   : 제거. 실 스펙에 목록 엔드포인트(GET /users) 자체가 없음.
//
// 정직성 경계: pinned = "공개 스펙 스냅샷(해시 고정)과 일치". "라이브 호출로 확인"이 아니다.
//
// core 루프(diff/verify/manual/test)는 이 스크립트를 호출하지 않는다. online fetch 는
// --fetch 로만 일어난다 — 기본 실행과 core 는 네트워크 0.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadJson } from "../lib/surface.mjs";
import { loadSpecOps, normalizeSpecPath, surfaceInPinnedSpec } from "../lib/gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, "..", "ssot", "channel-swagger.json");
const SURFACE_PATH = join(__dirname, "..", "ssot", "api-surface.json");
const LOCK_PATH = join(__dirname, "..", "ssot", "provenance-lock.json");

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

// ── 교정 규칙(손저작 vs 실 스펙 어긋남을 결정적으로 바로잡음) ────────
// remove: 실 스펙에 없어 표면에서 뺀다. patch: 필드를 교정한다(이유 명시).
export const CORRECTIONS = Object.freeze({
  "openapi.user.list": { action: "remove", reason: "실 스펙에 GET /users(목록) 엔드포인트 없음" },
  "openapi.user.upsert": {
    action: "patch",
    reason: "실 스펙은 PATCH /users/{userId} (PUT 아님)",
    patch: (f) => {
      f.method = "PATCH";
      if (typeof f.example_request === "string") {
        f.example_request = f.example_request.replace(/^PUT /, "PATCH ");
      }
      return f;
    },
  },
});

// 순수: 파싱된 스펙 + 현재(curated) 표면 → 재생성 표면 + 리포트. I/O 없음.
// - CORRECTIONS 적용(remove/patch)
// - 남은 feature 를 스펙 대조해 provenance 결정(REST 실재→pinned, CB→inferred)
// - spec_lock 참조·surface_version+1·note 갱신
export function buildSurface(spec, curated, lock) {
  const specOps = loadSpecOps(spec);
  const report = { removed: [], corrected: [], reclassified: [], missing: [] };

  // 1) 교정 적용 → 남은 feature 목록(표면 순서 보존 → 결정적).
  const kept = [];
  for (const orig of curated.features) {
    const rule = CORRECTIONS[orig.id];
    if (rule && rule.action === "remove") {
      report.removed.push({ id: orig.id, reason: rule.reason });
      continue;
    }
    const f = JSON.parse(JSON.stringify(orig));
    if (rule && rule.action === "patch") {
      const before = f.method;
      rule.patch(f);
      report.corrected.push({ id: f.id, reason: rule.reason, method: `${before}→${f.method}` });
    }
    kept.push(f);
  }

  // 2) provenance 재분류(REST 실재→pinned, webhook(CB)→inferred, 스펙에 없는 REST→missing 보고).
  for (const f of kept) {
    if (f.dir === "CB") {
      if (f.provenance !== "inferred") report.reclassified.push({ id: f.id, to: "inferred" });
      f.provenance = "inferred";
      continue;
    }
    const key = `${f.method} ${normalizeSpecPath(f.path)}`;
    if (specOps.has(key)) {
      if (f.provenance !== "pinned") report.reclassified.push({ id: f.id, to: "pinned" });
      f.provenance = "pinned";
    } else {
      // 교정 후에도 스펙에 없으면 정직히 보고(지어내지 않음). provenance 는 손대지 않음.
      report.missing.push({ id: f.id, key });
    }
  }

  const sha7 = lock.sha256.slice(0, 7);
  // 결정성(2회 실행 동일): 이미 같은 pin(sha256)으로 refresh 된 표면을 다시 돌리면
  // 버전을 또 올리지 않는다. 새 pin 에 대해서만 +1 한다.
  const alreadyPinned =
    curated.spec_lock && curated.spec_lock.sha256 === lock.sha256 && curated.provenance_default === "pinned";
  const surface_version = alreadyPinned ? curated.surface_version : curated.surface_version + 1;
  const surface = {
    source: curated.source,
    base_url: curated.base_url,
    provenance_default: "pinned",
    surface_version,
    note: `pinned from published swagger.json@${sha7} (${lock.spec_title} v${lock.spec_version}); pinned=공개 스펙 스냅샷 일치(해시 고정), 라이브 호출 확인 아님. webhook=inferred(스펙 밖).`,
    spec_lock: {
      sha256: lock.sha256,
      spec_version: lock.spec_version,
      op_count: lock.op_count,
    },
    features: kept,
  };
  return { surface, report };
}

// (선택·online) source_url 에서 스펙을 재다운로드해 pin 파일·lock 을 갱신한다.
// --fetch 로만 호출된다. 기본 실행·core 루프는 여기 안 온다(네트워크 0 유지).
async function refetch(lock) {
  const res = await fetch(lock.source_url);
  if (!res.ok) throw new Error(`fetch ${lock.source_url} → HTTP ${res.status}`);
  const text = await res.text();
  const sha256 = createHash("sha256").update(text).digest("hex");
  const spec = JSON.parse(text);
  let opCount = 0;
  const HTTP = ["get", "post", "put", "patch", "delete", "head", "options"];
  for (const p of Object.keys(spec.paths || {}))
    for (const m of Object.keys(spec.paths[p])) if (HTTP.includes(m)) opCount++;
  writeFileSync(SPEC_PATH, text.endsWith("\n") ? text : text + "\n");
  const nextLock = {
    ...lock,
    sha256,
    spec_title: spec.info?.title ?? lock.spec_title,
    spec_version: (spec.info?.version ?? lock.spec_version).replace(/-DIRTY$/, ""),
    op_count: opCount,
  };
  writeFileSync(LOCK_PATH, JSON.stringify(nextLock, null, 2) + "\n");
  return nextLock;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let lock = loadJson(LOCK_PATH);

  if (args.fetch) {
    process.stderr.write(`refresh_surface: --fetch → downloading ${lock.source_url} (online)\n`);
    lock = await refetch(lock);
    process.stderr.write(`refresh_surface: pin updated → sha256 ${lock.sha256.slice(0, 7)} op_count ${lock.op_count}\n`);
  }

  const spec = loadJson(SPEC_PATH);
  const curated = loadJson(SURFACE_PATH);
  const { surface, report } = buildSurface(spec, curated, lock);

  const pinned = surface.features.filter((f) => f.provenance === "pinned").length;
  const inferred = surface.features.filter((f) => f.provenance === "inferred").length;

  // pin 대조 게이트(비-inferred 가 스펙에 실재하는가) — 리포트에 명시.
  const specOps = loadSpecOps(spec);
  const inSpec = surfaceInPinnedSpec(surface.features, specOps);

  process.stdout.write(
    JSON.stringify(
      {
        spec_lock: surface.spec_lock,
        surface_version: surface.surface_version,
        counts: { total: surface.features.length, pinned, inferred },
        removed: report.removed,
        corrected: report.corrected,
        reclassified: report.reclassified,
        missing: report.missing,
        surface_in_pinned_spec: { ok: inSpec.ok, offenders: inSpec.offenders },
        written: Boolean(args.write),
      },
      null,
      2,
    ) + "\n",
  );

  if (report.missing.length > 0) {
    process.stderr.write(
      `refresh_surface: WARNING — ${report.missing.length} REST feature(s) not in pinned spec (uncorrected): ` +
        report.missing.map((m) => m.id).join(", ") +
        "\n",
    );
  }

  if (args.write) {
    writeFileSync(SURFACE_PATH, JSON.stringify(surface, null, 2) + "\n");
    process.stderr.write(`refresh_surface: wrote ${SURFACE_PATH}\n`);
  }

  // pin 대조가 깨지면(교정으로도 못 메운 가짜 REST) 비정상 종료 — 게이트에 이빨.
  process.exit(inSpec.ok ? 0 : 2);
}

// CLI 직접 실행 시에만 main(). 모듈로 import(buildSurface 테스트 재사용) 시엔 실행 안 함.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
