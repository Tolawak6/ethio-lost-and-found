/**
 * Integration tests against a real MongoDB (mongodb-memory-server).
 *
 * These verify the Mongoose store, indexes, schema hooks and the claim
 * workflow in a real database. The suite skips itself when the MongoDB binary
 * cannot be downloaded (e.g. offline sandboxes), so `npm test` still passes.
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

const config = require('../config');
const { createApp } = require('../app');
const { createStore } = require('../store');
const { Item, CATEGORIES, AGENCIES } = require('../models/Item');
const { Claim } = require('../models/Claim');

const STAFF_KEY = 'integration-staff-key';

let mongo;
let server;
let baseUrl;
let skipReason = null;

const request = async (method, urlPath, { body, staff = false } = {}) => {
  const init = { method, headers: {} };
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
  description: 'Black wallet with cards, found on the back seat after the last trip.',
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
  proof: 'The wallet holds a blue student ID card from Addis Ababa University.',
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

  config.staffApiKey = STAFF_KEY;
  const app = createApp(createStore({ seed: false }), { serveFrontend: false });
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
  if (skipReason) return;
  await Promise.all([Item.deleteMany({}), Claim.deleteMany({})]);
});

const it = (name, fn) =>
  test(name, async (t) => {
    if (skipReason) return t.skip(skipReason);
    return fn(t);
  });

// ------------------------------------------------------------------ public

it('health endpoint reports the database as connected', async () => {
  const res = await request('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
});

it('meta endpoint exposes categories and agencies', async () => {
  const res = await request('GET', '/api/items/meta');
  assert.equal(res.status, 200);
  assert.deepEqual([...res.body.categories].sort(), [...CATEGORIES].sort());
  assert.deepEqual(res.body.agencies, AGENCIES);
});

it('creates an item and keeps identifying details private', async () => {
  const res = await request('POST', '/api/items', {
    body: { ...validItem(), identifyingDetails: 'blue student ID card inside' },
    staff: true,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.itemName, validItem().itemName);
  assert.equal(res.body.status, 'In Storage');
  assert.equal(res.body.identifyingDetails, undefined);
  assert.ok(res.body.storageDeadline);

  const stored = await Item.findById(res.body._id).select('+identifyingDetails');
  assert.equal(stored.identifyingDetails, 'blue student ID card inside');
});

it('rejects invalid payloads with field-level errors', async () => {
  const res = await request('POST', '/api/items', {
    body: { itemName: '', description: 'x', category: 'Spaceship', plateNumber: '!', foundAt: 'tomorrow' },
    staff: true,
  });
  assert.equal(res.status, 422);
  ['itemName', 'category', 'plateNumber', 'foundAt'].forEach((field) => {
    assert.ok(res.body.fields[field], `${field} should be reported`);
  });
});

it('lists items newest-found first with pagination metadata', async () => {
  await Item.create({ ...validItem(), itemName: 'Older', foundAt: new Date('2026-10-01') });
  await Item.create({ ...validItem(), itemName: 'Newer', foundAt: new Date('2026-10-20') });
  await Item.create({ ...validItem(), itemName: 'Newest', foundAt: new Date('2026-10-25') });

  const res = await request('GET', '/api/items?limit=2&page=1');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.pagination.total, 3);
  assert.equal(res.body.pagination.totalPages, 2);
  assert.equal(res.body.pagination.hasMore, true);
  assert.deepEqual(res.body.items.map((i) => i.itemName), ['Newest', 'Newer']);
});

it('filters by plate, route, category and search', async () => {
  await Item.create({ ...validItem(), itemName: 'Nokia 3310', category: 'Electronics', plateNumber: 'AA-2-22222' });
  await Item.create({
    ...validItem(),
    itemName: 'Blue umbrella',
    category: 'Other',
    plateNumber: 'AA-2-33333',
    route: 'Bole – Megenagna',
  });

  const byPlate = await request('GET', '/api/items?plateNumber=aa-2-22222');
  assert.equal(byPlate.body.pagination.total, 1);
  assert.equal(byPlate.body.items[0].itemName, 'Nokia 3310');

  const byRoute = await request('GET', '/api/items?route=megenagna');
  assert.equal(byRoute.body.pagination.total, 1);

  const byCategory = await request('GET', '/api/items?category=Electronics');
  assert.equal(byCategory.body.pagination.total, 1);

  const bySearch = await request('GET', '/api/items?search=umbrella');
  assert.equal(bySearch.body.pagination.total, 1);

  const byPlateSearch = await request('GET', '/api/items?search=aa-2-22222');
  assert.equal(byPlateSearch.body.pagination.total, 1);
});

it('search treats regex characters literally', async () => {
  await Item.create({ ...validItem(), itemName: 'Bag (brown)' });
  const res = await request('GET', `/api/items?search=${encodeURIComponent('(brown)')}`);
  assert.equal(res.body.pagination.total, 1);
});

it('rejects unknown filters and malformed ids', async () => {
  assert.equal((await request('GET', '/api/items?category=Nope')).status, 422);
  assert.equal((await request('GET', '/api/items/not-an-id')).status, 400);
});

it('returns workload stats', async () => {
  await Item.create({ ...validItem(), plateNumber: 'AA-2-11111' });
  await Item.create({ ...validItem(), plateNumber: 'AA-2-22222', status: 'Returned' });
  const res = await request('GET', '/api/items/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 2);
  assert.equal(res.body.inStorage, 1);
  assert.equal(res.body.returned, 1);
});

// --------------------------------------------------------------- department

it('staff-only endpoints reject callers without the key', async () => {
  assert.equal((await request('GET', '/api/staff/items')).status, 401);
  assert.equal((await request('POST', '/api/items', { body: validItem() })).status, 401);
});

it('updates an item via PATCH and sets resolvedAt when returned', async () => {
  const created = await Item.create(validItem());
  const res = await request('PATCH', `/api/items/${created._id}`, {
    body: { status: 'Returned' },
    staff: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'Returned');
  assert.ok(res.body.resolvedAt);
  assert.equal(res.body.itemName, validItem().itemName);
});

it('patch rejects blank required fields', async () => {
  const created = await Item.create(validItem());
  const res = await request('PATCH', `/api/items/${created._id}`, { body: { itemName: '   ' }, staff: true });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.itemName);
});

it('staff listing includes private details and claim counts', async () => {
  const created = await Item.create({ ...validItem(), identifyingDetails: 'blue ID card' });
  await Claim.create({ ...validClaim(), item: created._id });

  const res = await request('GET', '/api/staff/items', { staff: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.items[0].identifyingDetails, 'blue ID card');
  assert.equal(res.body.items[0].pendingClaims, 1);
});

// ------------------------------------------------------------------- claims

it('a passenger files a claim and the item goes into review', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });

  const res = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.claim.reference, /^EC-[A-Z0-9]{6}$/);
  assert.equal(res.body.claim.status, 'Pending');

  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'Claim Pending');

  const tracked = await request('GET', `/api/items/claims/${res.body.claim.reference}`);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.item.plateNumber, 'AA-3-12345');
  assert.equal(tracked.body.proof, undefined);
});

it('claims are validated and blocked for returned items', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });

  const invalid = await request('POST', `/api/items/${item.body._id}/claims`, {
    body: { claimantName: '', phone: '123', proof: 'short' },
  });
  assert.equal(invalid.status, 422);

  await request('PATCH', `/api/items/${item.body._id}`, { body: { status: 'Returned' }, staff: true });
  const blocked = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });
  assert.equal(blocked.status, 409);
});

it('approving then collecting a claim returns the item', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  const claim = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  const approved = await request('PATCH', `/api/staff/claims/${claim.body.claim._id}`, {
    body: { status: 'Approved', reviewNote: 'ID checked' },
    staff: true,
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.reviewNote, 'ID checked');

  await request('PATCH', `/api/staff/claims/${claim.body.claim._id}`, {
    body: { status: 'Collected' },
    staff: true,
  });

  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'Returned');
});

it('rejecting the only claim returns the item to storage', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  const claim = await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  await request('PATCH', `/api/staff/claims/${claim.body.claim._id}`, {
    body: { status: 'Rejected' },
    staff: true,
  });

  const after = await request('GET', `/api/items/${item.body._id}`);
  assert.equal(after.body.status, 'In Storage');
});

it('deleting an item removes its claims too', async () => {
  const item = await request('POST', '/api/items', { body: validItem(), staff: true });
  await request('POST', `/api/items/${item.body._id}/claims`, { body: validClaim() });

  const res = await request('DELETE', `/api/items/${item.body._id}`, { staff: true });
  assert.equal(res.status, 200);
  assert.equal(await Claim.countDocuments(), 0);
  assert.equal((await request('GET', `/api/items/${item.body._id}`)).status, 404);
});

// ------------------------------------------------------------------- images

it('uploads an image and serves it from /uploads', async () => {
  const res = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
    staff: true,
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
    staff: true,
  });
  assert.equal(res.status, 415);
});

it('deleting an item removes its local image file', async () => {
  const created = await request('POST', '/api/items', {
    body: form(validItem(), { buffer: PNG, type: 'image/png', name: 'pixel.png' }),
    staff: true,
  });
  const filename = path.basename(created.body.imageUrl);

  const res = await request('DELETE', `/api/items/${created.body._id}`, { staff: true });
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR, filename)), false);
});
