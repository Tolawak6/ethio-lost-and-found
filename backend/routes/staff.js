const express = require('express');
const { requireStaff } = require('../middleware/auth');
const { asyncHandler } = require('../middleware');
const { buildFilter } = require('../store/filter');
const config = require('../config');

/**
 * Department-only endpoints. Every route here is behind requireStaff.
 *   GET   /api/staff/items                 list with private details + claim counts
 *   GET   /api/staff/items/:id/claims      claims filed for one item
 *   GET   /api/staff/claims                every claim (filter by status)
 *   PATCH /api/staff/claims/:id            approve / reject / mark collected
 *   GET   /api/staff/overview              dashboard counters
 */
const createStaffRouter = (store) => {
  const router = express.Router();

  router.use(requireStaff);

  const requireReady = (req, res, next) => {
    if (store.isReady()) return next();
    return res.status(503).json({ error: 'Database unavailable' });
  };

  router.get('/items', requireReady, asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(req.query.limit, 10) || 20), config.maxPageSize);
    const filter = buildFilter(req.query);

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
    res.json({ item: { _id: item._id, itemName: item.itemName, status: item.status }, claims: await store.listClaims(req.params.id) });
  }));

  router.get('/overview', requireReady, asyncHandler(async (req, res) => {
    const stats = await store.stats();
    res.json(stats);
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

    return res.json(claim);
  }));

  return router;
};

module.exports = { createStaffRouter };
