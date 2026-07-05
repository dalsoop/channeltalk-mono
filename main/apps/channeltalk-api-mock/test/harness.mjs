// test/harness.mjs — 무의존 테스트 하네스. record(채점)·report(출력/집계) + 공용 픽스처.
// 각 케이스 모듈은 run(ctx) 로 이 record 를 호출한다. 프레임워크 없음(node test/run.mjs).

// 채점기: expected===actual 을 JSON 동치로 비교해 results 에 누적.
export function createRecorder() {
  const results = [];
  function record(name, input, expected, actual) {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    results.push({ name, input, expected, actual, verdict: pass ? "PASS" : "FAIL" });
  }
  return { results, record };
}

// 출력 + 집계. 실패 수를 돌려준다(run.mjs 가 exit 코드로 사용).
export function report(results) {
  let failures = 0;
  for (const r of results) {
    if (r.verdict === "FAIL") failures++;
    process.stdout.write(
      `[${r.verdict}] ${r.name}\n` +
        `  input:    ${JSON.stringify(r.input)}\n` +
        `  expected: ${JSON.stringify(r.expected)}\n` +
        `  actual:   ${JSON.stringify(r.actual)}\n`,
    );
  }
  process.stdout.write(`\n${results.length - failures}/${results.length} passed\n`);
  return failures;
}

// ── 공용 픽스처 ────────────────────────────────────────────────────
// 프로필 헬퍼.
export function profile(overrides = {}) {
  return {
    customer: "test",
    integration_stage: "none",
    pii_policy: "no-transmit",
    depth: 0,
    ...overrides,
  };
}
export function baseline(integrated = []) {
  return { customer: "test", baseline_version: 1, integrated_at_surface_version: 0, integrated };
}
