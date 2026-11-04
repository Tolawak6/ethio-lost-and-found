/**
 * In-memory store for demos and a fresh clone (no MongoDB needed).
 * Data lives for the lifetime of the process; the server warns about it.
 * Implements the same interface as mongoStore.
 */
const crypto = require('crypto');
const { serializeItem, serializeClaim, serializeStaffClaim } = require('./serialize');

const newId = () => {
  try {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId().toString();
  } catch {
    return crypto.randomBytes(12).toString('hex');
  }
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const includes = (haystack, needle) =>
  String(haystack || '').toLowerCase().includes(String(needle).toLowerCase());

const matches = (item, filter) => {
  if (filter.category && item.category !== filter.category) return false;
  if (filter.status && item.status !== filter.status) return false;
  if (filter.agency && item.agency !== filter.agency) return false;
  if (filter.plateNumber && item.plateNumber !== filter.plateNumber) return false;
  if (filter.route && !includes(item.route, filter.route)) return false;
  if (filter.from || filter.to) {
    const date = toDate(item.foundAt);
    if (!date) return false;
    if (filter.from && date < filter.from) return false;
    if (filter.to && date > filter.to) return false;
  }
  if (filter.search) {
    const fields = [item.itemName, item.description, item.route, item.plateNumber, item.busCode];
    if (!fields.some((field) => includes(field, filter.search))) return false;
  }
  return true;
};

const withDeadline = (item) => {
  if (item.storageDeadline || !item.foundAt) return item;
  const deadline = new Date(item.foundAt);
  deadline.setDate(deadline.getDate() + 90);
  return { ...item, storageDeadline: deadline };
};

/** Applies the same defaults the Mongoose schema applies, so the two stores
 *  behave identically for clients. */
const withDefaults = (item) =>
  withDeadline({
    status: 'In Storage',
    agency: 'Anbessa City Bus',
    imageUrl: '',
    resolvedAt: null,
    storageOffice: 'Lost Property Office, Merkato',
    ...item,
  });

const createMemoryStore = (seed = []) => {
  /** Rows keep public fields apart from ones that must never be echoed. */
  const rows = seed.map((item) => {
    const now = new Date();
    const { imagePublicId, identifyingDetails, ...publicFields } = item;
    return {
      publicFields: withDefaults({
        _id: newId(),
        createdAt: now,
        updatedAt: now,
        ...publicFields,
      }),
      privateFields: { imagePublicId, identifyingDetails },
    };
  });

  const claims = [];

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

    // --- items ------------------------------------------------------------

    async list({ filter, page, limit }) {
      const filtered = rows
        .map((row) => row.publicFields)
        .filter((item) => matches(item, filter))
        .sort((a, b) => new Date(b.foundAt || b.createdAt) - new Date(a.foundAt || a.createdAt));
      const start = (page - 1) * limit;
      return { items: filtered.slice(start, start + limit).map(serializeItem), total: filtered.length };
    },

    async get(id) {
      const row = find(id);
      return row ? serializeItem(row.publicFields) : null;
    },

    async findRaw(id) {
      const row = find(id);
      if (!row) return null;
      return { ...row.publicFields, ...row.privateFields, _id: row.publicFields._id };
    },

    async create(payload) {
      const now = new Date();
      const { imagePublicId, identifyingDetails, ...publicFields } = payload;
      const row = {
        publicFields: withDefaults({
          _id: newId(),
          createdAt: now,
          updatedAt: now,
          ...publicFields,
        }),
        privateFields: { imagePublicId, identifyingDetails },
      };
      rows.push(row);
      return serializeItem(row.publicFields);
    },

    async update(id, changes) {
      const row = find(id);
      if (!row) return null;
      const { imagePublicId, identifyingDetails, ...publicFields } = changes;

      const previousImageUrl = row.publicFields.imageUrl;
      const previousPublicId = row.privateFields.imagePublicId;

      if (identifyingDetails !== undefined) row.privateFields.identifyingDetails = identifyingDetails;
      if (imagePublicId !== undefined) row.privateFields.imagePublicId = imagePublicId;

      Object.assign(row.publicFields, publicFields);
      row.publicFields.updatedAt = new Date();
      row.publicFields.resolvedAt =
        row.publicFields.status === 'Returned' ? row.publicFields.resolvedAt || new Date() : null;
      row.publicFields = withDefaults(row.publicFields);

      return { item: serializeItem(row.publicFields), previousImageUrl, previousPublicId };
    },

    async remove(id) {
      const index = rows.findIndex((row) => row.publicFields._id === id);
      if (index === -1) return null;
      const [row] = rows.splice(index, 1);
      for (let i = claims.length - 1; i >= 0; i -= 1) {
        if (claims[i].item === id) claims.splice(i, 1);
      }
      return {
        item: serializeItem(row.publicFields),
        imagePublicId: row.privateFields.imagePublicId,
      };
    },

    async stats() {
      const items = rows.map((row) => row.publicFields);
      return {
        total: items.length,
        inStorage: items.filter((item) => item.status === 'In Storage').length,
        pending: items.filter((item) => item.status === 'Claim Pending').length,
        returned: items.filter((item) => item.status === 'Returned').length,
        claimsPending: claims.filter((claim) => claim.status === 'Pending').length,
      };
    },

    async plates(limit = 20) {
      return [...new Set(rows.map((row) => row.publicFields.plateNumber).filter(Boolean))].slice(0, limit);
    },

    // --- claims -----------------------------------------------------------

    async createClaim(payload) {
      const now = new Date();
      const claim = {
        _id: newId(),
        status: 'Pending',
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
        reference: `EC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        ...payload,
      };
      claims.push(claim);
      return serializeClaim(claim);
    },

    async listClaims(itemId) {
      return claims
        .filter((claim) => claim.item === itemId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(serializeStaffClaim);
    },

    async getClaim(id) {
      const claim = claims.find((candidate) => candidate._id === id);
      return claim ? serializeClaim(claim) : null;
    },

    async findClaimForReview(id) {
      const claim = claims.find((candidate) => candidate._id === id);
      return claim ? { ...claim } : null;
    },

    async updateClaim(id, changes) {
      const claim = claims.find((candidate) => candidate._id === id);
      if (!claim) return null;
      Object.assign(claim, changes);
      claim.updatedAt = new Date();
      claim.reviewedAt = claim.status !== 'Pending' ? new Date() : null;
      return serializeStaffClaim(claim);
    },

    async getPrivateItem(id) {
      const row = find(id);
      return row ? { identifyingDetails: row.privateFields.identifyingDetails } : null;
    },

    async findClaimByReference(reference) {
      const claim = claims.find((candidate) => candidate.reference === reference);
      if (!claim) return null;
      const row = find(claim.item);
      return {
        reference: claim.reference,
        status: claim.status,
        submittedAt: claim.createdAt,
        item: row
          ? {
              _id: row.publicFields._id,
              itemName: row.publicFields.itemName,
              plateNumber: row.publicFields.plateNumber,
              status: row.publicFields.status,
              storageOffice: row.publicFields.storageOffice,
            }
          : null,
      };
    },

    async countPendingClaims(itemId) {
      return claims.filter((claim) => claim.item === itemId && claim.status === 'Pending').length;
    },

    /** Test helper. */
    reset() {
      rows.length = 0;
      claims.length = 0;
    },

    /** Test helper: seed a staff-visible item with private fields. */
    seed(items) {
      items.forEach((item) => {
        const now = new Date();
        const { imagePublicId, identifyingDetails, ...publicFields } = item;
        rows.push({
          publicFields: withDefaults({
            _id: newId(),
            createdAt: now,
            updatedAt: now,
            ...publicFields,
          }),
          privateFields: { imagePublicId, identifyingDetails },
        });
      });
    },
  };
};

module.exports = { createMemoryStore };
