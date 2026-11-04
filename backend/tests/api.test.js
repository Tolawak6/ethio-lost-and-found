/**
 * End-to-end HTTP tests against the in-memory store.
 * These always run (no MongoDB needed) and cover the public board, the
 * department endpoints, staff auth and the full claim workflow.
 */
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('path').join(__dirname, 'tmp-uploads');
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const { createApp } = require('../app');
const { createMemoryStore } = require('../store/memoryStore');
const { CATEGORIES, AGENCIES } = require('../models/Item');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const STAFF_KEY = 'test-staff-key';
let store;
let server;
let baseUrl;

const request = async (method, urlPath, { body, staff = false, headers = {} } = {}) => {
  const init = { method, headers: { ...headers } };
  if (staff) init.headers['x-staff-key'] = STAFF_KEY;
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
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
  return { status: res.status, body: json };
};

const form = (fields = {}, file) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => fd.append(key, value));
  if (file) fd.append('image', new Blob([file.buffer], { type: file.type }), file.name);
  return fd;
};

const validItem = () => ({
  itemName: 'Black leather wallet',
  description: 'Black wallet found on the back seat after the last trip.',
  category: 'Wallet',
  plateNumber: 'AA-3-12345',
  busCode: 'B-118',
  route: 'Merkato – Bole',
  foundOnBoard: 'Back seat',
  foundAt: '2026-10-30',
  agency: 'Anbessa City Bus',
  reportedBy: 'Supervisor Tesfaye A.',
});

const validClaim = () => ({
  claimantName: 'Hana Tesfaye',
  phone: '0911234567',
  email: 'hana@example.com',
  proof: 'The wallet has a blue student ID card from Addis Ababa University inside.',
});

before(async () => {
  config.staffApiKey = STAFF_KEY;
  store = createMemoryStore([]);
  // Pin API-only mode so tests never depend on a local frontend build.
  const app = createApp(store, { serveFrontend: false });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  config.staffApiKey = '';
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  store.reset();
});

// -------------------------------------------------------------- public basics

test('GET /api describes the API', async () => {
  const res = await request('GET', '/api');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Ethio Lost & Found API');
  assert.equal(res.body.store, 'in-memory');
});

test('GET /api/health reports readiness', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
});

test('GET /api/items/meta exposes bus options and staff flag', async () => {
  const res = await request('GET', '/api/items/meta');
  assert.equal(res.status, 200);
  assert.deepEqual([...res.body.categories].sort(), [...CATEGORIES].sort());
  assert.deepEqual(res.body.agencies, AGENCIES);
  assert.ok(res.body.statuses.includes('In Storage'));
  assert.equal(res.body.staffRequired, true);
  assert.equal(res.body.retentionDays, 90);
});

// ------------------------------------------------------------ department CRUD

test('staff can publish an item', async () => {
  const res = await request('POST', '/api/items', { body: validItem(), staff: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.itemName, validItem().itemName);
  assert.equal(res.body.plateNumber, 'AA-3-12345');
  assert.equal(res.body.status, 'In Storage');
  assert.ok(res.body.storageDeadline, 'a 90-day storage deadline is derived');
});

test('publishing requires the staff key', async () => {
  const noKey = await request('POST', '/api/items', { body: validItem() });
  assert.equal(noKey.status, 401);

  const wrongKey = await request('POST', '/api/items', {
    body: validItem(),
    headers: { 'x-staff-key': 'nope' },
  });
  assert.equal(wrongKey.status, 401);
});

test('staff key also works as a bearer token', async () => {
  const res = await request('POST', '/api/items', {
    body: validItem(),
    headers: { authorization: `Bearer ${STAFF_KEY}` },
  });
  assert.equal(res.status, 201);
});

test('publishing validates the bus details', async () => {
  const res = await request('POST', '/api/items', {
    body: { itemName: '', description: 'x', category: 'Spaceship', plateNumber: '!', foundAt: 'tomorrow' },
    staff: true,
  });
  assert.equal(res.status, 422);
  ['itemName', 'category', 'plateNumber', 'foundAt'].forEach((field) => {
    assert.ok(res.body.fields[field], `${field} should be reported`);
  });
});

test('identifying details are stored but never sent to the public', async () => {
  const created = await request('POST', '/api/items', {
    body: { ...validItem(), identifyingDetails: 'Blue student ID card inside' },
    staff: true,
  });
  assert.equal(created.body.identifyingDetails, undefined);

  const publicDetail = await request('GET', `/api/items/${created.body._id}`);
  assert.equal(publicDetail.body.identifyingDetails, undefined);

  const staffView = await request('GET', '/api/staff/items', { staff: true });
  assert.equal(staffView.body.items[0].identifyingDetails, 'Blue student ID card inside');
  assert.equal(staffView.body.items[0].pendingClaims, 0);
});

test('staff can edit and delete, public cannot', async () => {
  const created = await request('POST', '/api/items', { body: validItem(), staff: true });
  const id = created.body._id;

  const denied = await request('PATCH', `/api/items/${id}`, { body: { status: 'Returned' } });
  assert.equal(denied.status, 401);

  const patched = await request('PATCH', `/api/items/${id}`, { body: { status: 'Returned' }, staff: true });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, 'Returned');
  assert.ok(patched.body.resolvedAt);

  // Full PUT still requires every field.
  const partialPut = await request('PUT', `/api/items/${id}`, { body: { itemName: 'Only a name' }, staff: true });
  assert.equal(partialPut.status, 422);

  const deleteDenied = await request('DELETE', `/api/items/${id}`);
  assert.equal(deleteDenied.status, 401);

  const deleted = await request('DELETE', `/api/items/${id}`, { staff: true });
  assert.equal(deleted.status, 200);

  const gone = await request('GET', `/api/items/${id}`);
  assert.equal(gone.status, 404);
});

// --------------------------------------------------------------- public search

test('passengers can search by plate number, route and text', async () => {
  await request('POST', '/api/items', { body: validItem(), staff: true });
  await request('POST', '/api/items', {
    body: { ...validItem(), itemName: 'Blue umbrella', plateNumber: 'AA-2-22222', route: 'Bole – Megenagna', category: 'Other' },
    staff: true,
  });

  const byPlate = await request('GET', '/api/items?plateNumber=aa-2-22222');
  assert.equal(byPlate.body.pagination.total, 1);
  assert.equal(byPlate.body.items[0].itemName, 'Blue umbrella');

  const byRoute = await request('GET', '/api/items?route=megenagna');
  assert.equal(byRoute.body.pagination.total, 1);

  const bySearch = await request('GET', '/api/items?search=umbrella');
  assert.equal(bySearch.body.pagination.total, 1);
  assert.equal(bySearch.body.items[0].itemName, 'Blue umbrella');

  // Text search also matches the plate number and route.
  const byPlateSearch = await request('GET', '/api/items?search=aa-2-22222');
  assert.equal(byPlateSearch.body.pagination.total, 1);

  const byAgency = await request('GET', '/api/items?agency=Anbessa%20City%20Bus');
  assert.equal(byAgency.body.pagination.total, 2);

  const plates = await request('GET', '/api/items/plates');
  assert.deepEqual(plates.body.plates.sort(), ['AA-2-22222', 'AA-3-12345']);
});

test('lists are paginated and clamp the page size', async () => {
  for (let i = 0; i < 3; i += 1) {
    await request('POST', '/api/items', { body: { ...validItem(), itemName: `Item ${i}` }, staff: true });
  }
  const page = await request('GET', '/api/items?limit=2&page=1');
  assert.equal(page.body.items.length, 2);
  assert.equal(page.body.pagination.total, 3);
  assert.equal(page.body.pagination.totalPages, 2);
  assert.equal(page.body.pagination.hasMore, true);

  const clamped = await request('GET', '/api/items?limit=5000');
  assert.equal(clamped.body.pagination.limit, 100);
});

test('unknown filters and ids are rejected cleanly', async () => {
  assert.equal((await request('GET', '/api/items?category=Nope')).status, 422);
  assert.equal((await request('GET', '/api/items?agency=Rocket%20Bus')).status, 422);
  assert.equal((await request('GET', '/api/items/not-an-id')).status, 400);
  assert.equal((await request('GET', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7')).status, 404);
});

test('stats summarise the department workload', async () => {
  await request('POST', '/api/items', { body: validItem(), staff: true });
  const second = await request('POST', '/api/items', { body: { ...validItem(), itemName: 'Keys' }, staff: true });
  await request('POST', `/api/items/${second.body._id}/claims`, { body: validClaim() });

  const res = await request('GET', '/api/items/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.inStorage, 1);
  assert.equal(res.body.pending, 1);
  assert.equal(res.body.returned, 0);
  assert.equal(res.body.claimsPending, 1);
});

// -------------------------------------------------------------------- claims

test('a passenger can file a claim and gets a reference', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });

  const res = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.claim.reference, /^EC-[A-Z0-9]{6}$/);
  assert.equal(res.body.claim.status, 'Pending');
  assert.equal(res.body.claim.reviewNote, undefined, 'internal notes must not leak');
  assert.match(res.body.message, /Claim received/);

  // Filing a claim puts the item into review…
  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'Claim Pending');

  // …and the reference can be looked up publicly.
  const status = await request('GET', `/api/items/claims/${res.body.claim.reference}`);
  assert.equal(status.status, 200);
  assert.equal(status.body.status, 'Pending');
  assert.equal(status.body.item.plateNumber, 'AA-3-12345');
  assert.equal(status.body.proof, undefined);

  assert.equal((await request('GET', '/api/items/claims/EC-NOPE00')).status, 404);
});

test('claim submissions are validated', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });

  const res = await request('POST', `/api/items/${item.body._id}/claims`, {
    body: { claimantName: '', phone: '123', proof: 'short' },
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.claimantName);
  assert.ok(res.body.fields.phone);
  assert.ok(res.body.fields.proof);
});

test('claims cannot be filed for returned or missing items', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  await request('PATCH', `/api/items/${item.body._id}`, { body: { status: 'Returned' }, staff: true });

  const returned = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });
  assert.equal(returned.status, 409);

  const missing = await request('POST', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7/claims', { body: validClaim() });
  assert.equal(missing.status, 404);
});

test('staff review a claim and returning the item follows', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  const claim = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  const list = await request('GET', `/api/staff/items/${item.body._id}/claims`, { staff: true });
  assert.equal(list.body.claims.length, 1);

  const approved = await request(
    'PATCH',
    `/api/staff/claims/${claim.body.claim._id}`,
    { body: { status: 'Approved', reviewNote: 'ID verified at the office' }, staff: true }
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'Approved');
  assert.equal(approved.body.reviewNote, 'ID verified at the office');

  const collected = await request(
    'PATCH',
    `/api/staff/claims/${claim.body.claim._id}`,
    { body: { status: 'Collected' }, staff: true }
  );
  assert.equal(collected.status, 200);

  // Collecting the item closes it out.
  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'Returned');
});

test('rejecting the only claim returns the item to storage', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  const claim = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  await request('PATCH', `/api/staff/claims/${claim.body.claim._id}`, {
    body: { status: 'Rejected', reviewNote: 'Could not verify ownership' },
    staff: true,
  });

  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'In Storage');
});

test('staff endpoints reject unauthenticated callers and bad input', async () => {
  assert.equal((await request('GET', '/api/staff/items')).status, 401);
  assert.equal((await request('GET', '/api/staff/overview')).status, 401);

  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  const claim = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  const badStatus = await request('PATCH', `/api/staff/claims/${claim.body.claim._id}`, {
    body: { status: 'Sold' },
    staff: true,
  });
  assert.equal(badStatus.status, 422);

  const missing = await request('PATCH', '/api/staff/claims/64b7f9f2c2a1b2c3d4e5f6a7', {
    body: { status: 'Approved' },
    staff: true,
  });
  assert.equal(missing.status, 404);
});

// ------------------------------------------------------------------- images

test('staff uploads store a servable file', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
    staff: true,
  });
  assert.equal(res.status, 201);
  assert.match(res.body.imageUrl, /^\/uploads\/.+\.png$/);

  const image = await fetch(`${baseUrl}${res.body.imageUrl}`);
  assert.equal(image.status, 200);
});

test('non-image and oversized uploads are rejected', async () => {
  const notImage = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: Buffer.from('hello'), type: 'text/plain', name: 'a.txt' }),
    staff: true,
  });
  assert.equal(notImage.status, 415);

  const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
  const tooBig = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: big, type: 'image/png', name: 'big.png' }),
    staff: true,
  });
  assert.equal(tooBig.status, 413);
});

test('replacing an image removes the old file; deleting removes the new one', async () => {
  const created = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'one.png' }),
    staff: true,
  });
  const oldFile = path.join(process.env.UPLOAD_DIR, path.basename(created.body.imageUrl));
  assert.equal(fs.existsSync(oldFile), true);

  const updated = await request('PATCH', `/api/items/${created.body._id}`, {
    body: form({}, { buffer: PNG, type: 'image/png', name: 'two.png' }),
    staff: true,
  });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.body.imageUrl, created.body.imageUrl);
  assert.equal(fs.existsSync(oldFile), false);

  const newFile = path.join(process.env.UPLOAD_DIR, path.basename(updated.body.imageUrl));
  await request('DELETE', `/api/items/${created.body._id}`, { staff: true });
  assert.equal(fs.existsSync(newFile), false);
});

// ------------------------------------------------------------------ plumbing

test('malformed JSON and unknown routes return JSON errors', async () => {
  const badJson = await fetch(`${baseUrl}/api/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-staff-key': STAFF_KEY },
    body: '{not json',
  });
  assert.equal(badJson.status, 400);
  assert.ok((await badJson.json()).error);

  const unknown = await request('GET', '/api/nope');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, 'Not found');
});

test('write endpoints are rate limited', async () => {
  const responses = [];
  for (let i = 0; i < 62; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    responses.push(await request('PATCH', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7', { body: { status: 'Returned' }, staff: true }));
  }
  assert.ok(responses.some((res) => res.status === 429), 'expected at least one 429');
});

test('serves the built frontend when it is available', async (t) => {
  const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    return t.skip('frontend/dist not built');
  }

  const ownApp = createApp(createMemoryStore([]), { serveFrontend: true });
  const ownServer = await new Promise((resolve) => {
    const s = ownApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${ownServer.address().port}`;

  try {
    const root = await fetch(`${url}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /<div id="root"><\/div>/);

    const deepLink = await fetch(`${url}/items/123`);
    assert.equal(deepLink.status, 200);
    assert.match(await deepLink.text(), /<div id="root"><\/div>/);

    const api = await fetch(`${url}/api/items`);
    assert.equal(api.status, 200);
    assert.ok(Array.isArray((await api.json()).items));

    const missing = await fetch(`${url}/api/does-not-exist`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => ownServer.close(resolve));
  }
});
