/**
 * Turns the query string into a plain, validated filter object.
 * Keeping this store-agnostic means every backend adapter implements the
 * exact same search semantics.
 */
const { CATEGORIES, STATUSES } = require('../models/Item');

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const buildFilter = (query = {}) => {
  const filter = {};

  const type = asString(query.type);
  if (type) {
    if (!['Lost', 'Found'].includes(type)) {
      const err = new Error('type must be "Lost" or "Found"');
      err.status = 422;
      throw err;
    }
    filter.type = type;
  }

  const category = asString(query.category);
  if (category) {
    if (!CATEGORIES.includes(category)) {
      const err = new Error(`Unknown category: ${category}`);
      err.status = 422;
      throw err;
    }
    filter.category = category;
  }

  const status = asString(query.status);
  if (status) {
    if (!STATUSES.includes(status)) {
      const err = new Error(`Unknown status: ${status}`);
      err.status = 422;
      throw err;
    }
    filter.status = status;
  }

  const location = asString(query.location);
  if (location) filter.location = location.slice(0, 160);

  const search = asString(query.search);
  if (search) filter.search = search.slice(0, 100);

  ['from', 'to'].forEach((key) => {
    const value = asString(query[key]);
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      const err = new Error(`${key} must be a valid date`);
      err.status = 422;
      throw err;
    }
    filter[key] = date;
  });

  return filter;
};

module.exports = { buildFilter };
