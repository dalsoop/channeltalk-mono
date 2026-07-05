# AGENTS.md — channeltalk-api-mock

**모킹·엔진 소유 앱** (§8 SSOT 대역). 채널톡 Open API v5 표면(mock)을 담고, 결정적 diff·게이트를
순수 모듈로 제공한다. `channeltalk-integration-researcher`가 이걸 소비한다(상호의존 계약 = `schemas/`).
상위 규칙은 루트 `../../../AGENTS.md`, 도메인 정본은 `../../../CHANNELTALK.md`(§8·§12).

## 원칙 (상시)
- **결정적·오프라인·무의존** — 네트워크·실키·Date.now·Math.random 금지. `lib/*`는 순수함수.
- **provenance 정직** — `mock`(문서확인)/`inferred`(추론), `verified-live` 금지.
- **하드코딩 0** — 경로는 CLI 인자, 임계·매핑은 상수모듈(SECRET_MIN_LEN·POLICY_FLAGS·SOFT_PII_FIELDS).

## Commands
```
node scripts/diff_surface.mjs --surface ssot/api-surface.json \
  --baseline <baseline.json> --profile <profile.json> [--out <dir>] [--stamp <yymmddhhmmss>]
  # 게이트 FAIL → exit 2. --out 생략 시 out/<stamp>-<customer>/
node test/run.mjs        # §11 결정적 테스트 17종 (harness + cases/{surface,diff,pii,receipt,secret-gate}.mjs)
```

## 인덱스
<!-- BEGIN AGENTS-INDEX (managed) -->
```
[channeltalk-api-mock index]|root: .
표면(SSOT 대역)| ssot/api-surface.json           (§12 시드: surface_version 4, 22 features)
스키마         | schemas/{surface,changes,verdict}.schema.json
엔진(순수)     | lib/surface.mjs  (load/validate) · lib/pii.mjs (§6 policyFlag) 
              | lib/gates.mjs   (§5.1 4게이트·findSecrets) · lib/diff.mjs (computeChanges)
CLI           | scripts/diff_surface.mjs         (→ surface.snapshot.json + changes.json)
테스트        | test/run.mjs (오케스트레이터) · test/harness.mjs · test/cases/*.mjs (§11, 17종)
```
<!-- END AGENTS-INDEX (managed) -->
