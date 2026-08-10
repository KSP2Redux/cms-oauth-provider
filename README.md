# Decap CMS GitHub OAuth provider

A small OAuth bridge that lets Decap CMS commit to GitHub repositories. This fork is configured for the KSP2 Redux website and deployment through the existing Portainer/Caddy network.

## Security behavior

- Generates and validates a signed, short-lived OAuth `state` value.
- Uses secure, HTTP-only, same-site cookies.
- Sends the authorization result only to exact HTTPS origins in `ORIGINS`.
- Does not return provider error details or secrets to the browser.
- Runs as a non-root user in a read-only container with Linux capabilities removed.

## Local development

Copy `.env.example` to `.env`, replace all placeholder values, then run:

```sh
npm ci
npm test
npm start
```

The service exposes:

- `GET /auth` to begin GitHub authorization
- `GET /callback` as the GitHub OAuth callback
- `GET /healthz` for container health checks

## Portainer deployment

Use `compose.yml` as a Git-backed Portainer stack. Define these stack environment variables in Portainer:

- `DECAP_GITHUB_CLIENT_ID`
- `DECAP_GITHUB_CLIENT_SECRET`
- `DECAP_OAUTH_STATE_SECRET`

Generate the state secret with a cryptographically secure generator, for example:

```sh
openssl rand -base64 48
```

The stack joins the existing external `caddy_net` network. The corresponding Caddy upstream will be `cms-oauth:3000`.

The checked-in deployment settings expect:

- CMS origin: `https://ksp2redux.github.io`
- OAuth host: `https://decap-auth.rendezvous.dev`
- GitHub callback URL: `https://decap-auth.rendezvous.dev/callback`

Do not commit client secrets or the state secret.
