/**
 * Helpers for writing the department audit trail.
 *
 * Every write the department makes funnels through here so the trail has one
 * shape: an action, the entity it touched, and a snapshot of the account that
 * did it. Recording is best-effort — `recordAudit` returns null on failure
 * rather than throwing, because a lost log line must not fail a real update.
 */

const MAX_DETAIL_VALUE = 300;

/** Trims nested detail values so a stray image blob can't fill the log. */
const sanitizeDetails = (details = {}) => {
  const clean = {};
  Object.entries(details).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (value instanceof Date) {
      clean[key] = value.toISOString();
    } else if (typeof value === 'object') {
      clean[key] = JSON.parse(JSON.stringify(value).slice(0, MAX_DETAIL_VALUE));
    } else {
      clean[key] = String(value).slice(0, MAX_DETAIL_VALUE);
    }
  });
  return clean;
};

/** The actor snapshot taken from `req.staff` (set by the auth middleware). */
const actorFrom = (staff = {}) => ({
  actorId: String(staff._id || ''),
  actorName: staff.name || '',
  actorEmail: staff.email || '',
  actorDepot: staff.depot || '',
});

/**
 * @param {object} store
 * @param {object} params
 * @param {string} params.action    e.g. 'item.updated'
 * @param {string} params.entity    item | claim | account | session
 * @param {object} [params.staff]   req.staff
 * @param {string} [params.entityId]
 * @param {string} [params.entityLabel]
 * @param {object} [params.details]
 */
const recordAudit = async (store, { action, entity, staff, entityId = '', entityLabel = '', details = {} }) => {
  if (!store || typeof store.recordAudit !== 'function') return null;
  return store.recordAudit({
    action,
    entity,
    entityId: String(entityId || ''),
    entityLabel: String(entityLabel || '').slice(0, 200),
    ...actorFrom(staff),
    details: sanitizeDetails(details),
  });
};

/**
 * Builds a details object describing which item fields changed.
 * Compared before/after so the log says `status: In Storage → Returned`
 * rather than a vague "item edited".
 */
// Volatile timestamps are noise in a change log, and the private fields must
// never be copied into the trail — `findRaw` returns them so the diff has to
// drop them explicitly.
const IGNORED_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'resolvedAt',
  'imagePublicId',
  'identifyingDetails',
]);

const describeChanges = (before = {}, after = {}) => {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  IGNORED_FIELDS.forEach((key) => keys.delete(key));
  keys.forEach((key) => {
    const from = before?.[key];
    const to = after?.[key];
    const same = JSON.stringify(from) === JSON.stringify(to);
    if (!same) changes[key] = { from: from ?? null, to: to ?? null };
  });
  return changes;
};

module.exports = { recordAudit, describeChanges, actorFrom };
