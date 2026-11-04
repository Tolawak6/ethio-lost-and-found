/**
 * Password hashing with Node's built-in scrypt.
 *
 * Hash format: `scrypt$N$r$p$<salt-hex>$<hash-hex>`
 * Keeping the parameters in the string means old hashes still verify after a
 * future cost increase.
 */
const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SALT_BYTES = 16;

const scryptAsync = (password, salt, { N, r, p, keylen }) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p }, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });

/** Hashes a password into a self-describing string. */
const hashPassword = async (password) => {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scryptAsync(String(password), salt, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
};

/** Constant-time verification. Returns false for malformed hashes. */
const verifyPassword = async (password, stored) => {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (!salt.length || !expected.length) return false;

  let derived;
  try {
    derived = await scryptAsync(String(password), salt, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      keylen: expected.length,
    });
  } catch {
    return false;
  }

  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
};

module.exports = { hashPassword, verifyPassword };
