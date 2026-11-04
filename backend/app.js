const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { createItemsRouter } = require('./routes/items');
const { asyncHandler, notFound, errorHandler } = require('./middleware');

/**
 * @param {object} store      data store (see backend/store)
 * @param {object} [options]
 * @param {boolean} [options.serveFrontend] override frontend auto-detection
 */
const createApp = (store, { serveFrontend } = {}) => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Minimal security headers (no extra dependency needed).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  if (!config.isTest) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
      });
      next();
    });
  }

  // Throttle writes only: browsing the board should stay unrestricted.
  const writeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many submissions — please try again in a few minutes.' },
  });

  // When a production build exists, serve the React app from the same origin.
  // This runs before the root JSON route so "/" opens the web app.
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  const hasFrontend =
    serveFrontend ?? fs.existsSync(path.join(frontendDist, 'index.html'));
  if (hasFrontend) {
    app.use(express.static(frontendDist, { maxAge: '1h' }));
    app.get(/^\/(?!api|uploads).*/, (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  const describeApi = (req, res) => {
    res.json({
      name: 'Ethio Lost & Found API',
      version: '2.0.0',
      store: store.kind,
      images: config.useCloudinary ? 'cloudinary' : 'local',
      endpoints: [
        'GET /api/items',
        'GET /api/items/:id',
        'GET /api/items/meta',
        'GET /api/items/stats',
        'POST /api/items',
        'PUT|PATCH /api/items/:id',
        'DELETE /api/items/:id',
        'GET /api/health',
      ],
    });
  };

  app.get('/api', describeApi);
  // Without a frontend build, "/" also answers with the API description.
  if (!hasFrontend) app.get('/', describeApi);

  app.get('/api/health', asyncHandler(async (req, res) => {
    const ready = store.isReady();
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ok' : 'degraded',
      database: ready ? 'connected' : 'disconnected',
      store: store.kind,
      uptime: Math.round(process.uptime()),
    });
  }));

  const itemsRouter = createItemsRouter(store);
  app.use('/api/items', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return writeLimiter(req, res, next);
    }
    return next();
  });
  app.use('/api/items', itemsRouter);

  // Locally stored images (used when Cloudinary is not configured).
  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));

  app.use('/api', notFound);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
