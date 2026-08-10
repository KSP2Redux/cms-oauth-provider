'use strict'

const { createState, serializeStateCookie } = require('./state')

module.exports = (oauth2, config) => (req, res) => {
  if (req.query.provider && req.query.provider !== config.provider) {
    return res.status(400).type('text/plain').send('Unsupported OAuth provider')
  }

  const state = createState()
  res.setHeader('Set-Cookie', serializeStateCookie(state, config.stateSecret))
  res.redirect(oauth2.authorizeURL({
    redirect_uri: config.redirectUrl,
    scope: config.scopes,
    state
  }))
}
