const mongoose = require('mongoose');
const { Item } = require('../models/Item');
const { Claim } = require('../models/Claim');
const { AuditEntry } = require('../models/AuditEntry');
const { serializeItem, serializeClaim, serializeStaffClaim, serializeAuditEntry } = require('./serialize');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toQuery = (filter) => {
  const conditions = [];
  if (filter.category) conditions.push({ category: filter.category });
  if (filter.status) conditions.push({ status: filter.status });
  if (filter.agency) conditions.push({ agency: filter.agency });
  if (filter.depot) conditions.push({ depot: filter.depot });
  // Depot scoping for staff: own depot, plus legacy rows that predate scoping.
  if (filter.depotScope) conditions.push({ $or: [{ depot: filter.depotScope }, { depot: '' }, { depot: { $exists: false } }] });
  if (filter.plateNumber) conditions.push({ plateNumber: filter.plateNumber });
  if (filter.route) {
    conditions.push({ route: { $regex: escapeRegex(filter.route), $options: 'i' } });
  }
  if (filter.from || filter.to) {
    const range = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    conditions.push({ foundAt: range });
  }
  if (filter.search) {
    const pattern = new RegExp(escapeRegex(filter.search), 'i');
    conditions.push({
      $or: [
        { itemName: pattern },
        { description: pattern },
        { route: pattern },
        { plateNumber: pattern },
        { busCode: pattern },
      ],
    });
  }
  if (!conditions.length) return {};
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const PUBLIC_PROJECTION = '-__v -imagePublicId -identifyingDetails';

const createMongoStore = () => ({
  kind: 'mongodb',


  isReady() {
    return mongoose.connection.readyState === 1;
  },

  isValidId(id) {
    return mongoose.isValidObjectId(id);
  },

  // --- items --------------------------------------------------------------

  async list({ filter, page, limit }) {
    const query = toQuery(filter);
    const [docs, total] = await Promise.all([
      Item.find(query)
        .sort({ foundAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(PUBLIC_PROJECTION)
        .lean(),
      Item.countDocuments(query),
    ]);
    return { items: docs.map(serializeItem), total };
  },

  async get(id) {
    const doc = await Item.findById(id).select(PUBLIC_PROJECTION).lean();
    return doc ? serializeItem(doc) : null;
  },

  /** Raw document for internal checks (existence, status). */
  /** Routing/authorisation view of an item — never the private fields. */
  async findRaw(id) {
    return Item.findById(id).select('status plateNumber itemName depot imagePublicId').lean();
  },

  async create(payload) {
    const doc = await Item.create(payload);
    return serializeItem(doc);
  },

  async update(id, changes) {
    const doc = await Item.findById(id).select('+imagePublicId +identifyingDetails');
    if (!doc) return null;

    const previousImageUrl = doc.imageUrl;
    const previousPublicId = doc.imagePublicId;
    Object.assign(doc, changes);
    await doc.save();

    return { item: serializeItem(doc), previousImageUrl, previousPublicId };
  },

  async remove(id) {
    const doc = await Item.findByIdAndDelete(id).select('+imagePublicId');
    if (!doc) return null;
    await Claim.deleteMany({ item: doc._id });
    return { item: serializeItem(doc), imagePublicId: doc.imagePublicId };
  },

  async stats() {
    const [total, inStorage, pending, returned, claimsPending] = await Promise.all([
      Item.countDocuments(),
      Item.countDocuments({ status: 'In Storage' }),
      Item.countDocuments({ status: 'Claim Pending' }),
      Item.countDocuments({ status: 'Returned' }),
      Claim.countDocuments({ status: 'Pending' }),
    ]);
    return { total, inStorage, pending, returned, claimsPending };
  },

  /** Distinct plate numbers, for search suggestions. */
  async plates(limit = 20) {
    const values = await Item.distinct('plateNumber');
    return values.filter(Boolean).slice(0, limit);
  },

  // --- claims -------------------------------------------------------------

  async createClaim(payload) {
    const doc = await Claim.create(payload);
    return serializeClaim(doc);
  },

  async listClaims(itemId) {
    const docs = await Claim.find({ item: itemId }).sort({ createdAt: -1 }).lean();
    return docs.map(serializeStaffClaim);
  },

  async getClaim(id) {
    const doc = await Claim.findById(id).lean();
    return doc ? serializeClaim(doc) : null;
  },

  async findClaimForReview(id) {
    return Claim.findById(id).lean();
  },

  async updateClaim(id, changes) {
    const doc = await Claim.findByIdAndUpdate(
      id,
      { ...changes, reviewedAt: changes.status && changes.status !== 'Pending' ? new Date() : null },
      { new: true }
    ).lean();
    return doc ? serializeStaffClaim(doc) : null;
  },

  async getPrivateItem(id) {
    const doc = await Item.findById(id).select('+identifyingDetails').lean();
    return doc ? { identifyingDetails: doc.identifyingDetails } : null;
  },

  // --------------------------------------------------------------- audit trail
  /**
   * Append an audit entry. Deliberately swallows errors: losing a log line is
   * bad, but it must never turn a successful update into a failed request.
   */
  async recordAudit(entry) {
    try {
      const doc = await AuditEntry.create(entry);
      return serializeAuditEntry(doc);
    } catch (err) {
      console.error('[audit] could not record entry:', err.message);
      return null;
    }
  },

  async listAudit({ filter = {}, page = 1, limit = 50 } = {}) {
    const query = {};
    // Two independent constraints are each an $or, so they have to be combined
    // with $and — writing both to query.$or would let the second replace the
    // first and quietly widen the result set.
    const and = [];
    if (filter.entity) query.entity = filter.entity;
    if (filter.entityId) query.entityId = filter.entityId;
    // An item's history also covers claim decisions made against it.
    if (filter.relatedItemId) {
      const id = filter.relatedItemId;
      and.push({ $or: [{ entityId: id }, { 'details.itemId': id }] });
    }
    if (filter.action) query.action = filter.action;
    if (filter.actorId) query.actorId = filter.actorId;
    if (filter.depotScope) {
      // Own depot, plus legacy entries with no depot recorded.
      and.push({ $or: [{ actorDepot: filter.depotScope }, { actorDepot: '' }, { actorDepot: { $exists: false } }] });
    }
    if (and.length) query.$and = and;
    const [docs, total] = await Promise.all([
      AuditEntry.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditEntry.countDocuments(query),
    ]);
    return { entries: docs.map(serializeAuditEntry), total };
  },

  async findClaimByReference(reference) {
    const doc = await Claim.findOne({ reference }).lean();
    if (!doc) return null;
    const item = await Item.findById(doc.item).select('itemName plateNumber status storageOffice').lean();
    return {
      reference: doc.reference,
      status: doc.status,
      submittedAt: doc.createdAt,
      item: item
        ? {
            _id: String(item._id),
            itemName: item.itemName,
            plateNumber: item.plateNumber,
            status: item.status,
            storageOffice: item.storageOffice,
          }
        : null,
    };
  },

  async countPendingClaims(itemId) {
    return Claim.countDocuments({ item: itemId, status: 'Pending' });
  },
});

module.exports = { createMongoStore };
