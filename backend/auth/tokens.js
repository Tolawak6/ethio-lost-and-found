/**
 * Signed session tokens (stateless, HMAC-SHA256).
 *
 * Format: base64url(payload).base64url(hmac)
 * The payload carries the staff account id, so `requireStaff` can look the
 * account up and honour revocation.
 */
const crypto = require('crypto');

const base64url = (buffer) => Buffer.from(buffer).toString('base64url');
const fromBase64url = (value) => Buffer.from(value, 'base64url');

const sign = (payload, secret) =>
  crypto.createHmac('sha256', secret).update(payload).digest();

/**
 * @param {object} payload  { sub: staffId, exp: epochMs, name, depot }
 * @param {string} secret   server secret
 */
const createToken = (payload, secret) => {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${base64url(sign(body, secret))}`;
};

/**
 * Returns the payload when the signature is valid and the token is unexpired,
 * otherwise null. Never throws.
 */
const verifyToken = (token, secret, now = Date.now()) => {
  if (typeof token !== 'string') return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  let provided;
  try {
    provided = fromBase64url(signature);
  } catch {
    return null;
  }

  const expected = sign(body, secret);
  if (provided.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(provided, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64url(body).toString('utf8'));
  } catch {
    return null;
  }

  if (!payload || typeof payload.exp !== 'number' || payload.exp <= now) return null;
  return payload;
};

module.exports = { createToken, verifyToken };
