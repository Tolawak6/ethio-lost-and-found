const express = require('express');
const { asyncHandler } = require('../middleware');
const { buildFilter } = require('../store/filter');
const { hashPassword } = require('../auth/passwords');
const { validateStaffCreate } = require('../middleware/validateStaff');
const config = require('../config');
const { recordAudit } = require('../audit');

/**
 * Department-only endpoints. Every route here is behind requireStaff.
 *   GET   /api/staff/items                 list with private details + claim counts
 *   GET   /api/staff/items/:id/claims      claims filed for one item
 *   GET   /api/staff/claims                every claim (filter by status)
 *   PATCH /api/staff/claims/:id            approve / reject / mark collected
 *   GET   /api/staff/overview              dashboard counters
 *   GET   /api/staff/audit                 department audit trail (depot-scoped)
 *   GET   /api/staff/items/:id/audit       one item's history
 */
const createStaffRouter = (store, { requireStaff }) => {
  const router = express.Router();

  router.use(requireStaff);

  const requireReady = (req, res, next) => {
    if (store.isReady()) return next();
    return res.status(503).json({ error: 'Database unavailable' });
  };

  /** Managers only: create and manage department accounts. */
  const requireManager = (req, res, next) => {
    if (req.staff?.role !== 'manager') {
      return res.status(403).json({ error: 'Only a department manager can manage accounts' });
    }
    return next();
  };

  router.get('/accounts', requireManager, requireReady, asyncHandler(async (req, res) => {
    res.json({ accounts: await store.staffAccounts.list() });
  }));

  router.post(
    '/accounts',
    requireManager,
    requireReady,
    validateStaffCreate,
    asyncHandler(async (req, res) => {
      const { email, name, password, depot, role } = req.validatedBody;
      const existing = await store.staffAccounts.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }
      const account = await store.staffAccounts.create({
        email,
        name,
        depot,
        role,
        passwordHash: await hashPassword(password),
      });
      await recordAudit(store, {
        action: 'account.created',
        entity: 'account',
        entityId: account._id,
        entityLabel: account.name,
        staff: req.staff,
        details: { email: account.email, depot: account.depot, role: account.role },
      });
      return res.status(201).json({ account });
    })
  );

  router.patch('/accounts/:id', requireManager, requireReady, asyncHandler(async (req, res) => {
    if (!store.staffAccounts.isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid account id' });
    }
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
      return res.status(422).json({ error: 'active must be true or false' });
    }
    if (req.params.id === req.staff._id && active === false) {
      return res.status(422).json({ error: 'You cannot deactivate your own account' });
    }
    const account = await store.staffAccounts.setActive(req.params.id, active);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    await recordAudit(store, {
      action: active ? 'account.enabled' : 'account.disabled',
      entity: 'account',
      entityId: account._id,
      entityLabel: account.name,
      staff: req.staff,
      details: { email: account.email, depot: account.depot },
    });
    return res.json({ account });
  }));

  /**
   * Depot scoping: a staff account only sees items logged by its own depot.
   * Managers (and accounts with no depot) see the whole register.
   */
  const scopeFilter = (req, filter) => {
    const { role, depot } = req.staff || {};
    if (role === 'manager' || !depot) return filter;
    // Own depot only — legacy items without a depot stay visible to everyone.
    return { ...filter, depotScope: depot };
  };

  /** True when the given account may touch the given item. */
  const canAccess = (staff, item) => {
    const { role, depot } = staff || {};
    if (role === 'manager' || !depot) return true;
    if (!item) return false;
    // Items with no depot (logged before scoping existed) stay visible.
    return !item.depot || item.depot === depot;
  };

  router.get('/items', requireReady, asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(req.query.limit, 10) || 20), config.maxPageSize);
    const filter = scopeFilter(req, buildFilter(req.query));

    const { items, total } = await store.list({ filter, page, limit });
    // Attach private identifying details + pending claim counts for staff.
    const enriched = await Promise.all(
      items.map(async (item) => {
        const [privateItem, pendingClaims] = await Promise.all([
          store.getPrivateItem(item._id),
          store.countPendingClaims(item._id),
        ]);
        return { ...item, identifyingDetails: privateItem?.identifyingDetails || '', pendingClaims };
      })
    );

    res.json({
      items: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
    });
  }));

  router.get('/items/:id/claims', requireReady, asyncHandler(async (req, res) => {
    if (!store.isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid item id' });
    const item = await store.findRaw(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!canAccess(req.staff, item)) {
      return res.status(403).json({ error: 'This item belongs to another depot' });
    }
    res.json({ item: { _id: item._id, itemName: item.itemName, status: item.status }, claims: await store.listClaims(req.params.id) });
  }));

  router.get('/overview', requireReady, asyncHandler(async (req, res) => {
    const { role, depot } = req.staff || {};
    if (role === 'manager' || !depot) return res.json(await store.stats());

    // Depot accounts get counters for their own store (plus legacy rows).
    const scoped = depot;
    const { items } = await store.list({ filter: { depotScope: scoped }, page: 1, limit: config.maxPageSize });
    return res.json({
      total: items.length,
      inStorage: items.filter((item) => item.status === 'In Storage').length,
      pending: items.filter((item) => item.status === 'Claim Pending').length,
      returned: items.filter((item) => item.status === 'Returned').length,
      depot: scoped,
    });
  }));

  router.patch('/claims/:id', requireReady, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!store.isValidId(id)) return res.status(400).json({ error: 'Invalid claim id' });

    const allowed = ['Pending', 'Approved', 'Rejected', 'Collected'];
    const status = String(req.body?.status || '');
    if (!allowed.includes(status)) {
      return res.status(422).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const note = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : undefined;
    if (note && note.length > 500) {
      return res.status(422).json({ error: 'reviewNote must be 500 characters or fewer' });
    }

    const existing = await store.findClaimForReview(id);
    if (!existing) return res.status(404).json({ error: 'Claim not found' });

    if (existing.item) {
      const claimItem = await store.findRaw(String(existing.item));
      if (!claimItem) return res.status(404).json({ error: 'Item not found' });
      if (!canAccess(req.staff, claimItem)) {
        return res.status(403).json({ error: 'This claim belongs to another depot' });
      }
    }

    const claim = await store.updateClaim(id, {
      status,
      ...(note !== undefined ? { reviewNote: note } : {}),
    });

    // Keep the item lifecycle in step with its claim.
    if (existing.item) {
      if (status === 'Collected') {
        await store.update(String(existing.item), { status: 'Returned' });
      } else if (status === 'Rejected') {
        const remaining = await store.countPendingClaims(String(existing.item));
        if (remaining === 0) await store.update(String(existing.item), { status: 'In Storage' });
      } else if (status === 'Approved' || status === 'Pending') {
        await store.update(String(existing.item), { status: 'Claim Pending' });
      }
    }

    await recordAudit(store, {
      action: status === 'Collected' ? 'claim.collected' : 'claim.reviewed',
      entity: 'claim',
      entityId: id,
      entityLabel: claim.reference || existing.reference,
      staff: req.staff,
      details: {
        status,
        from: existing.status,
        itemId: existing.item ? String(existing.item) : '',
        ...(note ? { note } : {}),
      },
    });

    return res.json(claim);
  }));

  // ------------------------------------------------------------ audit trail
  /** Shared reader: depot accounts only ever see their own depot's entries. */
  const readAudit = async (req, res, extraFilter = {}) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(req.query.limit, 10) || 50), config.maxPageSize);
    const { role, depot } = req.staff || {};
    const filter = { ...extraFilter };
    if (req.query.action) filter.action = String(req.query.action).slice(0, 60);
    if (req.query.entity) filter.entity = String(req.query.entity).slice(0, 20);
    // A depot account never sees another depot's activity.
    if (role !== 'manager' && depot) filter.depotScope = depot;

    const { entries, total } = await store.listAudit({ filter, page, limit });
    return res.json({ entries, total, page, limit });
  };

  router.get('/audit', requireReady, asyncHandler((req, res) => readAudit(req, res)));

  router.get(
    '/items/:id/audit',
    requireReady,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!store.isValidId(id)) return res.status(400).json({ error: 'Invalid item id' });

      // The item's history includes claim decisions made against it, so check
      // the item belongs to this account before showing anything.
      const item = await store.findRaw(id);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (!canAccess(req.staff, item)) {
        return res.status(403).json({ error: 'This item belongs to another depot' });
      }
      return readAudit(req, res, { relatedItemId: id });
    })
  );

  return router;
};

module.exports = { createStaffRouter };
