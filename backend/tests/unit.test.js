process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = require('path').join(__dirname, 'tmp-uploads');
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateItemPayload,
  validateClaimPayload,
  FIELD_LIMITS,
} = require('../middleware/validateItem');
const { storeImage, destroyImage, EXTENSION_BY_MIME } = require('../upload');
const { CATEGORIES, AGENCIES } = require('../models/Item');
const { createMemoryStore } = require('../store/memoryStore');
const { buildFilter } = require('../store/filter');
const { serializeItem, serializeClaim } = require('../store/serialize');

const validItem = () => ({
  itemName: 'Black leather wallet',
  description: 'Black wallet found on the back seat after the last trip.',
  category: 'Wallet',
  plateNumber: 'aa-3-12345',
  busCode: 'B-118',
  route: 'Merkato – Bole',
  foundOnBoard: 'Back seat',
  foundAt: '2026-10-30',
  agency: 'Anbessa City Bus',
  reportedBy: 'Supervisor Tesfaye A.',
});

beforeEach(() => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
});

// ---------------------------------------------------------------- item rules

test('item validation accepts a complete bus record', () => {
  const { valid, errors, data } = validateItemPayload(validItem());
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(data.category, 'Wallet');
  assert.equal(data.agency, 'Anbessa City Bus');
});

test('plate numbers are normalised to upper case', () => {
  const { data } = validateItemPayload(validItem());
  assert.equal(data.plateNumber, 'AA-3-12345');
});

test('item validation requires the bus essentials', () => {
  const { valid, errors } = validateItemPayload({});
  assert.equal(valid, false);
  ['itemName', 'description', 'category', 'plateNumber', 'foundAt'].forEach((field) => {
    assert.ok(errors[field], `${field} should be reported`);
  });
});

test('item validation trims text and rejects blanks', () => {
  const ok = validateItemPayload({ ...validItem(), itemName: '   Wallet   ' });
  assert.equal(ok.valid, true);
  assert.equal(ok.data.itemName, 'Wallet');

  const blank = validateItemPayload({ ...validItem(), itemName: '   ' });
  assert.equal(blank.valid, false);
  assert.ok(blank.errors.itemName);
});

test('optional blank fields are omitted rather than stored empty', () => {
  const { data, valid } = validateItemPayload({ ...validItem(), route: '', busCode: '  ' });
  assert.equal(valid, true);
  assert.equal(data.route, undefined);
  assert.equal(data.busCode, undefined);
});

test('item validation enforces maximum lengths', () => {
  const { valid, errors } = validateItemPayload({
    ...validItem(),
    description: 'x'.repeat(FIELD_LIMITS.description + 1),
  });
  assert.equal(valid, false);
  assert.ok(errors.description);
});

test('item validation rejects unknown categories and agencies', () => {
  const { valid, errors } = validateItemPayload({
    ...validItem(),
    category: 'Spaceship',
    agency: 'Rocket Bus',
  });
  assert.equal(valid, false);
  assert.ok(errors.category);
  assert.ok(errors.agency);
});

test('every declared category and agency is accepted', () => {
  CATEGORIES.forEach((category) => {
    assert.equal(validateItemPayload({ ...validItem(), category }).valid, true, category);
  });
  AGENCIES.forEach((agency) => {
    assert.equal(validateItemPayload({ ...validItem(), agency }).valid, true, agency);
  });
});

test('item validation rejects impossible plate numbers', () => {
  ['a', '!!!!', '  ', 'A!B@C'].forEach((plateNumber) => {
    const { valid, errors } = validateItemPayload({ ...validItem(), plateNumber });
    assert.equal(valid, false, `plate ${plateNumber} should fail`);
    assert.ok(errors.plateNumber);
  });
});

test('item validation rejects future found dates', () => {
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const { valid, errors } = validateItemPayload({ ...validItem(), foundAt: future });
  assert.equal(valid, false);
  assert.ok(errors.foundAt);

  const past = new Date(Date.now() - 864e5).toISOString();
  assert.equal(validateItemPayload({ ...validItem(), foundAt: past }).valid, true);
});

test('storage deadline is derived as 90 days after foundAt', () => {
  const { data } = validateItemPayload({ ...validItem(), foundAt: '2026-01-01' });
  assert.equal(new Date(data.storageDeadline).toISOString().slice(0, 10), '2026-04-01');
});

test('partial item validation only checks provided fields', () => {
  const ok = validateItemPayload({ status: 'Returned' }, { partial: true });
  assert.equal(ok.valid, true);
  assert.deepEqual(ok.data, { status: 'Returned' });

  const bad = validateItemPayload({ status: 'Sold' }, { partial: true });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.status);
});

test('every lifecycle status is accepted', () => {
  ['In Storage', 'Claim Pending', 'Returned', 'Disposed'].forEach((status) => {
    const res = validateItemPayload({ ...validItem(), status });
    assert.equal(res.valid, true, `${status}: ${JSON.stringify(res.errors)}`);
    assert.equal(res.data.status, status);
  });
});

test('plates with spaces are accepted (AA 3 12345)', () => {
  assert.equal(validateItemPayload({ ...validItem(), plateNumber: 'AA 3 12345' }).valid, true);
});

// ------------------------------------------------------------------- claims

const validClaim = () => ({
  claimantName: 'Hana Tesfaye',
  phone: '0911 234 567',
  email: 'hana@example.com',
  proof: 'The wallet has a blue student ID from Addis Ababa University inside.',
});

test('claim validation accepts a complete claim', () => {
  const { valid, errors, data } = validateClaimPayload(validClaim());
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(data.phone, '0911234567', 'phone should be normalised');
});

test('claim validation requires name, phone and proof', () => {
  const { valid, errors } = validateClaimPayload({});
  assert.equal(valid, false);
  assert.ok(errors.claimantName);
  assert.ok(errors.phone);
  assert.ok(errors.proof);
});

test('claim validation rejects implausible phone numbers', () => {
  ['123', '0012345678', 'not a phone', '+1 555 0100'].forEach((phone) => {
    const { errors } = validateClaimPayload({ ...validClaim(), phone });
    assert.ok(errors.phone, `phone ${phone} should be rejected`);
  });
  ['0911234567', '+251911234567', '0712345678', '+251 912 345 678'].forEach((phone) => {
    const { valid } = validateClaimPayload({ ...validClaim(), phone });
    assert.equal(valid, true, `phone ${phone} should be accepted`);
  });
});

test('claim validation requires meaningful proof', () => {
  const { errors } = validateClaimPayload({ ...validClaim(), proof: 'mine' });
  assert.ok(errors.proof);
});

test('claim validation treats email as optional but validates it', () => {
  const withoutEmail = validateClaimPayload({ ...validClaim(), email: '' });
  assert.equal(withoutEmail.valid, true);
  assert.equal(withoutEmail.data.email, undefined);

  const badEmail = validateClaimPayload({ ...validClaim(), email: 'nope' });
  assert.ok(badEmail.errors.email);
});

// ------------------------------------------------------------------ filters

test('buildFilter validates query parameters', () => {
  assert.deepEqual(buildFilter({}), {});
  assert.deepEqual(buildFilter({ category: 'Wallet', status: 'Returned' }), {
    category: 'Wallet',
    status: 'Returned',
  });
  assert.throws(() => buildFilter({ category: 'Spaceship' }), /Unknown category/);
  assert.throws(() => buildFilter({ status: 'Sold' }), /Unknown status/);
  assert.throws(() => buildFilter({ agency: 'Rocket Bus' }), /Unknown agency/);
  assert.throws(() => buildFilter({ from: 'nope' }), /valid date/);
});

test('buildFilter upper-cases plate numbers and truncates search', () => {
  const filter = buildFilter({ plateNumber: 'aa-3-1', search: 'x'.repeat(200) });
  assert.equal(filter.plateNumber, 'AA-3-1');
  assert.equal(filter.search.length, 100);
});

test('buildFilter accepts "plate" as an alias', () => {
  assert.equal(buildFilter({ plate: 'aa-3-12345' }).plateNumber, 'AA-3-12345');
});

// ------------------------------------------------------------- serialisation

test('public item serialisation strips every private field', () => {
  const item = serializeItem({
    _id: 'abc',
    itemName: 'Wallet',
    __v: 0,
    imagePublicId: 'lost-and-found/secret',
    identifyingDetails: 'blue sticker',
  });
  assert.deepEqual(Object.keys(item).sort(), ['_id', 'itemName']);
});

test('public claim serialisation hides internal review notes', () => {
  const claim = serializeClaim({
    _id: 'c1',
    reference: 'EC-ABC123',
    status: 'Pending',
    reviewNote: 'Looks suspicious',
    __v: 0,
  });
  assert.equal(claim.reviewNote, undefined);
  assert.equal(claim.reference, 'EC-ABC123');
});

// ------------------------------------------------------------------- uploads

test('local storage writes files with a safe extension and deletes them', async () => {
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

test('destroyImage never throws for missing ids', async () => {
  await destroyImage(undefined);
  await destroyImage('local:does-not-exist.png');
});

test('local public ids cannot escape the uploads directory', async () => {
  const fs = require('fs');
  const path = require('path');
  await destroyImage('local:../../package.json');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'package.json')), true);
});

// --------------------------------------------------------------- memory store

const memoryItem = () => ({
  itemName: 'Black leather wallet',
  description: 'Wallet found on the back seat',
  category: 'Wallet',
  plateNumber: 'AA-3-12345',
  route: 'Merkato – Bole',
  foundAt: new Date('2026-05-01'),
  identifyingDetails: 'blue sticker',
  imagePublicId: 'local:x.png',
  imageUrl: '/uploads/x.png',
});

test('memory store creates items and hides private fields', async () => {
  const store = createMemoryStore([]);
  const created = await store.create(memoryItem());

  assert.ok(store.isValidId(created._id));
  assert.equal(created.identifyingDetails, undefined);
  assert.equal(created.status, 'In Storage');
  assert.ok(created.storageDeadline, 'storage deadline should be derived');

  const fetched = await store.get(created._id);
  assert.equal(fetched.itemName, 'Black leather wallet');

  const raw = await store.findRaw(created._id);
  assert.equal(raw.identifyingDetails, 'blue sticker');
});

test('memory store filters by plate, route, category and search', async () => {
  const store = createMemoryStore([]);
  await store.create({ ...memoryItem(), itemName: 'Nokia 3310', category: 'Electronics', plateNumber: 'AA-3-11111' });
  await store.create({ ...memoryItem(), itemName: 'Blue umbrella', category: 'Other', plateNumber: 'AA-2-22222', route: 'Bole – Megenagna' });

  const byPlate = await store.list({ filter: buildFilter({ plateNumber: 'aa-2-22222' }), page: 1, limit: 10 });
  assert.equal(byPlate.total, 1);
  assert.equal(byPlate.items[0].itemName, 'Blue umbrella');

  const byRoute = await store.list({ filter: buildFilter({ route: 'megenagna' }), page: 1, limit: 10 });
  assert.equal(byRoute.total, 1);

  const byCategory = await store.list({ filter: buildFilter({ category: 'Electronics' }), page: 1, limit: 10 });
  assert.equal(byCategory.total, 1);

  const bySearch = await store.list({ filter: buildFilter({ search: 'nokia' }), page: 1, limit: 10 });
  assert.equal(bySearch.total, 1);
});

test('memory store paginates', async () => {
  const store = createMemoryStore([]);
  for (let i = 0; i < 5; i += 1) await store.create({ ...memoryItem(), itemName: `Item ${i}` });
  const page2 = await store.list({ filter: {}, page: 2, limit: 2 });
  assert.equal(page2.items.length, 2);
  assert.equal(page2.total, 5);
});

test('memory store updates status and derives resolvedAt', async () => {
  const store = createMemoryStore([]);
  const created = await store.create(memoryItem());

  const returned = await store.update(created._id, { status: 'Returned' });
  assert.equal(returned.item.status, 'Returned');
  assert.ok(returned.item.resolvedAt);

  const reopened = await store.update(created._id, { status: 'In Storage' });
  assert.equal(reopened.item.resolvedAt, null);

  assert.equal(await store.update('a'.repeat(24), { status: 'Returned' }), null);
});

test('memory store claim lifecycle', async () => {
  const store = createMemoryStore([]);
  const item = await store.create(memoryItem());

  const claim = await store.createClaim({
    item: item._id,
    claimantName: 'Hana',
    phone: '0911234567',
    proof: 'Blue student ID card inside',
  });
  assert.match(claim.reference, /^EC-[A-Z0-9]{6}$/);
  assert.equal(claim.status, 'Pending');

  await store.update(item._id, { status: 'Claim Pending' });
  assert.equal(await store.countPendingClaims(item._id), 1);

  const found = await store.findClaimByReference(claim.reference);
  assert.equal(found.status, 'Pending');
  assert.equal(found.item.itemName, 'Black leather wallet');

  const reviewed = await store.updateClaim(claim._id, { status: 'Collected', reviewNote: 'ID verified' });
  assert.equal(reviewed.status, 'Collected');
  assert.ok(reviewed.reviewedAt);
  assert.equal(reviewed.reviewNote, 'ID verified');

  assert.equal(await store.findClaimByReference('EC-NOPE00'), null);
  assert.equal(await store.updateClaim('a'.repeat(24), { status: 'Collected' }), null);
});

test('memory store stats and plates', async () => {
  const store = createMemoryStore([]);
  await store.create({ ...memoryItem(), plateNumber: 'AA-3-1' });
  const second = await store.create({ ...memoryItem(), plateNumber: 'AA-3-2' });
  await store.update(second._id, { status: 'Returned' });
  await store.createClaim({ item: second._id, claimantName: 'X', phone: '0911234567', proof: 'proof text here' });

  assert.deepEqual(await store.stats(), { total: 2, inStorage: 1, pending: 0, returned: 1, claimsPending: 1 });
  assert.deepEqual((await store.plates()).sort(), ['AA-3-1', 'AA-3-2']);
});

test('deleting an item also deletes its claims', async () => {
  const store = createMemoryStore([]);
  const item = await store.create(memoryItem());
  const claim = await store.createClaim({ item: item._id, claimantName: 'X', phone: '0911234567', proof: 'proof text here' });

  const removed = await store.remove(item._id);
  assert.equal(removed.imagePublicId, 'local:x.png');
  assert.equal(await store.get(item._id), null);
  assert.equal(await store.getClaim(claim._id), null);
});

test('the seed data is valid and non-empty', async () => {
  const { SEED_ITEMS } = require('../seed');
  assert.ok(SEED_ITEMS.length >= 5);
  SEED_ITEMS.forEach((item) => {
    const { valid, errors } = validateItemPayload({
      ...item,
      foundAt: new Date(item.foundAt).toISOString(),
    });
    assert.equal(valid, true, `${item.itemName}: ${JSON.stringify(errors)}`);
  });

  const store = createMemoryStore(SEED_ITEMS);
  const { total } = await store.stats();
  assert.equal(total, SEED_ITEMS.length);
});

test('memory store applies the same defaults as the Mongoose schema', async () => {
  const store = createMemoryStore([]);
  // A minimal payload, exactly what a staff client may send.
  const created = await store.create({
    itemName: 'Umbrella',
    category: 'Other',
    description: 'Green umbrella',
    plateNumber: 'AA-3-1',
    foundAt: new Date(),
  });
  assert.equal(created.status, 'In Storage');
  assert.equal(created.agency, 'Anbessa City Bus');
  assert.equal(created.storageOffice, 'Lost Property Office, Merkato');
  assert.equal(created.imageUrl, '');
  assert.ok(created.storageDeadline);
  assert.equal(created.resolvedAt, null);
});

test('claim tracking includes the collection office', async () => {
  const store = createMemoryStore([]);
  const item = await store.create(memoryItem());
  const claim = await store.createClaim({
    item: item._id,
    claimantName: 'Hana',
    phone: '0911234567',
    proof: 'Blue student ID card inside the wallet',
  });
  const tracked = await store.findClaimByReference(claim.reference);
  assert.equal(tracked.item.storageOffice, 'Lost Property Office, Merkato');
  assert.equal(tracked.proof, undefined);
});
