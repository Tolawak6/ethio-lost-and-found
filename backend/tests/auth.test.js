/**
 * Department authentication: passwords, tokens, sign-in, sessions and
 * account management. Runs entirely against the in-memory stores.
 */
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('path').join(__dirname, 'tmp-uploads');

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const config = require('../config');
const { createApp } = require('../app');
const { createMemoryStore } = require('../store/memoryStore');
const { createMemoryStaffAccounts } = require('../store/staffAccounts');
const { hashPassword, verifyPassword } = require('../auth/passwords');
const { createToken, verifyToken } = require('../auth/tokens');
const { ensureFirstStaffAccount } = require('../auth/bootstrap');

const SECRET = 'test-session-secret-that-is-long-enough';
let store;
let staffAccounts;
let server;
let baseUrl;

const request = async (method, urlPath, { body, token, cookies } = {}) => {
  const init = { method, headers: {} };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (cookies) init.headers.cookie = cookies;
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${urlPath}`, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
};

const signIn = async (email, password) => {
  const res = await request('POST', '/api/auth/login', { body: { email, password } });
  return res;
};

before(async () => {
  config.sessionSecret = SECRET;
  config.bootstrapStaff = { email: '', password: '', name: 'Test', depot: '' };

  store = createMemoryStore([]);
  staffAccounts = createMemoryStaffAccounts();
  store.staffAccounts = staffAccounts;

  const app = createApp(store, { serveFrontend: false });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  store.reset();
  await staffAccounts.clear();
  await staffAccounts.create({
    email: 'manager@depot.et',
    name: 'Manager Meron',
    passwordHash: await hashPassword('manager-password'),
    depot: 'Merkato',
    role: 'manager',
  });
  await staffAccounts.create({
    email: 'staff@depot.et',
    name: 'Staff Selam',
    passwordHash: await hashPassword('staff-password'),
    depot: 'Kaliti',
    role: 'staff',
  });
});

// ---------------------------------------------------------------- passwords

test('passwords hash with a salt and verify in constant time', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b, 'each hash must use a fresh salt');
  assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
});

test('malformed hashes never authenticate', async () => {
  for (const bad of ['', 'plaintext', 'scrypt$bad', 'scrypt$16384$8$1$zz$zz', null, undefined]) {
    assert.equal(await verifyPassword('anything', bad), false, String(bad));
  }
});

// ------------------------------------------------------------------- tokens

test('tokens round-trip and carry the account id', () => {
  const payload = { sub: 'acc-1', exp: Date.now() + 60_000, name: 'A', depot: 'B' };
  const token = createToken(payload, SECRET);
  const decoded = verifyToken(token, SECRET);
  assert.equal(decoded.sub, 'acc-1');
});

test('tokens are rejected when tampered with, expired or signed elsewhere', () => {
  const payload = { sub: 'acc-1', exp: Date.now() + 60_000 };
  const token = createToken(payload, SECRET);

  const [body, signature] = token.split('.');
  assert.equal(verifyToken(`${body}.${signature.slice(0, -2)}aa`, SECRET), null, 'bad signature');
  assert.equal(verifyToken(token, 'another-secret'), null, 'wrong secret');
  assert.equal(verifyToken(createToken({ ...payload, exp: Date.now() - 1000 }, SECRET), SECRET), null, 'expired');
  assert.equal(verifyToken('garbage', SECRET), null, 'garbage');
  assert.equal(verifyToken(undefined, SECRET), null, 'missing');
});

// ------------------------------------------------------------------ sign-in

test('sign-in returns a token and the account, without the hash', async () => {
  const res = await signIn('manager@depot.et', 'manager-password');
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.account.email, 'manager@depot.et');
  assert.equal(res.body.account.role, 'manager');
  assert.equal(res.body.account.depot, 'Merkato');
  assert.equal(res.body.account.passwordHash, undefined);
});

test('sign-in sets an httpOnly session cookie', async () => {
  const res = await signIn('manager@depot.et', 'manager-password');
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /staff_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
});

test('sign-in is case-insensitive on the email', async () => {
  const res = await signIn('MANAGER@DEPOT.ET', 'manager-password');
  assert.equal(res.status, 200);
});

test('a wrong password and an unknown account look identical', async () => {
  const wrongPassword = await signIn('manager@depot.et', 'nope');
  const unknown = await signIn('nobody@depot.et', 'nope');

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrongPassword.body.error, unknown.body.error);
});

test('inactive accounts cannot sign in', async () => {
  const staff = await staffAccounts.findByEmail('staff@depot.et');
  await staffAccounts.setActive(staff._id, false);

  const res = await signIn('staff@depot.et', 'staff-password');
  assert.equal(res.status, 401);
});

test('sign-in validates its input', async () => {
  const res = await request('POST', '/api/auth/login', { body: { email: 'not-an-email', password: '' } });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.email);
  assert.ok(res.body.fields.password);
});

// ----------------------------------------------------------------- session

test('/api/auth/me describes the signed-in account', async () => {
  const login = await signIn('staff@depot.et', 'staff-password');
  const res = await request('GET', '/api/auth/me', { token: login.body.token });

  assert.equal(res.status, 200);
  assert.equal(res.body.account.name, 'Staff Selam');
  assert.equal(res.body.account.depot, 'Kaliti');
});

test('/api/auth/me rejects missing or stale sessions', async () => {
  assert.equal((await request('GET', '/api/auth/me')).status, 401);

  const login = await signIn('staff@depot.et', 'staff-password');
  const stale = createToken({ sub: 'nobody', exp: Date.now() + 60_000 }, SECRET);
  assert.equal((await request('GET', '/api/auth/me', { token: stale })).status, 401);

  // Deactivating the account invalidates an issued token immediately.
  const staff = await staffAccounts.findByEmail('staff@depot.et');
  await staffAccounts.setActive(staff._id, false);
  assert.equal((await request('GET', '/api/auth/me', { token: login.body.token })).status, 401);
});

test('logout clears the session cookie', async () => {
  const res = await request('POST', '/api/auth/logout');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie') || '', /staff_session=;/);
});

// ------------------------------------------------------- protected writing

test('publishing requires a signed-in department account', async () => {
  const payload = {
    itemName: 'Wallet',
    description: 'Black wallet found on the back seat',
    category: 'Wallet',
    plateNumber: 'AA-3-12345',
    foundAt: '2026-10-30',
  };

  assert.equal((await request('POST', '/api/items', { body: payload })).status, 401);

  const login = await signIn('staff@depot.et', 'staff-password');
  const created = await request('POST', '/api/items', { body: payload, token: login.body.token });
  assert.equal(created.status, 201);

  // The same token works for the department workspace.
  assert.equal((await request('GET', '/api/staff/items', { token: login.body.token })).status, 200);
});

test('a session cookie is accepted in place of a bearer token', async () => {
  const login = await signIn('staff@depot.et', 'staff-password');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await request('GET', '/api/staff/overview', { cookies: cookie });
  assert.equal(res.status, 200);
});

// ------------------------------------------------------- password change

test('a signed-in account can change its password', async () => {
  const login = await signIn('staff@depot.et', 'staff-password');
  const res = await request('POST', '/api/auth/password', {
    token: login.body.token,
    body: { currentPassword: 'staff-password', newPassword: 'brand-new-password' },
  });
  assert.equal(res.status, 200);

  assert.equal((await signIn('staff@depot.et', 'staff-password')).status, 401);
  assert.equal((await signIn('staff@depot.et', 'brand-new-password')).status, 200);
});

test('password changes require the current password and a long new one', async () => {
  const login = await signIn('staff@depot.et', 'staff-password');

  const wrongCurrent = await request('POST', '/api/auth/password', {
    token: login.body.token,
    body: { currentPassword: 'nope', newPassword: 'brand-new-password' },
  });
  assert.equal(wrongCurrent.status, 401);

  const tooShort = await request('POST', '/api/auth/password', {
    token: login.body.token,
    body: { currentPassword: 'staff-password', newPassword: 'short' },
  });
  assert.equal(tooShort.status, 422);
  assert.ok(tooShort.body.fields.newPassword);
});

// ------------------------------------------------------ account management

test('managers can list, create and deactivate accounts', async () => {
  const login = await signIn('manager@depot.et', 'manager-password');
  const token = login.body.token;

  const list = await request('GET', '/api/staff/accounts', { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.accounts.length, 2);
  assert.ok(list.body.accounts.every((account) => account.passwordHash === undefined));

  const created = await request('POST', '/api/staff/accounts', {
    token,
    body: { email: 'new@depot.et', name: 'New Staff', password: 'new-staff-password', depot: 'Piassa' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.account.role, 'staff');

  const duplicate = await request('POST', '/api/staff/accounts', {
    token,
    body: { email: 'new@depot.et', name: 'Copy', password: 'new-staff-password' },
  });
  assert.equal(duplicate.status, 409);

  const deactivated = await request('PATCH', `/api/staff/accounts/${created.body.account._id}`, {
    token,
    body: { active: false },
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.account.active, false);
  assert.equal((await signIn('new@depot.et', 'new-staff-password')).status, 401);
});

test('managers cannot deactivate themselves', async () => {
  const login = await signIn('manager@depot.et', 'manager-password');
  const me = await request('GET', '/api/auth/me', { token: login.body.token });
  const res = await request('PATCH', `/api/staff/accounts/${me.body.account._id}`, {
    token: login.body.token,
    body: { active: false },
  });
  assert.equal(res.status, 422);
});

test('non-managers cannot manage accounts', async () => {
  const login = await signIn('staff@depot.et', 'staff-password');
  assert.equal((await request('GET', '/api/staff/accounts', { token: login.body.token })).status, 403);
  assert.equal(
    (
      await request('POST', '/api/staff/accounts', {
        token: login.body.token,
        body: { email: 'x@depot.et', name: 'X', password: 'long-enough-pw' },
      })
    ).status,
    403
  );
});

// ---------------------------------------------------------- first account

test('the first account is bootstrapped only when none exist', async () => {
  await staffAccounts.clear();
  config.bootstrapStaff = { email: 'first@depot.et', password: 'first-password', name: 'First', depot: 'Merkato' };

  const created = await ensureFirstStaffAccount(staffAccounts);
  assert.equal(created.email, 'first@depot.et');
  assert.equal(created.role, 'manager');

  const again = await ensureFirstStaffAccount(staffAccounts);
  assert.equal(again, null, 'must not create a second account');
  assert.equal(await staffAccounts.count(), 1);
});

test('bootstrap does nothing without credentials', async () => {
  await staffAccounts.clear();
  config.bootstrapStaff = { email: '', password: '', name: '', depot: '' };
  assert.equal(await ensureFirstStaffAccount(staffAccounts), null);
  assert.equal(await staffAccounts.count(), 0);
});
