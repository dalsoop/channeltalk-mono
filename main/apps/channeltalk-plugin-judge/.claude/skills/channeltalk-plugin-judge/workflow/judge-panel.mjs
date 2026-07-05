export const meta = {
  name: 'channeltalk-plugin-judge',
  description: 'AX 해커톤 제출물(channeltalk-plugin)을 5인 전문가 패널로 독립 채점 → 종합 심판이 가중 점수·1등 간극 진단 (채점·진단만, fix 없음)',
  phases: [
    { title: 'Panel', detail: '5인 심사관 병렬 독립 채점 (maker≠checker)' },
    { title: 'Synthesis', detail: '종합 심판이 가중합·밴드·gap_to_first 진단' },
  ],
}

// 심사관 = .claude/agents/*.md 정본. 각자 대상을 직접 읽고 채점(제출자 주장 불신).
const APP = '/Users/jeonghan/Documents/WORK/WORKSPACE/apps/channeltalk-mono/main/apps/channeltalk-plugin-judge'
const RUBRIC = `${APP}/.claude/skills/channeltalk-plugin-judge/references/judging-rubric.md`
const TARGET = `${APP}/target/submission-pointer.md`

const PANEL_SCHEMA = {
  type: 'object',
  required: ['judge', 'dimension_scores', 'weaknesses', 'win_blocker', 'lens_summary'],
  properties: {
    judge: { type: 'string' },
    dimension_scores: { type: 'array', items: {
      type: 'object', required: ['dimension', 'score', 'evidence', 'reason'],
      properties: { dimension: { type: 'string' }, score: { type: 'number' }, evidence: { type: 'string' }, reason: { type: 'string' } } } },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: {
      type: 'object', required: ['severity', 'issue', 'evidence'],
      properties: { severity: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix_hint: { type: 'string' } } } },
    win_blocker: { type: 'string' },
    lens_summary: { type: 'string' },
  },
}

const SYNTH_SCHEMA = {
  type: 'object',
  required: ['weighted_overall', 'verdict_band', 'dimension_rollup', 'critical_weaknesses', 'gap_to_first', 'win_probability', 'honest_bottom_line'],
  properties: {
    weighted_overall: { type: 'number' },
    verdict_band: { type: 'string' },
    dimension_rollup: { type: 'array', items: { type: 'object' } },
    top_strengths: { type: 'array', items: { type: 'string' } },
    critical_weaknesses: { type: 'array', items: { type: 'object' } },
    gap_to_first: { type: 'string' },
    win_probability: { type: 'string' },
    win_probability_rationale: { type: 'string' },
    honest_bottom_line: { type: 'string' },
    rubric_caveat: { type: 'string' },
  },
}

const JUDGES = [
  'hackathon-judge',
  'domain-pm-reviewer',
  'senior-architect-reviewer',
  'redteam-skeptic',
  'ax-ai-native-reviewer',
]

function judgePrompt(name) {
  return `너는 심사관 "${name}" 다. 네 역할 정의(정본)를 그대로 따른다: ${APP}/.claude/agents/${name}.md 를 먼저 읽어라.
루브릭 SSOT: ${RUBRIC}. 심사 대상 포인터: ${TARGET}.
대상을 직접 읽고(제출자 주장 불신, 필요시 테스트 실제 실행) 네 담당 축을 근거(file:line/실행출력) 기반으로 채점하라.
panel-verdict 스키마를 따르는 JSON 하나만 반환. judge 필드는 "${name}".`
}

phase('Panel')
// 병렬 배리어: 종합은 5개 전부 필요.
const verdicts = (await parallel(
  JUDGES.map((name) => () =>
    agent(judgePrompt(name), { label: `judge:${name}`, phase: 'Panel', schema: PANEL_SCHEMA, agentType: name })
  )
)).filter(Boolean)

log(`패널 ${verdicts.length}/5 채점 완료`)

phase('Synthesis')
const synthesis = await agent(
  `너는 종합 심판이다. 역할 정본: ${APP}/.claude/agents/head-judge-synthesizer.md 를 따르라. 루브릭: ${RUBRIC}.
아래 5인 패널 verdict(JSON 배열)를 근거 강도로 가중 종합해 synthesis 스키마 JSON 하나만 반환하라. 무비판 평균 금지, 독립 중복 약점은 raised_by 복수로, gap_to_first 는 구체적으로(진단만).
패널 verdict:
${JSON.stringify(verdicts, null, 2)}`,
  { label: 'synthesis', phase: 'Synthesis', schema: SYNTH_SCHEMA, agentType: 'head-judge-synthesizer' }
)

return { verdicts, synthesis }
