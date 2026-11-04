const crypto = require('crypto');
const config = require('../config');

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Department-only routes. The client sends the staff key either as
 * `x-staff-key` or as `Authorization: Bearer <key>`.
 *
 * Without STAFF_API_KEY configured the API stays usable for local development
 * and demos, but logs a warning at boot (see config.js).
 */
const requireStaff = (req, res, next) => {
  if (!config.staffApiKey) {
    req.staff = { authenticated: false, demo: true };
    return next();
  }

  const header = req.get('x-staff-key') || '';
  const bearer = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const provided = header || bearer;

  if (!provided || !safeEqual(provided, config.staffApiKey)) {
    return res.status(401).json({
      error: 'Staff sign-in required',
      hint: 'Send the department key in the x-staff-key header.',
    });
  }

  req.staff = { authenticated: true };
  return next();
};

module.exports = { requireStaff };
