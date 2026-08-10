'use strict'

const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')
const { createApp, loadConfig, parseOrigins } = require('../index')

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
  scopes: ['public_repo', 'read:user'],
  tokenHost: 'https://github.com',
  tokenPath: '/login/oauth/access_token',
  authorizePath: '/login/oauth/authorize'
}

async function serve (oauth2) {
  const server = createApp(config, { oauth2 }).listen(0, '127.0.0.1')
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
  const baseUrl = await serve(oauth2)
  const authResponse = await fetch(`${baseUrl}/auth`, { redirect: 'manual' })
  const cookie = authResponse.headers.get('set-cookie').split(';', 1)[0]

  const response = await fetch(`${baseUrl}/callback?code=code&state=${authorizeOptions.state}`, {
    headers: { cookie }
  })
  const page = await response.text()

  assert.equal(response.status, 200)
  assert.deepEqual(tokenOptions, { code: 'code', redirect_uri: config.redirectUrl })
  assert.match(page, /https:\/\/cms\.example\.test/)
  assert.doesNotMatch(page, /postMessage\([^)]*,\s*['"]\*['"]/)
  assert.match(page, /authorization:github:success/)
  assert.match(page, /secret-token/)
})

test('health endpoint is available without OAuth activity', async () => {
  const baseUrl = await serve({ authorizeURL: () => '' })
  const response = await fetch(`${baseUrl}/healthz`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'ok')
})
