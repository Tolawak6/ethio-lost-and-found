/**
 * End-to-end HTTP tests against the in-memory store.
 * These always run (no MongoDB needed) and cover routing, validation,
 * uploads, rate limiting and private-field handling.
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

const { createApp } = require('../app');
const { createMemoryStore } = require('../store/memoryStore');
const { CATEGORIES } = require('../models/Item');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

let store;
let server;
let baseUrl;

const request = async (method, urlPath, { body, headers = {} } = {}) => {
  const init = { method, headers: { ...headers } };
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
  return { status: res.status, body: json, headers: res.headers };
};

const form = (fields = {}, file) => {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => fd.append(key, value));
  if (file) fd.append('image', new Blob([file.buffer], { type: file.type }), file.name);
  return fd;
};

const validItem = () => ({
  itemName: 'Black Leather Wallet',
  description: 'Standard black wallet with cards, found on the back seat.',
  category: 'Wallet',
  location: 'Meskel Square, Addis Ababa',
  type: 'Found',
  contactName: 'Abebe',
  contactEmail: 'abebe@example.com',
});

before(async () => {
  store = createMemoryStore([]);
  // Pin the API-only mode so tests never depend on a local frontend build.
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
});

test('GET /api describes the API', async () => {
  const res = await request('GET', '/api');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Ethio Lost & Found API');
  assert.equal(res.body.store, 'in-memory');
  assert.ok(res.body.endpoints.length > 0);
});

test('GET / describes the API when no frontend is served', async () => {
  const res = await request('GET', '/');
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Ethio Lost & Found API');
  assert.equal(res.body.store, 'in-memory');
});

test('GET /api/health reports readiness', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
});

test('GET /api/items/meta exposes form options', async () => {
  const res = await request('GET', '/api/items/meta');
  assert.equal(res.status, 200);
  assert.deepEqual([...res.body.categories].sort(), [...CATEGORIES].sort());
  assert.deepEqual(res.body.types, ['Lost', 'Found']);
});

test('POST /api/items creates a report and hides private fields', async () => {
  const res = await request('POST', '/api/items', {
    body: { ...validItem(), hiddenDetails: 'blue sticker on the back' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.itemName, validItem().itemName);
  assert.equal(res.body.status, 'Unclaimed');
  assert.equal(res.body.hiddenDetails, undefined);
  assert.equal(res.body.imagePublicId, undefined);

  const priv = await store.getPrivate(res.body._id);
  assert.equal(priv.hiddenDetails, 'blue sticker on the back');
});

test('POST /api/items returns field-level validation errors', async () => {
  const res = await request('POST', '/api/items', {
    body: { itemName: '', description: 'x', category: 'Spaceship', location: '' },
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.itemName);
  assert.ok(res.body.fields.category);
  assert.ok(res.body.fields.location);
});

test('POST /api/items rejects invalid JSON bodies gracefully', async () => {
  const res = await fetch(`${baseUrl}/api/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.ok(payload.error);
});

test('GET /api/items paginates and filters', async () => {
  for (let i = 0; i < 3; i += 1) {
    await request('POST', '/api/items', { body: { ...validItem(), itemName: `Item ${i}` } });
  }
  await request('POST', '/api/items', {
    body: { ...validItem(), itemName: 'Nokia 3310', category: 'Electronics', type: 'Lost' },
  });

  const page = await request('GET', '/api/items?limit=2&page=1');
  assert.equal(page.status, 200);
  assert.equal(page.body.items.length, 2);
  assert.equal(page.body.pagination.total, 4);
  assert.equal(page.body.pagination.totalPages, 2);
  assert.equal(page.body.pagination.hasMore, true);

  const filtered = await request('GET', '/api/items?category=Electronics&type=Lost');
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].itemName, 'Nokia 3310');

  const searched = await request('GET', '/api/items?search=nokia');
  assert.equal(searched.body.items.length, 1);

  const byLocation = await request('GET', '/api/items?location=meskel');
  assert.equal(byLocation.body.items.length, 4);
});

test('GET /api/items clamps the page size', async () => {
  const res = await request('GET', '/api/items?limit=5000');
  assert.equal(res.status, 200);
  assert.equal(res.body.pagination.limit, 100);
});

test('GET /api/items rejects unknown filters', async () => {
  const res = await request('GET', '/api/items?category=Nope');
  assert.equal(res.status, 422);
});

test('GET /api/items/:id handles bad and missing ids', async () => {
  const bad = await request('GET', '/api/items/not-an-id');
  assert.equal(bad.status, 400);

  const missing = await request('GET', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7');
  assert.equal(missing.status, 404);

  const list = await request('GET', '/api/items');
  const missingReal = await request('GET', `/api/items/${list.body.items[0]?._id || '64b7f9f2c2a1b2c3d4e5f6a7'}`);
  assert.ok([200, 404].includes(missingReal.status));
});

test('GET /api/items/stats summarises the board', async () => {
  await request('POST', '/api/items', { body: { ...validItem(), type: 'Lost' } });
  await request('POST', '/api/items', { body: { ...validItem(), type: 'Found' } });
  const res = await request('GET', '/api/items/stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { total: 2, lost: 1, found: 1, claimed: 0, unclaimed: 2 });
});

test('PATCH /api/items/:id updates and resolves items', async () => {
  const created = await request('POST', '/api/items', { body: validItem() });
  const res = await request('PATCH', `/api/items/${created.body._id}`, { body: { status: 'Claimed' } });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'Claimed');
  assert.ok(res.body.resolvedAt);
  assert.equal(res.body.itemName, validItem().itemName);

  const blank = await request('PATCH', `/api/items/${created.body._id}`, { body: { itemName: '  ' } });
  assert.equal(blank.status, 422);

  const missing = await request('PATCH', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7', { body: { status: 'Claimed' } });
  assert.equal(missing.status, 404);
});

test('PUT /api/items/:id requires the full payload', async () => {
  const created = await request('POST', '/api/items', { body: validItem() });
  const partial = await request('PUT', `/api/items/${created.body._id}`, { body: { itemName: 'Only a name' } });
  assert.equal(partial.status, 422);

  const full = await request('PUT', `/api/items/${created.body._id}`, {
    body: { ...validItem(), itemName: 'Updated wallet' },
  });
  assert.equal(full.status, 200);
  assert.equal(full.body.itemName, 'Updated wallet');
});

test('image upload stores a servable file', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
  });
  assert.equal(res.status, 201);
  assert.match(res.body.imageUrl, /^\/uploads\/.+\.png$/);

  const image = await fetch(`${baseUrl}${res.body.imageUrl}`);
  assert.equal(image.status, 200);
});

test('non-image uploads are rejected', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: Buffer.from('hello'), type: 'text/plain', name: 'a.txt' }),
  });
  assert.equal(res.status, 415);
});

test('oversized uploads are rejected with 413', async () => {
  const big = Buffer.alloc(5 * 1024 * 1024 + 10, 1);
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: big, type: 'image/png', name: 'big.png' }),
  });
  assert.equal(res.status, 413);
});

test('replacing an image removes the old file', async () => {
  const first = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'one.png' }),
  });
  const oldFile = path.join(process.env.UPLOAD_DIR, path.basename(first.body.imageUrl));
  assert.equal(fs.existsSync(oldFile), true);

  const updated = await request('PATCH', `/api/items/${first.body._id}`, {
    body: form({}, { buffer: PNG, type: 'image/png', name: 'two.png' }),
  });
  assert.equal(updated.status, 200);
  assert.notEqual(updated.body.imageUrl, first.body.imageUrl);
  assert.equal(fs.existsSync(oldFile), false);
});

test('DELETE /api/items/:id removes the record and its image', async () => {
  const created = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
  });
  const file = path.join(process.env.UPLOAD_DIR, path.basename(created.body.imageUrl));

  const res = await request('DELETE', `/api/items/${created.body._id}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(fs.existsSync(file), false);

  const gone = await request('GET', `/api/items/${created.body._id}`);
  assert.equal(gone.status, 404);

  const again = await request('DELETE', `/api/items/${created.body._id}`);
  assert.equal(again.status, 404);
});

test('unknown API routes return JSON 404', async () => {
  const res = await request('GET', '/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});

test('write endpoints are rate limited', async () => {
  const responses = [];
  for (let i = 0; i < 62; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    responses.push(await request('PATCH', '/api/items/64b7f9f2c2a1b2c3d4e5f6a7', { body: { status: 'Claimed' } }));
  }
  assert.ok(responses.some((res) => res.status === 429), 'expected at least one 429');
});

test('serves the built frontend when it is available', async (t) => {
  const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    return t.skip('frontend/dist not built');
  }

  const ownStore = createMemoryStore([]);
  const ownApp = createApp(ownStore, { serveFrontend: true });
  const ownServer = await new Promise((resolve) => {
    const s = ownApp.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${ownServer.address().port}`;

  try {
    const root = await fetch(`${url}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /<div id="root"><\/div>/);

    // Client-side routes fall back to index.html…
    const deepLink = await fetch(`${url}/items/123`);
    assert.equal(deepLink.status, 200);
    assert.match(await deepLink.text(), /<div id="root"><\/div>/);

    // …while the API namespace keeps working and stays JSON.
    const api = await fetch(`${url}/api/items`);
    assert.equal(api.status, 200);
    assert.ok(Array.isArray((await api.json()).items));

    const missing = await fetch(`${url}/api/does-not-exist`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => ownServer.close(resolve));
  }
});
