// test/cases/surface.mjs — 시드 스키마 유효성(게이트 전 전제).
import { validate } from "../../lib/surface.mjs";

export function run({ record, surface, surfaceSchema }) {
  // ── 0. 시드 스키마 유효성 ────────────────────────────────────────
  const v = validate(surface, surfaceSchema);
  record(
    "surface_schema_valid",
    { file: "ssot/api-surface.json" },
    { ok: true, errorCount: 0 },
    { ok: v.ok, errorCount: v.errors.length },
  );
}
