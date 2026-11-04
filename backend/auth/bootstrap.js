const config = require('../config');
const { hashPassword } = require('./passwords');

/**
 * Creates the first department account when the store has none.
 * Without ADMIN_EMAIL/ADMIN_PASSWORD in production nothing is created and the
 * server prints exactly what to run — never a silent open door.
 */
const ensureFirstStaffAccount = async (staffAccounts) => {
  const existing = await staffAccounts.count();
  if (existing > 0) return null;

  const { email, password, name, depot } = config.bootstrapStaff;

  if (!email || !password) {
    if (!config.isProduction) {
      console.warn('[auth] No department accounts exist and no ADMIN_EMAIL is set — /admin is closed.');
    } else {
      console.warn(
        '[auth] No department accounts exist. Set ADMIN_EMAIL and ADMIN_PASSWORD, ' +
          'or run: npm run create-staff -- --email you@depot.et --name "Your name" --password "…"'
      );
    }
    return null;
  }

  if (config.isProduction && password.length < 12) {
    console.warn('[auth] ADMIN_PASSWORD is shorter than 12 characters — choose a stronger one.');
  }

  const account = await staffAccounts.create({
    email,
    name,
    passwordHash: await hashPassword(password),
    depot,
    role: 'manager',
  });

  console.log(`[auth] created the first department account: ${account.email}`);
  if (!config.isProduction) {
    console.log(`[auth] sign in at /admin with ${email} / ${password}`);
  }
  return account;
};

module.exports = { ensureFirstStaffAccount };
