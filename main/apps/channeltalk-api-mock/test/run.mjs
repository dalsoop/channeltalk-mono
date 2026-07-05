#!/usr/bin/env node
// test/run.mjs — §11 결정적 테스트 오케스트레이터. lib 순수함수만 호출(네트워크·시각 없음).
// 하네스(채점·출력)와 케이스를 분리했다 — 케이스 본문은 cases/* 에, 공용 record/report/픽스처는 harness.mjs 에.
// 신규 케이스는 도메인에 맞는 cases/*.mjs 에 추가한다(특히 secret 게이트 레드팀은 cases/secret-gate.mjs).
//
// 케이스 모듈(도메인별):
//   cases/surface.mjs      시드 스키마 유효성(게이트 전 전제)
//   cases/diff.mjs         happy · idempotent · delta · counts shape
//   cases/pii.mjs          정책 flag(전송형 hold · 수신형 mask · consent null)
//   cases/receipt.mjs      run_receipt / build_receipt 파생 정합성
//   cases/secret-gate.mjs  secret 게이트 레드팀 회귀(실토큰 CAUGHT + slug/placeholder 오탐 0)

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSurface, loadJson } from "../lib/surface.mjs";
import { createRecorder, report } from "./harness.mjs";
import * as surfaceCase from "./cases/surface.mjs";
import * as diffCase from "./cases/diff.mjs";
import * as piiCase from "./cases/pii.mjs";
import * as receiptCase from "./cases/receipt.mjs";
import * as secretGateCase from "./cases/secret-gate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE_PATH = join(__dirname, "..", "ssot", "api-surface.json");
const SURFACE_SCHEMA = join(__dirname, "..", "schemas", "surface.schema.json");

const surface = loadSurface(SURFACE_PATH);
const surfaceSchema = loadJson(SURFACE_SCHEMA);

const { results, record } = createRecorder();
const ctx = { record, surface, surfaceSchema };

// 케이스 실행(도메인 순서 — 출력은 도메인끼리 묶여 나온다).
for (const mod of [surfaceCase, diffCase, piiCase, receiptCase, secretGateCase]) {
  mod.run(ctx);
}

// 출력 + 집계 + exit.
const failures = report(results);
process.exit(failures === 0 ? 0 : 1);
