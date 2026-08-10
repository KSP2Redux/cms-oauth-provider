'use strict'

require('dotenv').config()

const { createApp, loadConfig } = require('./index')

function start () {
  const config = loadConfig(process.env)
  const app = createApp(config)

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Decap CMS OAuth provider listening on port ${config.port}`)
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
