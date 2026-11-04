/**
 * Integration tests for /api/items.
 *
 * These spin up a real MongoDB using mongodb-memory-server. It downloads a
 * MongoDB binary on first run, which needs network access; when that is not
 * possible the whole suite is skipped so `npm test` still passes offline.
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
const mongoose = require('mongoose');

const { createApp } = require('../app');
const { Item, CATEGORIES, STATUSES } = require('../models/Item');

let mongo;
let server;
let baseUrl;
let skipReason = null;

const request = async (method, urlPath, { body } = {}) => {
  const init = { method, headers: {} };
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
  itemName: 'Black Leather Wallet',
  description: 'Standard black wallet with cards, found on the back seat.',
  category: 'Wallet',
  location: 'Meskel Square, Addis Ababa',
  type: 'Found',
  contactName: 'Abebe',
  contactEmail: 'abebe@example.com',
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

before(async () => {
  try {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  } catch (err) {
    skipReason = `MongoDB test server unavailable: ${err.message.split('\n')[0]}`;
    return;
  }
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongo) await mongo.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!skipReason) await Item.deleteMany({});
});

const it = (name, fn) => test(name, async (t) => {
  if (skipReason) return t.skip(skipReason);
  return fn(t);
});

it('health endpoint reports the database as connected', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
});

it('meta endpoint exposes categories and statuses', async () => {
  const res = await request('GET', '/api/items/meta');
  assert.equal(res.status, 200);
  assert.deepEqual([...res.body.categories].sort(), [...CATEGORIES].sort());
  assert.deepEqual(res.body.statuses, STATUSES);
});

it('creates an item and never leaks hiddenDetails', async () => {
  const res = await request('POST', '/api/items', {
    body: { ...validItem(), hiddenDetails: 'blue sticker on the back' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.itemName, validItem().itemName);
  assert.equal(res.body.status, 'Unclaimed');
  assert.equal(res.body.hiddenDetails, undefined);

  const stored = await Item.findById(res.body._id).select('+hiddenDetails');
  assert.equal(stored.hiddenDetails, 'blue sticker on the back');
});

it('rejects invalid payloads with field-level errors', async () => {
  const res = await request('POST', '/api/items', {
    body: { itemName: '', description: 'x', category: 'Spaceship', location: '' },
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.itemName);
  assert.ok(res.body.fields.category);
  assert.ok(res.body.fields.location);
});

it('lists items with pagination metadata', async () => {
  for (let i = 0; i < 3; i += 1) {
    await Item.create({ ...validItem(), itemName: `Item ${i}` });
  }
  const res = await request('GET', '/api/items?limit=2&page=1');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.pagination.total, 3);
  assert.equal(res.body.pagination.totalPages, 2);
  assert.equal(res.body.pagination.hasMore, true);
});

it('filters by category, type and search text', async () => {
  await Item.create({ ...validItem(), itemName: 'Nokia 3310', category: 'Electronics', type: 'Lost' });
  await Item.create({ ...validItem(), itemName: 'Blue Umbrella', category: 'Other', type: 'Found' });

  const byCategory = await request('GET', '/api/items?category=Electronics');
  assert.equal(byCategory.body.items.length, 1);
  assert.equal(byCategory.body.items[0].itemName, 'Nokia 3310');

  const byType = await request('GET', '/api/items?type=Found');
  assert.equal(byType.body.items.length, 1);

  const bySearch = await request('GET', '/api/items?search=umbrella');
  assert.equal(bySearch.body.items.length, 1);
  assert.equal(bySearch.body.items[0].itemName, 'Blue Umbrella');
});

it('search treats regex characters literally', async () => {
  await Item.create({ ...validItem(), itemName: 'Bag (brown)' });
  const res = await request('GET', `/api/items?search=${encodeURIComponent('(brown)')}`);
  assert.equal(res.body.items.length, 1);
});

it('rejects unknown categories as filters', async () => {
  const res = await request('GET', '/api/items?category=Nope');
  assert.equal(res.status, 422);
});

it('returns 400 (not 500) for malformed ids', async () => {
  const res = await request('GET', '/api/items/not-an-id');
  assert.equal(res.status, 400);
});

it('returns stats', async () => {
  await Item.create({ ...validItem(), type: 'Lost' });
  await Item.create({ ...validItem(), type: 'Found', status: 'Claimed' });
  const res = await request('GET', '/api/items/stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { total: 2, lost: 1, found: 1, claimed: 1, unclaimed: 1 });
});

it('updates an item via PATCH and sets resolvedAt when claimed', async () => {
  const created = await Item.create(validItem());
  const res = await request('PATCH', `/api/items/${created._id}`, { body: { status: 'Claimed' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'Claimed');
  assert.ok(res.body.resolvedAt);
  assert.equal(res.body.itemName, validItem().itemName);
});

it('patch rejects blank required fields', async () => {
  const created = await Item.create(validItem());
  const res = await request('PATCH', `/api/items/${created._id}`, { body: { itemName: '   ' } });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.itemName);
});

it('uploads an image and serves it from /uploads', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
  });
  assert.equal(res.status, 201);
  assert.match(res.body.imageUrl, /^\/uploads\/.+\.png$/);
  assert.equal(res.body.imagePublicId, undefined);

  const image = await fetch(`${baseUrl}${res.body.imageUrl}`);
  assert.equal(image.status, 200);
});

it('rejects non-image uploads', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: Buffer.from('hello'), type: 'text/plain', name: 'a.txt' }),
  });
  assert.equal(res.status, 415);
});

it('deleting an item removes it and its local image', async () => {
  const created = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
  });
  const filename = path.basename(created.body.imageUrl);

  const res = await request('DELETE', `/api/items/${created.body._id}`);
  assert.equal(res.status, 200);

  const gone = await request('GET', `/api/items/${created.body._id}`);
  assert.equal(gone.status, 404);
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR, filename)), false);
});
