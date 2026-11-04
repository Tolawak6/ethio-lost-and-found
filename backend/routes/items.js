const express = require('express');
const { CATEGORIES, STATUSES } = require('../models/Item');
const { upload, storeImage, destroyImage } = require('../upload');
const { validateItem } = require('../middleware/validateItem');
const { asyncHandler } = require('../middleware');
const { buildFilter } = require('../store/filter');
const config = require('../config');

/** Mounts the item routes on a given store implementation. */
const createItemsRouter = (store) => {
  const router = express.Router();

  /** Every data route needs a working backend. */
  const requireReady = (req, res, next) => {
    if (store.isReady()) return next();
    return res.status(503).json({
      error: 'Database unavailable',
      hint: 'Check MONGO_URI and that MongoDB is running, then retry.',
    });
  };

  // GET /api/items/meta -> options for filters and forms
  router.get('/meta', (req, res) => {
    res.json({ categories: CATEGORIES, statuses: STATUSES, types: ['Lost', 'Found'] });
  });

  // GET /api/items/stats -> headline numbers
  router.get('/stats', requireReady, asyncHandler(async (req, res) => {
    res.json(await store.stats());
  }));

  // GET /api/items -> paginated, filterable list
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

  // GET /api/items/:id
  router.get('/:id', requireReady, asyncHandler(async (req, res) => {
    if (!store.isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }
    const item = await store.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.json(item);
  }));

  // POST /api/items
  router.post('/', upload.single('image'), validateItem(), asyncHandler(async (req, res) => {
    if (!store.isReady()) {
      // Persisting an image would orphan a file when the DB is down.
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const payload = { ...req.validatedBody };
    if (req.file) {
      const { url, publicId } = await storeImage(req.file);
      payload.imageUrl = url;
      payload.imagePublicId = publicId;
    }

    const item = await store.create(payload);
    res.status(201).json(item);
  }));

  // PATCH (partial) and PUT (full) both land here.
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

    const replacedImage =
      Boolean(req.file) &&
      result.previousPublicId &&
      result.previousPublicId !== changes.imagePublicId;
    if (replacedImage) await destroyImage(result.previousPublicId);

    return res.json(result.item);
  });

  router.put('/:id', upload.single('image'), validateItem(), updateHandler);
  router.patch('/:id', upload.single('image'), validateItem({ partial: true }), updateHandler);

  // DELETE /api/items/:id
  router.delete('/:id', requireReady, asyncHandler(async (req, res) => {
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
