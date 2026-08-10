'use strict'

const generateLoginPage = require('./login_script')
const { clearStateCookie, verifyStateCookie } = require('./state')

module.exports = (oauth2, config) => async (req, res) => {
  res.setHeader('Set-Cookie', clearStateCookie())

  if (!req.query.code || !req.query.state || !verifyStateCookie(req, req.query.state, config.stateSecret)) {
    return res.status(400).type('text/plain').send('Invalid OAuth callback state')
  }

  try {
    const tokenResult = await oauth2.getToken({
      code: req.query.code,
      redirect_uri: config.redirectUrl
    })
    const accessToken = tokenResult.token?.access_token
    if (!accessToken) throw new Error('OAuth provider returned no access token')

    return res.type('html').send(generateLoginPage({
      provider: config.provider,
      status: 'success',
      content: { token: accessToken, provider: config.provider },
      origins: config.origins
    }))
  } catch (error) {
    console.error(`OAuth token exchange failed: ${error.message}`)
    return res.status(502).type('html').send(generateLoginPage({
      provider: config.provider,
      status: 'error',
      content: { message: 'OAuth token exchange failed' },
      origins: config.origins
    }))
  }
}
