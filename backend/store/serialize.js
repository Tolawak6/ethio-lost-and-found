/**
 * Shapes data for clients. This is the single place that decides what leaves
 * the API, so private fields can never leak from an individual route.
 */

const toPlain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });

/** Public item. `identifyingDetails` and storage internals stay private. */
const serializeItem = (doc) => {
  const plain = toPlain(doc);
  const { __v, imagePublicId, identifyingDetails, _id, ...rest } = plain;
  return { _id: String(_id), ...rest };
};

/**
 * Item plus moderation detail for department screens.
 * Includes claim counts and the private identifying details.
 */
const serializeStaffItem = (doc, extra = {}) => {
  const plain = toPlain(doc);
  const { __v, imagePublicId, _id, ...rest } = plain;
  return { _id: String(_id), ...rest, ...extra };
};

/** Public claim: no internal notes, no staff-only fields. */
const serializeClaim = (doc) => {
  const plain = toPlain(doc);
  const { __v, _id, reviewNote, ...rest } = plain;
  return { _id: String(_id), ...rest };
};

/** Claim as the department sees it, including the review note. */
const serializeStaffClaim = (doc) => {
  const plain = toPlain(doc);
  const { __v, _id, ...rest } = plain;
  return { _id: String(_id), ...rest };
};

module.exports = { serializeItem, serializeStaffItem, serializeClaim, serializeStaffClaim };
