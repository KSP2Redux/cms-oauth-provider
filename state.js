'use strict'

const crypto = require('node:crypto')

const COOKIE_NAME = 'decap_oauth_state'
const MAX_AGE_SECONDS = 600

function createState () {
  return crypto.randomBytes(32).toString('base64url')
}

function sign (state, secret) {
  return crypto.createHmac('sha256', secret).update(state).digest('base64url')
}

function serializeStateCookie (state, secret) {
  return `${COOKIE_NAME}=${state}.${sign(state, secret)}; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`
}

function clearStateCookie () {
  return `${COOKIE_NAME}=; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function readCookie (req) {
  const cookies = (req.headers.cookie || '').split(';')
  const cookie = cookies.find(value => value.trim().startsWith(`${COOKIE_NAME}=`))
  return cookie ? cookie.trim().slice(COOKIE_NAME.length + 1) : null
}

function safeEqual (left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function verifyStateCookie (req, state, secret) {
  const cookie = readCookie(req)
  if (!cookie) return false
  const separator = cookie.lastIndexOf('.')
  if (separator < 1) return false

  const cookieState = cookie.slice(0, separator)
  const signature = cookie.slice(separator + 1)
  return safeEqual(cookieState, state) && safeEqual(signature, sign(cookieState, secret))
}

module.exports = { clearStateCookie, createState, serializeStateCookie, verifyStateCookie }
