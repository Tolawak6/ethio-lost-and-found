/**
 * Staff account storage. Both stores implement the same small interface so
 * `routes/auth.js` never cares which one is active.
 */
const { serializeStaff } = require('./serialize');

/* ------------------------------- MongoDB -------------------------------- */

const createMongoStaffAccounts = () => {
  // Required lazily so the memory store works without loading Mongoose models.
  const model = () => require('../models/Staff').Staff;

  return {
    kind: 'mongodb',

    async count() {
      return model().countDocuments();
    },

    async create({ email, name, passwordHash, depot = '', role = 'staff' }) {
      const doc = await model().create({ email, name, passwordHash, depot, role });
      return serializeStaff(doc);
    },

    async findByEmail(email) {
      const doc = await model()
        .findOne({ email: String(email).toLowerCase().trim() })
        .select('+passwordHash')
        .lean();
      if (!doc) return null;
      return { ...serializeStaff(doc), passwordHash: doc.passwordHash };
    },

    async findById(id) {
      const doc = await model().findById(id).lean();
      return doc ? serializeStaff(doc) : null;
    },

    async touchLogin(id) {
      await model().updateOne({ _id: id }, { $set: { lastLoginAt: new Date() } });
    },

    async updatePassword(id, passwordHash) {
      const res = await model().updateOne({ _id: id }, { $set: { passwordHash } });
      return res.matchedCount > 0;
    },

    async list() {
      const docs = await model().find().sort({ createdAt: 1 }).lean();
      return docs.map(serializeStaff);
    },

    isValidId(id) {
      return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
    },

    async setActive(id, active) {
      const doc = await model().findByIdAndUpdate(id, { $set: { active } }, { new: true }).lean();
      return doc ? serializeStaff(doc) : null;
    },
  };
};

/* ------------------------------ In memory ------------------------------- */

const newStaffId = () => {
  try {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId().toString();
  } catch {
    return require('crypto').randomBytes(12).toString('hex');
  }
};

const createMemoryStaffAccounts = (seed = []) => {
  const rows = seed.map((account) => ({
    _id: newStaffId(),
    depot: '',
    role: 'staff',
    active: true,
    lastLoginAt: null,
    createdAt: new Date(),
    ...account,
  }));

  const find = (id) => rows.find((row) => row._id === id);

  return {
    kind: 'in-memory',

    async count() {
      return rows.length;
    },

    async create({ email, name, passwordHash, depot = '', role = 'staff' }) {
      const row = {
        _id: newStaffId(),
        email: String(email).toLowerCase().trim(),
        name,
        passwordHash,
        depot,
        role,
        active: true,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return serializeStaff(row);
    },

    async findByEmail(email) {
      const row = rows.find((candidate) => candidate.email === String(email).toLowerCase().trim());
      return row ? { ...serializeStaff(row), passwordHash: row.passwordHash } : null;
    },

    async findById(id) {
      const row = find(id);
      return row ? serializeStaff(row) : null;
    },

    async touchLogin(id) {
      const row = find(id);
      if (row) row.lastLoginAt = new Date();
    },

    async updatePassword(id, passwordHash) {
      const row = find(id);
      if (!row) return false;
      row.passwordHash = passwordHash;
      row.updatedAt = new Date();
      return true;
    },

    async list() {
      return rows.map(serializeStaff);
    },

    isValidId(id) {
      return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
    },

    async setActive(id, active) {
      const row = find(id);
      if (!row) return null;
      row.active = Boolean(active);
      row.updatedAt = new Date();
      return serializeStaff(row);
    },

    /** Test helper. */
    async clear() {
      rows.length = 0;
    },
  };
};

module.exports = { createMongoStaffAccounts, createMemoryStaffAccounts };
