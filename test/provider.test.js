'use strict'

const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')
const { createApp, loadConfig, parseOrigins } = require('../index')
const { verifyOrganizationMembership } = require('../github')

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
})

const config = {
  port: 3000,
  provider: 'github',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  stateSecret: '0123456789abcdef0123456789abcdef',
  redirectUrl: 'https://decap-auth.example.test/callback',
  origins: ['https://cms.example.test'],
  allowedOrganization: 'KSP2Redux',
  scopes: ['public_repo', 'read:user', 'read:org'],
  tokenHost: 'https://github.com',
  tokenPath: '/login/oauth/access_token',
  authorizePath: '/login/oauth/authorize'
}

async function serve (oauth2, dependencies = {}) {
  const server = createApp(config, {
    oauth2,
    verifyMembership: async () => true,
    ...dependencies
  }).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise(resolve => server.once('listening', resolve))
  return `http://127.0.0.1:${server.address().port}`
}

test('configuration requires exact HTTPS origins and a strong state secret', () => {
  assert.deepEqual(parseOrigins('https://one.example, https://two.example'), [
    'https://one.example',
    'https://two.example'
  ])
  assert.throws(() => parseOrigins('*.example.com'), /origin/i)
  assert.throws(() => parseOrigins('http://example.com'), /exact HTTPS origins/)
  assert.throws(() => loadConfig({
    OAUTH_CLIENT_ID: 'id',
    OAUTH_CLIENT_SECRET: 'secret',
    OAUTH_STATE_SECRET: 'short',
    REDIRECT_URL: 'https://auth.example/callback',
    ORIGINS: 'https://cms.example'
  }), /at least 32 bytes/)
})

test('configuration requires a valid organization and read:org scope', () => {
  const env = {
    OAUTH_CLIENT_ID: 'id',
    OAUTH_CLIENT_SECRET: 'secret',
    OAUTH_STATE_SECRET: '0123456789abcdef0123456789abcdef',
    REDIRECT_URL: 'https://auth.example/callback',
    ORIGINS: 'https://cms.example',
    GITHUB_ALLOWED_ORGANIZATION: 'KSP2Redux'
  }

  assert.equal(loadConfig(env).allowedOrganization, 'KSP2Redux')
  assert.throws(() => loadConfig({ ...env, GITHUB_ALLOWED_ORGANIZATION: '-invalid' }), /valid GitHub organization name/)
  assert.throws(() => loadConfig({ ...env, SCOPES: 'public_repo,read:user' }), /must include read:org/)
})

test('auth creates a per-request signed state cookie and GitHub redirect', async () => {
  const oauth2 = {
    authorizeURL: options => `https://github.com/login/oauth/authorize?state=${options.state}`
  }
  const baseUrl = await serve(oauth2)

  const response = await fetch(`${baseUrl}/auth?provider=github`, { redirect: 'manual' })
  assert.equal(response.status, 302)
  assert.match(response.headers.get('location'), /^https:\/\/github\.com\/login\/oauth\/authorize\?state=/)
  assert.match(response.headers.get('set-cookie'), /^decap_oauth_state=.*; Path=\/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
})

test('callback rejects missing or mismatched state without exchanging a token', async () => {
  let exchanges = 0
  const baseUrl = await serve({
    authorizeURL: () => '',
    getToken: async () => { exchanges++; return { token: { access_token: 'secret-token' } } }
  })

  const response = await fetch(`${baseUrl}/callback?code=code&state=wrong`)
  assert.equal(response.status, 400)
  assert.equal(exchanges, 0)
})

test('callback exchanges a valid code and targets only the configured CMS origin', async () => {
  let authorizeOptions
  let tokenOptions
  let membershipOptions
  const oauth2 = {
    authorizeURL: options => {
      authorizeOptions = options
      return `https://github.com/login/oauth/authorize?state=${options.state}`
    },
    getToken: async options => {
      tokenOptions = options
      return { token: { access_token: 'secret-token' } }
    }
  }
  const baseUrl = await serve(oauth2, {
    verifyMembership: async (token, organization) => {
      membershipOptions = { token, organization }
      return true
    }
  })
  const authResponse = await fetch(`${baseUrl}/auth`, { redirect: 'manual' })
  const cookie = authResponse.headers.get('set-cookie').split(';', 1)[0]

  const response = await fetch(`${baseUrl}/callback?code=code&state=${authorizeOptions.state}`, {
    headers: { cookie }
  })
  const page = await response.text()

  assert.equal(response.status, 200)
  assert.deepEqual(tokenOptions, { code: 'code', redirect_uri: config.redirectUrl })
  assert.deepEqual(membershipOptions, { token: 'secret-token', organization: 'KSP2Redux' })
  assert.match(page, /https:\/\/cms\.example\.test/)
  assert.doesNotMatch(page, /postMessage\([^)]*,\s*['"]\*['"]/)
  assert.match(page, /authorization:github:success/)
  assert.match(page, /secret-token/)
})

test('callback denies users without active organization membership', async () => {
  let state
  const oauth2 = {
    authorizeURL: options => {
      state = options.state
      return `https://github.com/login/oauth/authorize?state=${state}`
    },
    getToken: async () => ({ token: { access_token: 'must-not-be-returned' } })
  }
  const baseUrl = await serve(oauth2, { verifyMembership: async () => false })
  const authResponse = await fetch(`${baseUrl}/auth`, { redirect: 'manual' })
  const cookie = authResponse.headers.get('set-cookie').split(';', 1)[0]

  const response = await fetch(`${baseUrl}/callback?code=code&state=${state}`, { headers: { cookie } })
  const page = await response.text()

  assert.equal(response.status, 403)
  assert.match(page, /Access is limited to active KSP2Redux organization members/)
  assert.doesNotMatch(page, /must-not-be-returned/)
  assert.match(page, /authorization:github:error/)
})

test('GitHub membership check accepts only active memberships', async () => {
  const requests = []
  const active = await verifyOrganizationMembership('token', 'KSP2Redux', async (url, options) => {
    requests.push({ url, options })
    return new Response(JSON.stringify({ state: 'active' }), { status: 200 })
  })
  const pending = await verifyOrganizationMembership('token', 'KSP2Redux', async () => {
    return new Response(JSON.stringify({ state: 'pending' }), { status: 200 })
  })
  const missing = await verifyOrganizationMembership('token', 'KSP2Redux', async () => {
    return new Response('', { status: 404 })
  })

  assert.equal(active, true)
  assert.equal(pending, false)
  assert.equal(missing, false)
  assert.equal(requests[0].url, 'https://api.github.com/user/memberships/orgs/KSP2Redux')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token')
})

test('health endpoint is available without OAuth activity', async () => {
  const baseUrl = await serve({ authorizeURL: () => '' })
  const response = await fetch(`${baseUrl}/healthz`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'ok')
})
