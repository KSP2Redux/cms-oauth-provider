'use strict'

async function verifyOrganizationMembership (accessToken, organization, fetchImpl = fetch) {
  const response = await fetchImpl(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(organization)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'KSP2Redux-Decap-OAuth',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  )

  if (response.status === 404) return false
  if (!response.ok) throw new Error(`GitHub membership check returned HTTP ${response.status}`)

  const membership = await response.json()
  return membership.state === 'active'
}

module.exports = { verifyOrganizationMembership }
