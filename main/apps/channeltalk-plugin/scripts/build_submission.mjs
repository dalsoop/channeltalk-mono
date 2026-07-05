#!/usr/bin/env node
// scripts/build_submission.mjs — 단일 소스에서 Codex 플러그인 제출 트리 조립(§10).
// 무의존(node 표준 라이브러리만). 결정적(네트워크·랜덤 없음, mtime 은 fs 가 붙임).
//
// 소스(단일 원본):
//   plugin-src/.codex-plugin/plugin.json          ← 매니페스트
//   skill-src/SKILL.md                             ← 런타임 스킬(조립의 원본)
//   README-src/README.md                           ← 제출 설명(질문 5문항 + 검증)
//   ../channeltalk-api-mock/{lib,ssot,schemas,test,scripts/diff_surface.mjs}
//   ../channeltalk-integration-researcher/{scripts/{verify_manual,record_depth}.mjs,.claude/agents,customers}
//   ../logs (repo 루트 logs) — 무편집 복사
//
// 산출(제출 루트 = out/):
//   out/src/.codex-plugin/plugin.json
//   out/src/skills/channeltalk-integration-researcher/
//       SKILL.md · lib/ · ssot/ · schemas/ · test/ · scripts/{diff_surface,verify_manual,record_depth}.mjs
//       agents/*.md · customers/<site>/{profile,baseline}.json
//   out/README.md
//   out/logs/<tool>/<session>.jsonl
//   out/submission.zip   (zip CLI 있으면)
//
// import 재작성(중요): verify_manual.mjs·record_depth.mjs 는 원래 형제 앱
//   ../../channeltalk-api-mock/lib/ 를 import 한다. 조립 트리에선 lib 가 같은 스킬 아래이므로
//   그 상대경로를 ../lib/ 로 rewrite 한다. diff_surface.mjs·test/run.mjs 는 이미 ../lib/·../schemas/·../ssot/
//   를 쓰므로(스킬 루트 아래 scripts/ · test/ 배치에서 그대로 맞음) 재작성하지 않는다.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 경로 앵커(하드코딩 대신 이 스크립트 위치 기준 상대) ─────────────
const PLUGIN_ROOT = join(__dirname, ".."); // channeltalk-plugin/
const APPS_ROOT = join(PLUGIN_ROOT, ".."); // main/apps/
const REPO_ROOT = join(APPS_ROOT, "..", ".."); // main/ 상위 = repo 루트(logs/ 위치)

const MOCK = join(APPS_ROOT, "channeltalk-api-mock");
const RESEARCHER = join(APPS_ROOT, "channeltalk-integration-researcher");

const SKILL_NAME = "channeltalk-integration-researcher";

const OUT = join(PLUGIN_ROOT, "out");
const SRC = join(OUT, "src");
const SKILL_DIR = join(SRC, "skills", SKILL_NAME);

const created = [];
function note(p) {
  created.push(relative(PLUGIN_ROOT, p));
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

// 파일 복사(단순).
function copyFile(from, to) {
  ensureDir(dirname(to));
  cpSync(from, to);
  note(to);
}

// 디렉터리 통째 복사(재귀). filter(rel)=false 면 제외.
function copyDir(from, to, filter) {
  ensureDir(to);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (filter && !filter(entry.name, entry.isDirectory())) continue;
    if (entry.isDirectory()) copyDir(src, dst, filter);
    else {
      cpSync(src, dst);
      note(dst);
    }
  }
}

// import 경로 재작성 후 복사: 형제 앱 lib import 를 조립 트리 상대(../lib/)로.
// 원래: "../../channeltalk-api-mock/lib/<x>.mjs"  →  조립: "../lib/<x>.mjs"
function copyMjsRewritten(from, to) {
  let text = readFileSync(from, "utf8");
  const before = text;
  text = text.replace(/\.\.\/\.\.\/channeltalk-api-mock\/lib\//g, "../lib/");
  ensureDir(dirname(to));
  writeFileSync(to, text);
  note(to);
  return { rewritten: text !== before };
}

function die(msg) {
  process.stderr.write(`build_submission: ${msg}\n`);
  process.exit(1);
}

// ── 소스 존재 확인(누락이면 조용히 빈 트리 만들지 않도록) ──────────
function requirePath(p, label) {
  if (!existsSync(p)) die(`missing ${label}: ${p}`);
  return p;
}

function main() {
  // 사전 검증: 필수 소스.
  const pluginJson = requirePath(
    join(PLUGIN_ROOT, "plugin-src", ".codex-plugin", "plugin.json"),
    "plugin.json source",
  );
  const skillMd = requirePath(join(PLUGIN_ROOT, "skill-src", "SKILL.md"), "SKILL.md source");
  const readme = requirePath(join(PLUGIN_ROOT, "README-src", "README.md"), "README.md source");
  requirePath(join(MOCK, "lib"), "mock lib/");
  requirePath(join(MOCK, "ssot", "api-surface.json"), "mock ssot/");
  requirePath(join(MOCK, "schemas"), "mock schemas/");
  requirePath(join(MOCK, "test", "run.mjs"), "mock test/run.mjs");
  requirePath(join(MOCK, "scripts", "diff_surface.mjs"), "diff_surface.mjs");
  requirePath(join(RESEARCHER, "scripts", "verify_manual.mjs"), "verify_manual.mjs");
  requirePath(join(RESEARCHER, "scripts", "record_depth.mjs"), "record_depth.mjs");
  requirePath(join(RESEARCHER, ".claude", "agents"), "researcher agents/");
  requirePath(join(RESEARCHER, "customers"), "researcher customers/");

  // 깨끗한 staging.
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  ensureDir(SKILL_DIR);

  // 1) 매니페스트.
  copyFile(pluginJson, join(SRC, ".codex-plugin", "plugin.json"));

  // 2) SKILL.md(조립 원본).
  copyFile(skillMd, join(SKILL_DIR, "SKILL.md"));

  // 3) 엔진(mock): lib / ssot / schemas / test → 스킬 아래로 그대로.
  copyDir(join(MOCK, "lib"), join(SKILL_DIR, "lib"));
  copyDir(join(MOCK, "ssot"), join(SKILL_DIR, "ssot"));
  copyDir(join(MOCK, "schemas"), join(SKILL_DIR, "schemas"));
  copyDir(join(MOCK, "test"), join(SKILL_DIR, "test")); // test/run.mjs 는 ../lib·../ssot·../schemas 참조 → 그대로 맞음

  // 4) scripts: diff_surface(그대로) + verify_manual/record_depth(import 재작성).
  const scriptsDir = join(SKILL_DIR, "scripts");
  copyFile(join(MOCK, "scripts", "diff_surface.mjs"), join(scriptsDir, "diff_surface.mjs"));
  const rw1 = copyMjsRewritten(
    join(RESEARCHER, "scripts", "verify_manual.mjs"),
    join(scriptsDir, "verify_manual.mjs"),
  );
  const rw2 = copyMjsRewritten(
    join(RESEARCHER, "scripts", "record_depth.mjs"),
    join(scriptsDir, "record_depth.mjs"),
  );
  if (!rw1.rewritten) die("verify_manual.mjs: expected import rewrite but none applied");
  if (!rw2.rewritten) die("record_depth.mjs: expected import rewrite but none applied");

  // 5) 역할 에이전트 md(.claude/agents → agents/).
  copyDir(join(RESEARCHER, ".claude", "agents"), join(SKILL_DIR, "agents"), (name, isDir) =>
    isDir ? true : name.endsWith(".md"),
  );

  // 6) 고객사 상태(profile/baseline). out/ 산출·depth-ledger 는 재생성물이라 제외.
  copyDir(join(RESEARCHER, "customers"), join(SKILL_DIR, "customers"), (name, isDir) =>
    isDir ? true : name.endsWith(".json"),
  );

  // 7) README(제출 루트) + logs(무편집 복사, repo 루트 logs/).
  copyFile(readme, join(OUT, "README.md"));
  const logsSrc = join(REPO_ROOT, "logs");
  let logsCopied = 0;
  if (existsSync(logsSrc)) {
    copyDir(logsSrc, join(OUT, "logs"), (name) => !name.startsWith("."));
    // 대략 개수(파일만).
    const countFiles = (dir) => {
      let n = 0;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) n += countFiles(join(dir, e.name));
        else n++;
      }
      return n;
    };
    logsCopied = existsSync(join(OUT, "logs")) ? countFiles(join(OUT, "logs")) : 0;
  }

  // 8) submission.zip (zip CLI 있으면; 없으면 트리만).
  let zipStatus = "skipped (no zip CLI)";
  const zipPath = join(OUT, "submission.zip");
  try {
    // out 안에서 src/ README.md logs/ 만 담는다(zip 자기 자신 제외).
    const args = ["-r", "-q", "submission.zip", "src", "README.md"];
    if (existsSync(join(OUT, "logs"))) args.push("logs");
    execFileSync("zip", args, { cwd: OUT });
    zipStatus = existsSync(zipPath) ? `ok (${statSync(zipPath).size} bytes)` : "zip ran but no file";
    if (existsSync(zipPath)) note(zipPath);
  } catch (e) {
    zipStatus = `skipped (${e.code || e.message})`;
  }

  process.stdout.write(
    JSON.stringify(
      {
        staging: relative(PLUGIN_ROOT, SRC),
        skill_dir: relative(PLUGIN_ROOT, SKILL_DIR),
        rewrites: { "verify_manual.mjs": rw1.rewritten, "record_depth.mjs": rw2.rewritten },
        logs_files: logsCopied,
        zip: zipStatus,
        files: created.length,
      },
      null,
      2,
    ) + "\n",
  );
}

main();
