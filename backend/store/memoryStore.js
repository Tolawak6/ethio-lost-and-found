/**
 * In-memory store used when no MONGO_URI is configured (quick demo, fresh
 * clone). Data lives only for the lifetime of the process — the server warns
 * about this loudly on boot. Implements the same interface as mongoStore.
 */
const { serializeItem } = require('./serialize');

const newId = () => {
  try {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId().toString();
  } catch {
    return require('crypto').randomBytes(12).toString('hex');
  }
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const matches = (item, filter) => {
  if (filter.type && item.type !== filter.type) return false;
  if (filter.category && item.category !== filter.category) return false;
  if (filter.status && item.status !== filter.status) return false;
  if (filter.location && !String(item.location).toLowerCase().includes(filter.location.toLowerCase())) {
    return false;
  }
  if (filter.from || filter.to) {
    const date = toDate(item.date);
    if (!date) return false;
    if (filter.from && date < filter.from) return false;
    if (filter.to && date > filter.to) return false;
  }
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = `${item.itemName} ${item.description} ${item.location}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
};

const createMemoryStore = (seed = []) => {
  /** Rows hold public fields plus a private bag out of the client's reach. */
  const rows = seed.map((item) => {
    const now = new Date();
    const { imagePublicId, hiddenDetails, ...publicFields } = item;
    return {
      publicFields: {
        _id: newId(),
        createdAt: now,
        updatedAt: now,
        type: 'Found',
        status: 'Unclaimed',
        imageUrl: '',
        resolvedAt: null,
        ...publicFields,
      },
      privateFields: { imagePublicId, hiddenDetails },
    };
  });

  const find = (id) => rows.find((row) => row.publicFields._id === id);

  return {
    kind: 'in-memory',

    async init() {
      return true;
    },

    isReady() {
      return true;
    },

    isValidId(id) {
      return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
    },

    async list({ filter, page, limit }) {
      const filtered = rows
        .map((row) => row.publicFields)
        .filter((item) => matches(item, filter))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const start = (page - 1) * limit;
      return { items: filtered.slice(start, start + limit).map(serializeItem), total: filtered.length };
    },

    async get(id) {
      const row = find(id);
      return row ? serializeItem(row.publicFields) : null;
    },

    async create(payload) {
      const now = new Date();
      const { imagePublicId, hiddenDetails, ...publicFields } = payload;
      const row = {
        publicFields: {
          _id: newId(),
          createdAt: now,
          updatedAt: now,
          type: 'Found',
          status: 'Unclaimed',
          imageUrl: '',
          resolvedAt: null,
          ...publicFields,
        },
        privateFields: { imagePublicId, hiddenDetails },
      };
      if (row.publicFields.status === 'Claimed') row.publicFields.resolvedAt = now;
      rows.push(row);
      return serializeItem(row.publicFields);
    },

    async update(id, changes) {
      const row = find(id);
      if (!row) return null;
      const { imagePublicId, hiddenDetails, ...publicFields } = changes;

      const previousImageUrl = row.publicFields.imageUrl;
      const previousPublicId = row.privateFields.imagePublicId;

      if (hiddenDetails !== undefined) row.privateFields.hiddenDetails = hiddenDetails;
      if (imagePublicId !== undefined) row.privateFields.imagePublicId = imagePublicId;

      Object.assign(row.publicFields, publicFields);
      row.publicFields.updatedAt = new Date();
      row.publicFields.resolvedAt =
        row.publicFields.status === 'Claimed'
          ? row.publicFields.resolvedAt || new Date()
          : null;

      return { item: serializeItem(row.publicFields), previousImageUrl, previousPublicId };
    },

    async getPrivate(id) {
      const row = find(id);
      return row ? { ...row.privateFields } : null;
    },

    async remove(id) {
      const index = rows.findIndex((row) => row.publicFields._id === id);
      if (index === -1) return null;
      const [row] = rows.splice(index, 1);
      return {
        item: serializeItem(row.publicFields),
        imagePublicId: row.privateFields.imagePublicId,
      };
    },

    async stats() {
      const items = rows.map((row) => row.publicFields);
      return {
        total: items.length,
        lost: items.filter((item) => item.type === 'Lost').length,
        found: items.filter((item) => item.type === 'Found').length,
        claimed: items.filter((item) => item.status === 'Claimed').length,
        unclaimed: items.filter((item) => item.status === 'Unclaimed').length,
      };
    },

    /** Test helper: empties the store. */
    reset() {
      rows.length = 0;
    },
  };
};

module.exports = { createMemoryStore };
