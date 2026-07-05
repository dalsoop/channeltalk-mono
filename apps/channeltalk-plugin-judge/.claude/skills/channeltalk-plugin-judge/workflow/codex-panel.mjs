#!/usr/bin/env node
// codex-panel.mjs — Codex CLI 런타임용 판정 패널 러너 (judge-panel.mjs 의 Codex 판).
//
// judge-panel.mjs 는 Claude Workflow(agent()/parallel() 글로벌, 런타임 async-wrap)로 5인 패널을 돈다.
// 이 파일은 같은 역할·프롬프트·스키마를 `codex exec` 5개 병렬 프로세스 + 종합 1개로 돌리는 순수 node CLI다.
// 두 런타임 동일 결과 계약: { verdicts:[≤5], synthesis }. maker≠checker(대상 직접 read, 채점만).
//
// 사용:
//   node codex-panel.mjs                 # 5인 전원 + 종합
//   node codex-panel.mjs --only redteam-skeptic   # 1인 스모크(경로·인증 확인용)
//   node codex-panel.mjs --judges 2      # 앞 N인만
//   node codex-panel.mjs --no-synth      # 종합 생략
// 산출: <APP>/out/codex-<stamp>/{judge-*.json, synthesis.json, report.json, *.log}  (gitignore)
//
// 전제: `codex login` 완료. codex exec 는 TTY 아니면 stdin 대기 → stdio ignore 로 막는다.
//       --output-schema 는 OpenAI strict → 정본 스키마에서 strict 사본을 파생(additionalProperties:false + 전체 required,
//       미지원 검증키 minimum/maximum/minItems/... 제거). 정본 스키마 파일은 건드리지 않는다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// workflow/ → channeltalk-plugin-judge(skill) → skills → .claude → APP
const APP = resolve(__dirname, "..", "..", "..", "..");
const REPO = resolve(APP, "..", "..");
const SKILL = resolve(__dirname, ".."); // .claude/skills/channeltalk-plugin-judge
const RUBRIC = join(SKILL, "references", "judging-rubric.md");
const SCHEMA_DIR = join(SKILL, "schemas");
const TARGET = join(APP, "target", "submission-pointer.md");
const AGENTS_DIR = join(APP, ".claude", "agents");

// ── CLI ──
const argv = process.argv.slice(2);
function flag(name) { return argv.includes(`--${name}`); }
function opt(name) { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : null; }
const ONLY = opt("only");
const NJUDGES = opt("judges") ? Number(opt("judges")) : null;
const NO_SYNTH = flag("no-synth");

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(2, 12); // YYMMDDHHMM
const OUT = join(APP, "out", `codex-${stamp}`);
mkdirSync(OUT, { recursive: true });

// ── OpenAI strict 사본 파생 (정본 불변) ──
const DROP = new Set(["minimum","maximum","minItems","maxItems","minLength","maxLength","pattern","format","$schema","$id","title","default"]);
function strictify(node) {
  if (Array.isArray(node)) return node.map(strictify);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) { if (!DROP.has(k)) out[k] = strictify(v); }
    if (out.type === "object" && out.properties) {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties);
    }
    return out;
  }
  return node;
}
function deriveStrict(name) {
  const strict = strictify(JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.schema.json`), "utf8")));
  const p = join(OUT, `_strict.${name}.json`);
  writeFileSync(p, JSON.stringify(strict, null, 2));
  return p;
}
const PANEL_SCHEMA = deriveStrict("panel-verdict");
const SYNTH_SCHEMA = deriveStrict("synthesis");

const ALL_JUDGES = ["hackathon-judge","domain-pm-reviewer","senior-architect-reviewer","redteam-skeptic","ax-ai-native-reviewer"];
let JUDGES = ALL_JUDGES;
if (ONLY) JUDGES = ALL_JUDGES.filter((j) => j === ONLY);
else if (NJUDGES) JUDGES = ALL_JUDGES.slice(0, NJUDGES);
if (JUDGES.length === 0) { console.error(`no judges matched (--only ${ONLY})`); process.exit(2); }

function judgePrompt(name) {
  return `너는 심사관 "${name}" 다. 네 역할 정의(정본)를 그대로 따른다: 먼저 ${join(AGENTS_DIR, name + ".md")} 를 읽어라.
루브릭 SSOT: ${RUBRIC}. 심사 대상 포인터: ${TARGET}.
대상을 직접 읽고(제출자 주장 불신, 필요하면 테스트 실제 실행) 네 담당 축을 근거(file:line/실행출력) 기반으로 채점하라.
panel-verdict 스키마를 따르는 JSON 하나만 최종 메시지로 반환. judge 필드는 "${name}".`;
}

function runCodex({ label, prompt, schemaFile, outFile, logFile, timeoutMs }) {
  return new Promise((res) => {
    const args = ["exec","-s","read-only","--skip-git-repo-check","-C",REPO,
      "--output-schema",schemaFile,"-o",outFile,"--color","never",prompt];
    const t0 = Date.now();
    const child = spawn("codex", args, { stdio: ["ignore","pipe","pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      writeFileSync(logFile, `# ${label}\n# exit=${code} timedOut=${timedOut} ms=${Date.now() - t0}\n\n${out}\n----STDERR----\n${err}`);
      let valid = false, parsed = null, parseError = null;
      try { if (existsSync(outFile)) { parsed = JSON.parse(readFileSync(outFile, "utf8")); valid = true; } }
      catch (e) { parseError = String(e); }
      res({ label, code, timedOut, ms: Date.now() - t0, valid, parsed, parseError });
    });
  });
}
const reqOk = (o, keys) => o && keys.every((k) => k in o);
const PANEL_REQ = ["judge","dimension_scores","weaknesses","win_blocker","lens_summary"];
const SYNTH_REQ = ["weighted_overall","verdict_band","dimension_rollup","critical_weaknesses","gap_to_first","win_probability","honest_bottom_line"];

const T0 = Date.now();
console.log(`[codex-panel] OUT=${OUT}`);
console.log(`[codex-panel] Phase: Panel — ${JUDGES.length}인 심사관 병렬 codex exec...`);
const panel = await Promise.all(JUDGES.map((name) => runCodex({
  label: name, prompt: judgePrompt(name), schemaFile: PANEL_SCHEMA,
  outFile: join(OUT, `judge-${name}.json`), logFile: join(OUT, `judge-${name}.log`), timeoutMs: 12 * 60 * 1000,
})));
for (const r of panel) {
  const schemaOk = r.valid && reqOk(r.parsed, PANEL_REQ);
  console.log(`  judge:${r.label.padEnd(26)} exit=${r.code} ${(r.ms / 1000).toFixed(0)}s valid=${r.valid} schemaOk=${schemaOk}${r.timedOut ? " TIMEOUT" : ""}`);
}
const good = panel.filter((r) => r.valid && reqOk(r.parsed, PANEL_REQ));
console.log(`[codex-panel] 패널 ${good.length}/${JUDGES.length} 채점 완료`);

let synth = null;
if (!NO_SYNTH && good.length >= 1) {
  console.log("[codex-panel] Phase: Synthesis — 종합 심판 codex exec...");
  const verdicts = good.map((r) => r.parsed);
  const synthPrompt = `너는 종합 심판이다. 역할 정본: 먼저 ${join(AGENTS_DIR, "head-judge-synthesizer.md")} 를 읽어라. 루브릭: ${RUBRIC}.
아래 ${verdicts.length}인 패널 verdict(JSON 배열)를 근거 강도로 가중 종합해 synthesis 스키마 JSON 하나만 최종 메시지로 반환하라. 무비판 평균 금지, 독립 중복 약점은 raised_by 복수로, gap_to_first 는 구체적으로(진단만).
패널 verdict:
${JSON.stringify(verdicts, null, 2)}`;
  const r = await runCodex({
    label: "synthesis", prompt: synthPrompt, schemaFile: SYNTH_SCHEMA,
    outFile: join(OUT, "synthesis.json"), logFile: join(OUT, "synthesis.log"), timeoutMs: 10 * 60 * 1000,
  });
  console.log(`  synthesis exit=${r.code} ${(r.ms / 1000).toFixed(0)}s valid=${r.valid} schemaOk=${r.valid && reqOk(r.parsed, SYNTH_REQ)}${r.timedOut ? " TIMEOUT" : ""}`);
  synth = r;
}

const report = {
  stamp, out: OUT, total_ms: Date.now() - T0, judges_run: JUDGES.length,
  panel: panel.map((r) => ({ judge: r.label, exit: r.code, seconds: +(r.ms / 1000).toFixed(0), valid: r.valid, timedOut: r.timedOut, parseError: r.parseError })),
  panel_valid: good.length,
  synthesis: synth ? { exit: synth.code, seconds: +(synth.ms / 1000).toFixed(0), valid: synth.valid, timedOut: synth.timedOut } : null,
  weighted_overall: synth?.parsed?.weighted_overall ?? null,
  verdict_band: synth?.parsed?.verdict_band ?? null,
  loop_healthy: good.length === JUDGES.length && (NO_SYNTH || !!synth?.valid),
};
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n[codex-panel] === LOOP ${report.loop_healthy ? "HEALTHY ✅" : "INCOMPLETE ⚠️"} ===`);
console.log(`[codex-panel] panel_valid=${good.length}/${JUDGES.length} synthesis_valid=${!!synth?.valid} weighted=${report.weighted_overall} band=${report.verdict_band} total=${(report.total_ms / 1000 / 60).toFixed(1)}min`);
console.log(`[codex-panel] report: ${join(OUT, "report.json")}`);
process.exit(report.loop_healthy ? 0 : 1);
