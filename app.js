'use strict'

require('dotenv').config({ quiet: true })

const { createApp, loadConfig } = require('./index')
const { version } = require('./package.json')

function start () {
  const config = loadConfig(process.env)
  const app = createApp(config)

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Decap CMS OAuth provider v${version} listening on port ${config.port}`)
    console.log(`Access restricted to active members of GitHub organization: ${config.allowedOrganization}`)
  })
}

if (require.main === module) {
  try {
    start()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { start }
