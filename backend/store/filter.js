/**
 * Turns query string parameters into a validated, store-agnostic filter.
 * Every backend adapter implements the exact same search semantics.
 */
const { CATEGORIES, STATUSES, AGENCIES } = require('../models/Item');

const asString = (value) => (typeof value === 'string' ? value.trim() : '');

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 422;
  return err;
};

const buildFilter = (query = {}) => {
  const filter = {};

  const category = asString(query.category);
  if (category) {
    if (!CATEGORIES.includes(category)) throw badRequest(`Unknown category: ${category}`);
    filter.category = category;
  }

  const status = asString(query.status);
  if (status) {
    if (!STATUSES.includes(status)) throw badRequest(`Unknown status: ${status}`);
    filter.status = status;
  }

  const agency = asString(query.agency);
  if (agency) {
    if (!AGENCIES.includes(agency)) throw badRequest(`Unknown agency: ${agency}`);
    filter.agency = agency;
  }

  // The plate number is what passengers usually remember.
  const plate = asString(query.plateNumber || query.plate);
  if (plate) filter.plateNumber = plate.toUpperCase().slice(0, 20);

  const route = asString(query.route);
  if (route) filter.route = route.slice(0, 120);

  const search = asString(query.search);
  if (search) filter.search = search.slice(0, 100);

  ['from', 'to'].forEach((key) => {
    const value = asString(query[key]);
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw badRequest(`${key} must be a valid date`);
    filter[key] = date;
  });

  return filter;
};

module.exports = { buildFilter };
