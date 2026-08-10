'use strict'

const express = require('express')
const { AuthorizationCode } = require('simple-oauth2')
const createAuthMiddleware = require('./auth')
const createCallbackMiddleware = require('./callback')
const { verifyOrganizationMembership } = require('./github')

function requireValue (env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function parseOrigins (value) {
  const origins = value.split(',').map(origin => origin.trim()).filter(Boolean)
  if (origins.length === 0) throw new Error('ORIGINS must contain at least one HTTPS origin')

  return origins.map(origin => {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      throw new Error(`Invalid origin in ORIGINS: ${origin}`)
    }

    if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.pathname !== '/') {
      throw new Error(`ORIGINS entries must be exact HTTPS origins without paths: ${origin}`)
    }
    return parsed.origin
  })
}

function loadConfig (env) {
  const stateSecret = requireValue(env, 'OAUTH_STATE_SECRET')
  if (Buffer.byteLength(stateSecret) < 32) {
    throw new Error('OAUTH_STATE_SECRET must be at least 32 bytes')
  }

  const redirectUrl = requireValue(env, 'REDIRECT_URL')
  const parsedRedirect = new URL(redirectUrl)
  if (parsedRedirect.protocol !== 'https:') throw new Error('REDIRECT_URL must use HTTPS')

  const allowedOrganization = requireValue(env, 'GITHUB_ALLOWED_ORGANIZATION')
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(allowedOrganization)) {
    throw new Error('GITHUB_ALLOWED_ORGANIZATION must be a valid GitHub organization name')
  }

  const scopes = (env.SCOPES || 'public_repo,read:user,read:org').split(',').map(scope => scope.trim()).filter(Boolean)
  if (!scopes.includes('read:org')) {
    throw new Error('SCOPES must include read:org when organization access is restricted')
  }

  return {
    port: Number.parseInt(env.PORT || '3000', 10),
    provider: env.OAUTH_PROVIDER?.trim() || 'github',
    clientId: requireValue(env, 'OAUTH_CLIENT_ID'),
    clientSecret: requireValue(env, 'OAUTH_CLIENT_SECRET'),
    stateSecret,
    redirectUrl,
    origins: parseOrigins(requireValue(env, 'ORIGINS')),
    allowedOrganization,
    scopes,
    tokenHost: env.GIT_HOSTNAME?.trim() || 'https://github.com',
    tokenPath: env.OAUTH_TOKEN_PATH?.trim() || '/login/oauth/access_token',
    authorizePath: env.OAUTH_AUTHORIZE_PATH?.trim() || '/login/oauth/authorize'
  }
}

function createOAuthClient (config) {
  return new AuthorizationCode({
    client: { id: config.clientId, secret: config.clientSecret },
    auth: {
      tokenHost: config.tokenHost,
      tokenPath: config.tokenPath,
      authorizePath: config.authorizePath
    }
  })
}

function createApp (config, dependencies = {}) {
  const app = express()
  const oauth2 = dependencies.oauth2 || createOAuthClient(config)
  const verifyMembership = dependencies.verifyMembership || verifyOrganizationMembership

  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    })
    next()
  })

  app.get('/auth', createAuthMiddleware(oauth2, config))
  app.get('/callback', createCallbackMiddleware(oauth2, config, verifyMembership))
  app.get('/healthz', (req, res) => res.status(200).type('text/plain').send('ok'))
  app.get('/', (req, res) => res.type('text/plain').send('Decap CMS OAuth provider'))

  return app
}

module.exports = { createApp, createOAuthClient, loadConfig, parseOrigins }
