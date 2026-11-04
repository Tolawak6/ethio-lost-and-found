const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Resolves the secret used to sign session tokens.
 *
 * Precedence:
 *   1. SESSION_SECRET from the environment (always wins)
 *   2. a random secret persisted in .session-secret for development, so a
 *      restart — which `node --watch` does on every file save — does not sign
 *      everybody out
 *   3. a purely random in-memory secret as a last resort (read-only filesystem)
 *
 * Production never falls back: a missing SESSION_SECRET there would mean every
 * deploy silently invalidates all sessions.
 */
const SECRET_FILE = path.join(__dirname, '..', '.session-secret');

const readOrCreateDevSecret = () => {
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) return { secret: existing, persisted: true };
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, `${generated}\n`, { mode: 0o600 });
    return { secret: generated, persisted: true };
  } catch {
    return { secret: crypto.randomBytes(32).toString('hex'), persisted: false };
  }
};

/**
 * @param {object} options
 * @param {string} [options.fromEnv] value of process.env.SESSION_SECRET
 * @param {boolean} options.isProduction
 * @param {boolean} [options.quiet] skip logging (tests)
 * @returns {string} the signing secret
 */
const resolveSessionSecret = ({ fromEnv, isProduction, quiet = false }) => {
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  if (isProduction) {
    if (!quiet) {
      console.warn(
        '[config] SESSION_SECRET is not set. Using a temporary secret — everyone will be ' +
          'signed out on the next restart. Set SESSION_SECRET in production.'
      );
    }
    return crypto.randomBytes(32).toString('hex');
  }

  const { secret, persisted } = readOrCreateDevSecret();
  if (!quiet) {
    console.log(
      persisted
        ? `[config] SESSION_SECRET not set — using the development secret in ${path.basename(SECRET_FILE)} (sessions survive restarts).`
        : '[config] SESSION_SECRET not set — using a temporary secret (sessions end on restart).'
    );
  }
  return secret;
};

module.exports = { resolveSessionSecret, SECRET_FILE };
