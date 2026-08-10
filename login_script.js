'use strict'

function safeJson (value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

module.exports = ({ provider, status, content, origins }) => {
  const message = `authorization:${provider}:${status}:${JSON.stringify(content)}`
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Decap CMS authorization</title></head>
<body>
<p>Completing authorization…</p>
<script>
(() => {
  'use strict'
  const allowedOrigins = ${safeJson(origins)}
  const resultMessage = ${safeJson(message)}
  const provider = ${safeJson(provider)}

  if (!window.opener) {
    document.body.textContent = 'The authorization window could not reach its opener.'
    return
  }

  window.addEventListener('message', event => {
    if (!allowedOrigins.includes(event.origin) || event.source !== window.opener) return
    window.opener.postMessage(resultMessage, event.origin)
  })

  for (const origin of allowedOrigins) {
    window.opener.postMessage('authorizing:' + provider, origin)
  }
})()
</script>
</body>
</html>`
}
