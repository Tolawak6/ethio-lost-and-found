const mongoose = require('mongoose');
const { Item } = require('../models/Item');
const { serializeItem } = require('./serialize');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toQuery = (filter) => {
  const conditions = [];
  if (filter.type) conditions.push({ type: filter.type });
  if (filter.category) conditions.push({ category: filter.category });
  if (filter.status) conditions.push({ status: filter.status });
  if (filter.location) {
    conditions.push({ location: { $regex: escapeRegex(filter.location), $options: 'i' } });
  }
  if (filter.from || filter.to) {
    const range = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    conditions.push({ date: range });
  }
  if (filter.search) {
    const pattern = new RegExp(escapeRegex(filter.search), 'i');
    conditions.push({ $or: [{ itemName: pattern }, { description: pattern }, { location: pattern }] });
  }
  if (!conditions.length) return {};
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const PUBLIC_PROJECTION = '-__v -imagePublicId -hiddenDetails';

const createMongoStore = () => ({
  kind: 'mongodb',

  async init() {
    mongoose.set('strictQuery', true);
    return mongoose.connection.readyState === 1;
  },

  isReady() {
    return mongoose.connection.readyState === 1;
  },

  isValidId(id) {
    return mongoose.isValidObjectId(id);
  },

  async list({ filter, page, limit }) {
    const query = toQuery(filter);
    const [docs, total] = await Promise.all([
      Item.find(query)
        .sort({ createdAt: -1 })
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

  async create(payload) {
    const doc = await Item.create(payload);
    return serializeItem(doc);
  },

  async update(id, changes) {
    const doc = await Item.findById(id).select('+imagePublicId +hiddenDetails');
    if (!doc) return null;

    const previousImageUrl = doc.imageUrl;
    const previousPublicId = doc.imagePublicId;
    Object.assign(doc, changes);
    await doc.save();

    return {
      item: serializeItem(doc),
      previousImageUrl,
      previousPublicId,
    };
  },

  async getPrivate(id) {
    const doc = await Item.findById(id).select('+imagePublicId +hiddenDetails').lean();
    return doc ? { imagePublicId: doc.imagePublicId, hiddenDetails: doc.hiddenDetails } : null;
  },

  async remove(id) {
    const doc = await Item.findByIdAndDelete(id).select('+imagePublicId');
    if (!doc) return null;
    return { item: serializeItem(doc), imagePublicId: doc.imagePublicId };
  },

  async stats() {
    const [total, lost, found, claimed, unclaimed] = await Promise.all([
      Item.countDocuments(),
      Item.countDocuments({ type: 'Lost' }),
      Item.countDocuments({ type: 'Found' }),
      Item.countDocuments({ status: 'Claimed' }),
      Item.countDocuments({ status: 'Unclaimed' }),
    ]);
    return { total, lost, found, claimed, unclaimed };
  },
});

module.exports = { createMongoStore };
