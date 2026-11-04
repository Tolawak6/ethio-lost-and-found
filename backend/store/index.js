const mongoose = require('mongoose');
const config = require('../config');
const { createMongoStore } = require('./mongoStore');
const { createMemoryStore } = require('./memoryStore');
const { SEED_ITEMS } = require('../seed');

/**
 * Picks a backend store.
 *   MONGO_URI set   -> MongoDB via Mongoose
 *   otherwise       -> in-memory (development/demo only)
 */
const createStore = ({ seed = true } = {}) => {
  if (!config.mongoUri) {
    console.warn(
      '[db] MONGO_URI is not set — using an IN-MEMORY store. Data will be lost when the server stops.'
    );
    return createMemoryStore(seed ? SEED_ITEMS : []);
  }
  return createMongoStore();
};

/** Connects Mongoose (Mongo store only). Returns true when ready. */
const connectStore = async (store) => {
  if (store.kind !== 'mongodb') return true;
  try {
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: 10000,
    });
    console.log('[db] MongoDB connected');
    return true;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    return false;
  }
};

/** Seeds demo records into an empty Mongo database on first boot. */
const seedIfEmpty = async (store) => {
  if (!config.seedDemoData) return;
  const { total } = await store.stats();
  if (total > 0) return;
  for (const item of SEED_ITEMS) {
    // eslint-disable-next-line no-await-in-loop
    await store.create({ ...item });
  }
  console.log(`[db] seeded ${SEED_ITEMS.length} demo items`);
};

module.exports = { createStore, connectStore, seedIfEmpty };
