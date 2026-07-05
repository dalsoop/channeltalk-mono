#!/usr/bin/env node
// 결정적 에이전트-패키지 감사기 (factory-auditor 의 기계 바닥 — LLM 아님, 무한 후퇴 차단).
// 한 앱의 .claude(또는 여러 개)를 받아 skill·schema·workflow·agent frontmatter·플레이스홀더·끊긴 참조를 검사한다.
// 사용: node audit_agents.mjs <app .claude dir> [more...]
//   예) node audit_agents.mjs ../../..              (factory 자신)
//       node audit_agents.mjs /…/cardnews-creator/.claude /…/shorts-creator/.claude
// 종료코드: 이슈 있으면 1. JSON 리포트를 stdout 으로.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VALIDATOR = path.join(process.env.HOME, '.codex/skills/.system/skill-creator/scripts/quick_validate.py')
const SMOKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'smoke_run.mjs')
const targets = process.argv.slice(2)
if (!targets.length) { console.error('usage: audit_agents.mjs <app .claude dir> [more...]'); process.exit(2) }

// 주: '미완성 플레이스홀더(<x> 등)' 휴리스틱은 제거했다 — 공장 소스는 *템플릿을 논하는* 메타라
// <x> 토큰을 정당하게 포함해 오탐이 난다. "패키지가 미완성인가"의 판단은 결정적 검사가 아니라
// factory-auditor(의미 렌즈)가 본다. 여기선 기계로 확실한 것만(validate·parse·문법·frontmatter).

function read(f) { try { return fs.readFileSync(f, 'utf8') } catch { return null } }
function ls(d, ext) { try { return fs.readdirSync(d).filter(f => !ext || f.endsWith(ext)).map(f => path.join(d, f)) } catch { return [] } }

function checkFrontmatter(file) {
  const t = read(file) || ''
  const issues = []
  if (!t.startsWith('---')) issues.push('frontmatter 없음(--- 시작 아님)')
  if (!/^name:\s*\S+/m.test(t)) issues.push('name: 누락')
  if (!/^description:\s*\S+/m.test(t)) issues.push('description: 누락')
  return issues
}

function checkWorkflow(file) {
  const issues = []
  // 1) 문법: top-level return 만 에러면 통과(런타임 async-wrap). 그 외 SyntaxError 는 실패.
  try { execFileSync('node', ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] }) }
  catch (e) {
    const err = String(e.stderr || '')
    if (!/Illegal return statement/.test(err)) issues.push('워크플로 문법 오류: ' + (err.split('\n').find((l) => /Error/.test(l)) || 'unknown'))
  }
  // 2) 실행 스모크: mock 하네스로 본문을 끝까지 돌려 런타임 에러·무한루프 검출(잘 만듦→실제로 도는가).
  try {
    const out = execFileSync('node', [SMOKE, file], { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'pipe'] })
    const r = JSON.parse((out.trim().split('\n').pop()) || '{}')
    if (!r.ok) issues.push('실행 스모크 실패: ' + (r.error || 'unknown'))
  } catch (e) {
    if (e.killed || /ETIMEDOUT/.test(String(e.code))) issues.push('실행 스모크 타임아웃(무한루프 의심)')
    else { try { const r = JSON.parse(String(e.stdout || '').trim().split('\n').pop() || '{}'); issues.push('실행 스모크 실패: ' + (r.error || e.message)) } catch { issues.push('실행 스모크 실패: ' + e.message) } }
  }
  return issues
}

function checkSkill(skillDir) {
  const issues = []
  const name = path.basename(skillDir)
  if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) issues.push(`${name}: SKILL.md 없음`)
  else checkFrontmatter(path.join(skillDir, 'SKILL.md')).forEach(i => issues.push(`${name}/SKILL.md: ${i}`))
  // quick_validate
  if (fs.existsSync(VALIDATOR)) {
    try {
      const out = execFileSync('python3', [VALIDATOR, skillDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      if (!/valid/i.test(out)) issues.push(`${name}: quick_validate 통과 못 함`)
    } catch (e) { issues.push(`${name}: quick_validate 실패 — ${String(e.stdout || e.message).trim().split('\n').pop()}`) }
  }
  for (const s of ls(path.join(skillDir, 'schemas'), '.json')) {
    try { JSON.parse(read(s)) } catch (e) { issues.push(`${name}/schemas/${path.basename(s)}: JSON.parse 실패 — ${e.message}`) }
  }
  for (const w of ls(path.join(skillDir, 'workflow'), '.mjs')) {
    checkWorkflow(w).forEach(i => issues.push(`${name}/workflow/${path.basename(w)}: ${i}`))
  }
  return issues
}

function auditApp(claudeDir) {
  const issues = []
  for (const a of ls(path.join(claudeDir, 'agents'), '.md')) {
    checkFrontmatter(a).forEach(i => issues.push(`agents/${path.basename(a)}: ${i}`))
  }
  for (const sk of ls(path.join(claudeDir, 'skills'))) {
    if (fs.statSync(sk).isDirectory()) issues.push(...checkSkill(sk))
  }
  return issues
}

const report = []
let failed = 0
for (const t of targets) {
  const claudeDir = fs.existsSync(path.join(t, 'agents')) || fs.existsSync(path.join(t, 'skills')) ? t : path.join(t, '.claude')
  const issues = auditApp(claudeDir)
  report.push({ target: claudeDir, ok: issues.length === 0, issues })
  if (issues.length) failed++
}
console.log(JSON.stringify({ pass: failed === 0, audited: report.length, with_issues: failed, report }, null, 2))
process.exit(failed ? 1 : 0)
