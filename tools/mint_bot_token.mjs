#!/usr/bin/env node
// mint_bot_token.mjs — GitHub App 설치 토큰 발급기 (외부 의존 없음, node 내장만)
// 봇 신원(channeltalk-mono-bot)으로 짧은 수명(1h) 설치 토큰을 뽑아, git-flow 가
// 그 토큰으로 PR 을 "봇 작성"으로 올린다 → 사람(dalsoop)이 approve 가능.
//
// 입력(env):
//   GH_APP_ID                 GitHub App ID (예: 4221620)
//   GH_APP_INSTALLATION_ID    설치 ID (예: 144546315)
//   GH_APP_PRIVATE_KEY        PEM 본문 (Infisical 에서 주입 시) — 또는
//   GH_APP_PRIVATE_KEY_PATH   PEM 파일 경로 (로컬 파일 사용 시)
// 출력: stdout 에 설치 토큰 문자열만. 사용: TOKEN=$(node tools/mint_bot_token.mjs)
//
// 이건 워크플로가 아니라 일반 CLI 라 Date.now/fetch/fs 사용 정상(결정성 규약 대상 아님).
import crypto from 'node:crypto'
import fs from 'node:fs'

const appId = process.env.GH_APP_ID
const installationId = process.env.GH_APP_INSTALLATION_ID
const keyInline = process.env.GH_APP_PRIVATE_KEY
const keyPath = process.env.GH_APP_PRIVATE_KEY_PATH

if (!appId || !installationId || (!keyInline && !keyPath)) {
  console.error('[mint_bot_token] 필요: GH_APP_ID, GH_APP_INSTALLATION_ID, GH_APP_PRIVATE_KEY(본문) 또는 GH_APP_PRIVATE_KEY_PATH(경로)')
  process.exit(2)
}
const privateKey = keyInline && keyInline.includes('BEGIN') ? keyInline : fs.readFileSync(keyPath, 'utf8')

const b64url = (v) => Buffer.from(v).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) })) // exp ≤ 10분
const signingInput = `${header}.${payload}`
const signer = crypto.createSign('RSA-SHA256')
signer.update(signingInput)
const jwt = `${signingInput}.${b64url(signer.sign(privateKey))}`

const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'channeltalk-mono-bot',
  },
})
if (!res.ok) {
  console.error(`[mint_bot_token] 토큰 발급 실패 ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const data = await res.json()
process.stdout.write(data.token) // 토큰만 출력 (수명 ~1h)
