const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { hashPassword, verifyPassword } = require('../auth/passwords');
const { createToken } = require('../auth/tokens');
const { asyncHandler } = require('../middleware');
const { validateStaffCredentials, validatePasswordChange } = require('../middleware/validateStaff');

/**
 * Department authentication routes (mounted at /api/auth).
 *
 *   POST /api/auth/login    email + password -> session token
 *   POST /api/auth/logout   invalidate the cookie
 *   GET  /api/auth/me       current account (used by the admin page on load)
 *   POST /api/auth/password change the signed-in account's password
 */
const createAuthRouter = ({ staffAccounts, requireStaff, secret }) => {
  const router = express.Router();

  // Sign-in is the only endpoint an attacker can hammer; keep it tight.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
  });

  const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.sessionHours * 60 * 60 * 1000,
  });

  const issueSession = (res, account) => {
    const token = createToken(
      {
        sub: account._id,
        exp: Date.now() + config.sessionHours * 60 * 60 * 1000,
        name: account.name,
        depot: account.depot,
      },
      secret
    );
    res.cookie('staff_session', token, cookieOptions());
    return token;
  };

  router.post(
    '/login',
    loginLimiter,
    validateStaffCredentials,
    asyncHandler(async (req, res) => {
      const { email, password } = req.validatedBody;
      const account = await staffAccounts.findByEmail(email);

      // Always do the hash comparison so a missing account and a wrong password
      // take the same amount of time.
      const storedHash = account?.passwordHash || 'scrypt$16384$8$1$00$00';
      const passwordOk = await verifyPassword(password, storedHash);

      if (!account || !passwordOk || !account.active) {
        return res.status(401).json({ error: 'Email or password is incorrect' });
      }

      await staffAccounts.touchLogin(account._id);
      const token = issueSession(res, account);
      return res.json({ token, account: sanitise(account) });
    })
  );

  router.post('/logout', (req, res) => {
    res.clearCookie('staff_session', { path: '/' });
    res.json({ message: 'Signed out' });
  });

  router.get(
    '/me',
    requireStaff,
    asyncHandler(async (req, res) => {
      res.json({ account: sanitise(req.staff) });
    })
  );

  router.post(
    '/password',
    requireStaff,
    validatePasswordChange,
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = req.validatedBody;
      const account = await staffAccounts.findByEmail(req.staff.email);
      if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
        return res.status(401).json({ error: 'Your current password is incorrect' });
      }

      await staffAccounts.updatePassword(req.staff._id, await hashPassword(newPassword));
      return res.json({ message: 'Password updated' });
    })
  );

  return router;
};

/** Strips the hash and internal fields before sending an account to a client. */
const sanitise = (account) => ({
  _id: account._id,
  email: account.email,
  name: account.name,
  depot: account.depot,
  role: account.role,
  lastLoginAt: account.lastLoginAt || null,
});

module.exports = { createAuthRouter };
