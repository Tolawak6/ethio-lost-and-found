#!/usr/bin/env node
/**
 * Creates a department account from the command line.
 *
 *   npm run create-staff -- --email hana@depot.et --name "Hana T." \
 *     --password "a-long-password" [--depot Merkato] [--role manager]
 *
 * Uses the same store as the server, so it writes to MongoDB when MONGO_URI is
 * set and to the in-memory store otherwise (in which case it explains that the
 * account will not persist).
 */
require('dotenv').config();

const config = require('../config');
const { createStore, connectStore } = require('../store');
const { hashPassword } = require('../auth/passwords');
const { MIN_PASSWORD_LENGTH } = require('../middleware/validateStaff');

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || '').trim().toLowerCase();
  const name = String(args.name || '').trim();
  const password = String(args.password || '');
  const depot = String(args.depot || '').trim();
  const role = args.role === 'manager' ? 'manager' : 'staff';

  const problems = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('--email must be a valid address');
  if (!name) problems.push('--name is required');
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`--password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (problems.length) {
    console.error('Cannot create the account:');
    problems.forEach((p) => console.error(`  • ${p}`));
    console.error('\nUsage: npm run create-staff -- --email <email> --name "<name>" --password "<password>" [--depot <depot>] [--role manager]');
    process.exitCode = 1;
    return;
  }

  if (!config.mongoUri) {
    console.error('MONGO_URI is not set, so there is no database to save the account to.');
    console.error('Set MONGO_URI in backend/.env (see .env.example) and run this again.');
    process.exitCode = 1;
    return;
  }

  const store = createStore({ seed: false });
  const connected = await connectStore(store);
  if (!connected) {
    console.error('Could not connect to MongoDB. Check MONGO_URI and that the database is running.');
    process.exitCode = 1;
    return;
  }

  const existing = await store.findByEmail(email);
  if (existing) {
    console.error(`An account for ${email} already exists. Use a different email.`);
    process.exitCode = 1;
    return;
  }

  const account = await store.create({ email, name, passwordHash: await hashPassword(password), depot, role });
  console.log(`Created ${account.role} account ${account.email}${account.depot ? ` (depot: ${account.depot})` : ''}.`);
  console.log('Sign in at /admin.');

  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
