#!/usr/bin/env node
// scripts/build_submission.mjs — 단일 소스에서 Codex 플러그인 제출 트리 조립(§10).
// 무의존(node 표준 라이브러리만). 결정적(네트워크·랜덤 없음, mtime 은 fs 가 붙임).
//
// 소스(authored 골격 = 최종 submission 레이아웃 그대로):
//   submission/README.md                                   ← 제출 설명(질문 5문항 + 검증)
//   submission/src/.codex-plugin/plugin.json               ← 매니페스트
//   submission/src/skills/<name>/SKILL.md                  ← 런타임 스킬
// 공유 코드(형제 앱에서 overlay):
//   ../channeltalk-api-mock/{lib,ssot,schemas,test,scripts/diff_surface.mjs}
//   ../channeltalk-integration-researcher/{scripts/{verify_manual,record_depth}.mjs,.claude/agents,customers}
//   ../channeltalk-integration-researcher/.claude/skills/channeltalk-manual-team/{references,schemas,workflow,SKILL.md}
//     → 4개 역할 에이전트 md 가 참조하는 팀 스킬(dangling 해소). 참조 경로와 정확히 일치하는 위치로 동봉.
//   ../../logs (repo 루트 logs) — 무편집 복사
//
// 산출(제출 루트 = out/):
//   out/README.md · out/src/.codex-plugin/plugin.json
//   out/src/skills/<name>/{SKILL.md,lib,ssot,schemas,test,scripts,agents,customers}
//   out/src/skills/channeltalk-manual-team/{references,schemas,workflow,SKILL.md} — 팀 참조 실체(dangling 0)
//   out/logs/<tool>/<session>.jsonl · out/submission.zip
//
// 조립 원칙: authored 골격(submission/)을 out/ 에 그대로 깔고, 그 위에 공유 코드를 얹는다.
//   authored 파일은 최종 상대경로에 이미 놓여 있으므로 파편화(-src)나 위치 재배치가 없다.
// import 재작성(중요): verify_manual.mjs·record_depth.mjs 는 형제 앱 ../../channeltalk-api-mock/lib/ 를
//   import 한다. 조립 트리에선 lib 가 같은 스킬 아래이므로 ../lib/ 로 rewrite. diff_surface·test/run 은
//   이미 ../lib·../schemas·../ssot 를 써서 스킬 루트 아래 배치 그대로 맞음(재작성 불필요).

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
// 매뉴얼 팀 스킬 — 4개 역할 에이전트 md 가 references/schemas 를 이 이름 아래로 참조(dangling 해소).
const TEAM_SKILL_NAME = "channeltalk-manual-team";
const TEAM_SRC = join(RESEARCHER, ".claude", "skills", TEAM_SKILL_NAME);

const SKELETON = join(PLUGIN_ROOT, "submission"); // authored 골격(최종 레이아웃 미러)
const OUT = join(PLUGIN_ROOT, "out");
const SRC = join(OUT, "src");
const SKILL_DIR = join(SRC, "skills", SKILL_NAME);
// 팀 스킬 조립 위치 = skills/channeltalk-manual-team/ — 4개 에이전트 md 참조 경로와 정확히 일치.
const TEAM_DIR = join(SRC, "skills", TEAM_SKILL_NAME);

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
  // 사전 검증: authored 골격 + 공유 코드.
  requirePath(join(SKELETON, "README.md"), "submission/README.md");
  requirePath(join(SKELETON, "src", ".codex-plugin", "plugin.json"), "submission/src/.codex-plugin/plugin.json");
  requirePath(
    join(SKELETON, "src", "skills", SKILL_NAME, "SKILL.md"),
    "submission/src/skills/<name>/SKILL.md",
  );
  requirePath(join(MOCK, "lib"), "mock lib/");
  requirePath(join(MOCK, "ssot", "api-surface.json"), "mock ssot/");
  requirePath(join(MOCK, "schemas"), "mock schemas/");
  requirePath(join(MOCK, "test", "run.mjs"), "mock test/run.mjs");
  requirePath(join(MOCK, "scripts", "diff_surface.mjs"), "diff_surface.mjs");
  requirePath(join(RESEARCHER, "scripts", "verify_manual.mjs"), "verify_manual.mjs");
  requirePath(join(RESEARCHER, "scripts", "record_depth.mjs"), "record_depth.mjs");
  requirePath(join(RESEARCHER, ".claude", "agents"), "researcher agents/");
  requirePath(join(RESEARCHER, "customers"), "researcher customers/");
  // 팀 스킬 참조 파일 — 4개 에이전트 md 가 skills/channeltalk-manual-team/ 아래로 참조하는 실체.
  requirePath(join(TEAM_SRC, "references", "channeltalk-manual-philosophy.md"), "team references/philosophy");
  requirePath(join(TEAM_SRC, "schemas", "accuracy-verdict.schema.json"), "team schemas/accuracy");
  requirePath(join(TEAM_SRC, "schemas", "completeness-verdict.schema.json"), "team schemas/completeness");
  requirePath(join(TEAM_SRC, "schemas", "privacy-verdict.schema.json"), "team schemas/privacy");
  requirePath(join(TEAM_SRC, "workflow", "channeltalk-manual-loop.mjs"), "team workflow/manual-loop");

  // 깨끗한 staging.
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

  // 1) authored 골격을 out/ 에 그대로 깐다 → README.md + src/.codex-plugin/plugin.json + src/skills/<name>/SKILL.md.
  copyDir(SKELETON, OUT);

  // 2) 그 위에 공유 코드 overlay — 엔진(mock): lib / ssot / schemas / test.
  copyDir(join(MOCK, "lib"), join(SKILL_DIR, "lib"));
  copyDir(join(MOCK, "ssot"), join(SKILL_DIR, "ssot"));
  copyDir(join(MOCK, "schemas"), join(SKILL_DIR, "schemas"));
  copyDir(join(MOCK, "test"), join(SKILL_DIR, "test")); // test/run.mjs 는 ../lib·../ssot·../schemas 참조 → 그대로 맞음

  // 3) scripts: diff_surface(그대로) + verify_manual/record_depth(import 재작성).
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

  // 4) 역할 에이전트 md(.claude/agents → agents/).
  copyDir(join(RESEARCHER, ".claude", "agents"), join(SKILL_DIR, "agents"), (name, isDir) =>
    isDir ? true : name.endsWith(".md"),
  );

  // 5) 고객사 상태(profile/baseline). out/ 산출·depth-ledger 는 재생성물이라 제외.
  copyDir(join(RESEARCHER, "customers"), join(SKILL_DIR, "customers"), (name, isDir) =>
    isDir ? true : name.endsWith(".json"),
  );

  // 5b) 매뉴얼 팀 스킬 동봉(dangling 해소) — skills/channeltalk-manual-team/ 아래에
  //     references/philosophy · schemas/{accuracy,completeness,privacy}-verdict + workflow/manual-loop 를 실재화.
  //     4개 역할 에이전트 md 가 이 정확한 경로를 참조하므로 위치 그대로 복사(경로 재작성 불필요).
  copyDir(join(TEAM_SRC, "references"), join(TEAM_DIR, "references"));
  copyDir(join(TEAM_SRC, "schemas"), join(TEAM_DIR, "schemas"));
  // workflow/channeltalk-manual-loop.mjs 는 형제앱 lib import 가 없다(런타임 async-wrap·fs 금지 규약).
  //   있었다면 다른 .mjs 와 동일 규칙으로 재작성하되, 없으므로 그대로 복사.
  const teamWfRw = copyMjsRewritten(
    join(TEAM_SRC, "workflow", "channeltalk-manual-loop.mjs"),
    join(TEAM_DIR, "workflow", "channeltalk-manual-loop.mjs"),
  );
  // 팀 스킬 진입점(SKILL.md)도 동봉해 스킬을 자족형으로 — 있으면 복사.
  if (existsSync(join(TEAM_SRC, "SKILL.md"))) {
    copyFile(join(TEAM_SRC, "SKILL.md"), join(TEAM_DIR, "SKILL.md"));
  }

  // 6) logs(무편집 복사, repo 루트 logs/).
  const logsSrc = join(REPO_ROOT, "logs");
  let logsCopied = 0;
  if (existsSync(logsSrc)) {
    copyDir(logsSrc, join(OUT, "logs"), (name) => !name.startsWith("."));
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

  // 7) submission.zip (zip CLI 있으면; 없으면 트리만).
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
        skeleton: relative(PLUGIN_ROOT, SKELETON),
        staging: relative(PLUGIN_ROOT, SRC),
        skill_dir: relative(PLUGIN_ROOT, SKILL_DIR),
        rewrites: {
          "verify_manual.mjs": rw1.rewritten,
          "record_depth.mjs": rw2.rewritten,
          "channeltalk-manual-loop.mjs": teamWfRw.rewritten,
        },
        team_skill: relative(PLUGIN_ROOT, TEAM_DIR),
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
