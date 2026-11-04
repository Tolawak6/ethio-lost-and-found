const { verifyToken } = require('../auth/tokens');

/**
 * Department authentication.
 *
 * Staff sign in at /admin with an email + password; the server returns a signed
 * session token that the browser sends as `Authorization: Bearer <token>`.
 * Permission to write is checked against the account, not a shared secret, so
 * accounts can be deactivated individually.
 */
const createRequireStaff = ({ staffAccounts, secret }) => async (req, res, next) => {
  // The browser sends the httpOnly cookie; API clients send a bearer token.
  const header = req.get('authorization') || '';
  const token = (header.replace(/^Bearer\s+/i, '').trim() || req.cookies?.staff_session || '').trim();

  if (!token) {
    return res.status(401).json({ error: 'Sign in to the department workspace' });
  }

  const payload = verifyToken(token, secret);
  if (!payload) {
    return res.status(401).json({ error: 'Your session has expired — please sign in again' });
  }

  const account = await staffAccounts.findById(payload.sub);
  if (!account) {
    // The token is valid but the account is gone (e.g. the database was reset).
    return res.status(401).json({ error: 'Your account could not be found — please sign in again', code: 'account_missing' });
  }
  if (!account.active) {
    return res.status(401).json({ error: 'This account has been disabled', code: 'account_disabled' });
  }

  // eslint-disable-next-line no-param-reassign
  req.staff = account;
  return next();
};

module.exports = { createRequireStaff };
