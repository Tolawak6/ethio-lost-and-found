const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { createItemsRouter } = require('./routes/items');
const { createStaffRouter } = require('./routes/staff');
const { createAuthRouter } = require('./routes/auth');
const { createRequireStaff } = require('./middleware/auth');
const { asyncHandler, notFound, errorHandler } = require('./middleware');

/**
 * @param {object} store      data store (see backend/store)
 * @param {object} [options]
 * @param {boolean} [options.serveFrontend] override frontend auto-detection
 */
const createApp = (store, { serveFrontend } = {}) => {
  const app = express();
  // Expose the rate limiters so a test harness can reset the windows between
  // cases; production behaviour is untouched.
  const limiters = {};

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(cors({ origin: config.corsOrigin, credentials: true }));

  // Minimal cookie parser: the only cookie is the staff session.
  app.use((req, res, next) => {
    req.cookies = {};
    const header = req.get('cookie');
    if (header) {
      header.split(';').forEach((pair) => {
        const index = pair.indexOf('=');
        if (index === -1) return;
        const key = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (key) req.cookies[key] = decodeURIComponent(value);
      });
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Minimal security headers (no extra dependency needed).
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // The department area is deliberately unlisted; keep it out of indexes.
    if (req.path === '/admin' || req.path.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
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

  limiters.write = writeLimiter;

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
        'POST /api/items/:id/claims',
        'GET /api/items/claims/:reference',
        'GET /api/staff/items  (department)',
        'PATCH /api/staff/claims/:id  (department)',
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

  const staffAccounts = store.staffAccounts;
  const secret = config.sessionSecret;
  const requireStaff = createRequireStaff({ staffAccounts, secret });

  const itemsRouter = createItemsRouter(store, { requireStaff });
  const authRouter = createAuthRouter({ staffAccounts, requireStaff, secret, store });
  Object.assign(limiters, authRouter.limiters);
  app.use('/api/auth', authRouter);
  app.use('/api/items', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return writeLimiter(req, res, next);
    }
    return next();
  });
  app.use('/api/items', itemsRouter);
  app.use('/api/staff', createStaffRouter(store, { requireStaff }));

  // Locally stored images (used when Cloudinary is not configured).
  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));

  app.use('/api', notFound);
  app.limiters = limiters;
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
