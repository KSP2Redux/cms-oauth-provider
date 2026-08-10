# Decap CMS GitHub OAuth provider

A small OAuth bridge that lets Decap CMS commit to GitHub repositories. This fork is configured for the KSP2 Redux website and deployment through the existing Portainer/Caddy network.

## Security behavior

- Generates and validates a signed, short-lived OAuth `state` value.
- Uses secure, HTTP-only, same-site cookies.
- Sends the authorization result only to exact HTTPS origins in `ORIGINS`.
- Returns a token only for active members of the configured GitHub organization.
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

At startup, the service logs its package version and configured GitHub
organization. This makes it easy to confirm a successful rebuild in Portainer's
container log view.

## Portainer deployment

Use `compose.yml` as a Git-backed Portainer stack. Define these stack environment variables in Portainer:

- `DECAP_GITHUB_CLIENT_ID`
- `DECAP_GITHUB_CLIENT_SECRET`
- `DECAP_OAUTH_STATE_SECRET`
- `DECAP_REDIRECT_URL` — the complete OAuth callback URL, including `/callback`
- `DECAP_ALLOWED_ORIGINS` — comma-separated exact HTTPS origins allowed to receive the result
- `DECAP_GITHUB_ALLOWED_ORGANIZATION` — GitHub organization whose active members may log in

Generate the state secret with a cryptographically secure generator, for example:

```sh
openssl rand -base64 48
```

The stack joins the existing external `caddy_net` network. The corresponding Caddy upstream will be `cms-oauth:3000`.
The Compose service uses `pull_policy: build`, which tells Docker Compose to
rebuild the local image during a stack redeployment even if an older image is
already present.

For example, an OAuth service at `https://cms-auth.example.com` serving a CMS at
`https://cms.example.com` would use:

```ini
DECAP_REDIRECT_URL=https://cms-auth.example.com/callback
DECAP_ALLOWED_ORIGINS=https://cms.example.com
DECAP_GITHUB_ALLOWED_ORGANIZATION=example-organization
```

`DECAP_REDIRECT_URL` must exactly match the callback URL registered in the
GitHub OAuth App. Origins must not contain a path or trailing slash.
The provider requests GitHub's read-only `read:org` scope so private as well as
public organization memberships can be checked. Pending members and outside
collaborators are denied.

Do not commit client secrets or the state secret.
