const express = require('express');
const { CATEGORIES, STATUSES, AGENCIES } = require('../models/Item');
const { upload, storeImage, destroyImage } = require('../upload');
const { validateItem, validateClaim } = require('../middleware/validateItem');
const { requireStaff } = require('../middleware/auth');
const { asyncHandler } = require('../middleware');
const { buildFilter } = require('../store/filter');
const config = require('../config');

/** Mounts the item + claim routes on a given store implementation. */
const createItemsRouter = (store) => {
  const router = express.Router();

  const requireReady = (req, res, next) => {
    if (store.isReady()) return next();
    return res.status(503).json({
      error: 'Database unavailable',
      hint: 'Check MONGO_URI and that MongoDB is running, then retry.',
    });
  };

  // ---------------------------------------------------------------- metadata
  router.get('/meta', (req, res) => {
    res.json({
      categories: CATEGORIES,
      statuses: STATUSES,
      agencies: AGENCIES,
      retentionDays: config.retentionDays,
      staffRequired: Boolean(config.staffApiKey),
    });
  });

  router.get('/stats', requireReady, asyncHandler(async (req, res) => {
    res.json(await store.stats());
  }));

  router.get('/plates', requireReady, asyncHandler(async (req, res) => {
    res.json({ plates: await store.plates(20) });
  }));

  // -------------------------------------------------------------- public list
  router.get('/', requireReady, asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const requestedLimit = Number.parseInt(req.query.limit, 10) || config.defaultPageSize;
    const limit = Math.min(Math.max(1, requestedLimit), config.maxPageSize);
    const filter = buildFilter(req.query);

    const { items, total } = await store.list({ filter, page, limit });
    res.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: page * limit < total,
      },
    });
  }));

  // Public claim status check. Declared before "/:id" so it is not captured
  // by the id parameter.
  router.get('/claims/:reference', requireReady, asyncHandler(async (req, res) => {
    const reference = String(req.params.reference || '').toUpperCase();
    const result = await store.findClaimByReference(reference);
    if (!result) return res.status(404).json({ error: 'Claim not found' });
    return res.json(result);
  }));

  // ----------------------------------------------------------- public detail
  router.get('/:id', requireReady, asyncHandler(async (req, res) => {
    if (!store.isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid item id' });
    const item = await store.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.json(item);
  }));

  // ------------------------------------------------------- file a claim (any)
  router.post('/:id/claims', requireReady, validateClaim, asyncHandler(async (req, res) => {
    const item = await store.findRaw(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status === 'Returned') {
      return res.status(409).json({ error: 'This item has already been returned to its owner' });
    }
    if (item.status === 'Disposed') {
      return res.status(409).json({ error: 'This item is no longer held by the department' });
    }

    const claim = await store.createClaim({ ...req.validatedBody, item: item._id });

    // A claim moves the item into review so staff know to look at it.
    if (item.status === 'In Storage') {
      await store.update(item._id, { status: 'Claim Pending' });
    }

    res.status(201).json({
      claim,
      message: `Claim received. Quote reference ${claim.reference} at ${item.storageOffice || 'the lost property office'}.`,
    });
  }));

  // ------------------------------------------------------- department: create
  router.post(
    '/',
    requireStaff,
    upload.single('image'),
    validateItem(),
    asyncHandler(async (req, res) => {
      if (!store.isReady()) return res.status(503).json({ error: 'Database unavailable' });

      const payload = { ...req.validatedBody };
      if (req.file) {
        const { url, publicId } = await storeImage(req.file);
        payload.imageUrl = url;
        payload.imagePublicId = publicId;
      }

      const item = await store.create(payload);
      res.status(201).json(item);
    })
  );

  // ------------------------------------------------------- department: update
  const updateHandler = asyncHandler(async (req, res) => {
    if (!store.isReady()) return res.status(503).json({ error: 'Database unavailable' });
    const { id } = req.params;
    if (!store.isValidId(id)) return res.status(400).json({ error: 'Invalid item id' });

    const changes = { ...req.validatedBody };
    if (req.file) {
      const { url, publicId } = await storeImage(req.file);
      changes.imageUrl = url;
      changes.imagePublicId = publicId;
    }

    const result = await store.update(id, changes);
    if (!result) return res.status(404).json({ error: 'Item not found' });

    if (req.file && result.previousPublicId && result.previousPublicId !== changes.imagePublicId) {
      await destroyImage(result.previousPublicId);
    }

    return res.json(result.item);
  });

  router.put(
    '/:id',
    requireStaff,
    upload.single('image'),
    validateItem(),
    updateHandler
  );
  router.patch(
    '/:id',
    requireStaff,
    upload.single('image'),
    validateItem({ partial: true }),
    updateHandler
  );

  // ------------------------------------------------------- department: delete
  router.delete('/:id', requireStaff, requireReady, asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!store.isValidId(id)) return res.status(400).json({ error: 'Invalid item id' });

    const removed = await store.remove(id);
    if (!removed) return res.status(404).json({ error: 'Item not found' });
    await destroyImage(removed.imagePublicId);
    return res.json({ message: 'Item deleted successfully', id });
  }));

  return router;
};

module.exports = { createItemsRouter };
