/**
 * Converts a stored item into the shape that is safe to send to clients.
 * Private fields (imagePublicId, hiddenDetails) are always removed here so a
 * single place owns what leaves the API.
 */
const serializeItem = (doc) => {
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const { __v, imagePublicId, hiddenDetails, _id, ...rest } = plain;
  return { _id: String(_id), ...rest };
};

module.exports = { serializeItem };
