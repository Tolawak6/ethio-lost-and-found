process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('path').join(__dirname, 'tmp-uploads');
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { isValidObjectId } = require('mongoose');

const { validateItemPayload, FIELD_LIMITS } = require('../middleware/validateItem');
const { storeImage, destroyImage, EXTENSION_BY_MIME } = require('../upload');
const { CATEGORIES } = require('../models/Item');
const { createMemoryStore } = require('../store/memoryStore');
const { buildFilter } = require('../store/filter');
const { serializeItem } = require('../store/serialize');

const validItem = () => ({
  itemName: 'Black Leather Wallet',
  description: 'Standard black wallet with cards, found on the back seat.',
  category: 'Wallet',
  location: 'Meskel Square, Addis Ababa',
  type: 'Found',
  contactName: 'Abebe',
  contactEmail: 'abebe@example.com',
});

beforeEach(() => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
});

// --- validation ------------------------------------------------------------

test('validation accepts a complete payload', () => {
  const { valid, errors, data } = validateItemPayload(validItem());
  assert.equal(valid, true);
  assert.deepEqual(errors, {});
  assert.equal(data.category, 'Wallet');
  assert.equal(data.type, 'Found');
});

test('validation requires item name, description, location and category', () => {
  const { valid, errors } = validateItemPayload({});
  assert.equal(valid, false);
  assert.ok(errors.itemName);
  assert.ok(errors.description);
  assert.ok(errors.location);
  assert.ok(errors.category);
});

test('validation trims whitespace and rejects blank strings', () => {
  const { valid, errors, data } = validateItemPayload({ ...validItem(), itemName: '   Phone  ' });
  assert.equal(valid, true);
  assert.equal(data.itemName, 'Phone');

  const blank = validateItemPayload({ ...validItem(), itemName: '    ' });
  assert.equal(blank.valid, false);
  assert.ok(blank.errors.itemName);
});

test('validation enforces maximum lengths', () => {
  const { valid, errors } = validateItemPayload({
    ...validItem(),
    description: 'x'.repeat(FIELD_LIMITS.description + 1),
  });
  assert.equal(valid, false);
  assert.ok(errors.description);
});

test('validation rejects unknown categories and bad types', () => {
  const res = validateItemPayload({ ...validItem(), category: 'Spaceship', type: 'Maybe' });
  assert.equal(res.valid, false);
  assert.ok(res.errors.category);
  assert.ok(res.errors.type);
});

test('validation accepts every declared category', () => {
  for (const category of CATEGORIES) {
    const res = validateItemPayload({ ...validItem(), category });
    assert.equal(res.valid, true, `category ${category} should be accepted`);
  }
});

test('validation rejects malformed emails but allows them to be omitted', () => {
  assert.ok(validateItemPayload({ ...validItem(), contactEmail: 'nope' }).errors.contactEmail);
  const omitted = validateItemPayload({ ...validItem(), contactEmail: '' });
  assert.equal(omitted.valid, true);
  assert.equal(omitted.data.contactEmail, undefined);
});

test('partial validation only checks provided fields', () => {
  const res = validateItemPayload({ status: 'Claimed' }, { partial: true });
  assert.equal(res.valid, true);
  assert.deepEqual(res.data, { status: 'Claimed' });

  const bad = validateItemPayload({ status: 'Sold' }, { partial: true });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.status);
});

test('validation parses dates and rejects invalid ones', () => {
  const ok = validateItemPayload({ ...validItem(), date: '2024-05-01' });
  assert.equal(ok.valid, true);
  assert.ok(ok.data.date instanceof Date);

  const bad = validateItemPayload({ ...validItem(), date: 'yesterday' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.date);
});

// --- uploads ---------------------------------------------------------------

test('local storage writes files with a safe extension', async () => {
  process.env.CLOUDINARY_CLOUD_NAME = '';
  const fs = require('fs');
  const path = require('path');

  const { url, publicId } = await storeImage({
    buffer: Buffer.from('fake-image'),
    mimetype: 'image/png',
  });

  assert.match(url, /^\/uploads\/[\w.-]+\.png$/);
  assert.equal(path.extname(url), EXTENSION_BY_MIME['image/png']);
  const filename = path.basename(url);
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR, filename)), true);

  await destroyImage(publicId);
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR, filename)), false);
});

test('destroyImage is a no-op for missing ids and never throws', async () => {
  await destroyImage(undefined);
  await destroyImage('local:does-not-exist.png');
});

test('local public ids cannot escape the uploads directory', async () => {
  const fs = require('fs');
  const path = require('path');
  await destroyImage('local:../../package.json');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'package.json')), true);
});

test('mongoose id guard used by the routes', () => {
  assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
  assert.equal(isValidObjectId('not-an-id'), false);
});

// --- store-agnostic helpers ------------------------------------------------

test('buildFilter validates query parameters', () => {
  assert.deepEqual(buildFilter({}), {});
  assert.deepEqual(buildFilter({ type: 'Lost', category: 'Books' }), { type: 'Lost', category: 'Books' });
  assert.throws(() => buildFilter({ type: 'Maybe' }), /type must be/);
  assert.throws(() => buildFilter({ category: 'Spaceship' }), /Unknown category/);
  assert.throws(() => buildFilter({ status: 'Sold' }), /Unknown status/);
  assert.throws(() => buildFilter({ from: 'not-a-date' }), /valid date/);
});

test('buildFilter parses dates and truncates long input', () => {
  const filter = buildFilter({ from: '2024-01-01', search: 'x'.repeat(200) });
  assert.ok(filter.from instanceof Date);
  assert.equal(filter.search.length, 100);
});

test('serializeItem strips every private field', () => {
  const item = serializeItem({
    _id: 'abc',
    itemName: 'Wallet',
    __v: 0,
    imagePublicId: 'lost-and-found/secret',
    hiddenDetails: 'blue sticker',
  });
  assert.deepEqual(Object.keys(item).sort(), ['_id', 'itemName']);
});

// --- memory store ----------------------------------------------------------

const memoryItem = () => ({
  type: 'Found',
  itemName: 'Black Leather Wallet',
  description: 'Wallet found on a bus',
  category: 'Wallet',
  location: 'Meskel Square, Addis Ababa',
  date: new Date('2024-05-01'),
  hiddenDetails: 'blue sticker',
  imagePublicId: 'local:x.png',
  imageUrl: '/uploads/x.png',
});

test('memory store creates, reads and hides private fields', async () => {
  const store = createMemoryStore([]);
  const created = await store.create(memoryItem());

  assert.ok(store.isValidId(created._id));
  assert.equal(created.hiddenDetails, undefined);
  assert.equal(created.status, 'Unclaimed');

  const fetched = await store.get(created._id);
  assert.equal(fetched.itemName, 'Black Leather Wallet');

  const priv = await store.getPrivate(created._id);
  assert.equal(priv.hiddenDetails, 'blue sticker');
});

test('memory store filters, searches and paginates', async () => {
  const store = createMemoryStore([]);
  await store.create({ ...memoryItem(), itemName: 'Nokia 3310', category: 'Electronics', type: 'Lost' });
  await store.create({ ...memoryItem(), itemName: 'Blue Umbrella', category: 'Other' });
  await store.create({ ...memoryItem(), itemName: 'Red Scarf', category: 'Clothing' });

  const electronics = await store.list({ filter: buildFilter({ category: 'Electronics' }), page: 1, limit: 10 });
  assert.equal(electronics.total, 1);

  const lost = await store.list({ filter: buildFilter({ type: 'Lost' }), page: 1, limit: 10 });
  assert.equal(lost.total, 1);

  const search = await store.list({ filter: buildFilter({ search: 'umbrella' }), page: 1, limit: 10 });
  assert.equal(search.total, 1);

  const page2 = await store.list({ filter: {}, page: 2, limit: 2 });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.total, 3);
});

test('memory store updates, resolves and deletes items', async () => {
  const store = createMemoryStore([]);
  const created = await store.create(memoryItem());

  const updated = await store.update(created._id, { status: 'Claimed' });
  assert.equal(updated.item.status, 'Claimed');
  assert.ok(updated.item.resolvedAt);

  const reopened = await store.update(created._id, { status: 'Unclaimed' });
  assert.equal(reopened.item.resolvedAt, null);

  const stats = await store.stats();
  assert.deepEqual(stats, { total: 1, lost: 0, found: 1, claimed: 0, unclaimed: 1 });

  const removed = await store.remove(created._id);
  assert.equal(removed.imagePublicId, 'local:x.png');
  assert.equal(await store.get(created._id), null);
  assert.equal(await store.update(created._id, { itemName: 'x' }), null);
});

test('memory store seeds demo data', async () => {
  const { SEED_ITEMS } = require('../seed');
  const store = createMemoryStore(SEED_ITEMS);
  const { total } = await store.stats();
  assert.equal(total, SEED_ITEMS.length);
});
