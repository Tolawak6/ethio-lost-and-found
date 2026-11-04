const config = require('./config');
const { createApp } = require('./app');
const { createStore, connectStore, seedIfEmpty } = require('./store');

const start = async () => {
  const store = createStore();
  const connected = await connectStore(store);

  if (connected) {
    try {
      await seedIfEmpty(store);
    } catch (err) {
      console.warn('[db] seeding skipped:', err.message);
    }
  }

  const app = createApp(store);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] Ethio Lost & Found on http://0.0.0.0:${config.port} (${config.env})`);
    console.log(`[api] store: ${store.kind} · images: ${config.useCloudinary ? 'Cloudinary' : 'local disk'}`);
    if (!connected) {
      console.warn('[api] Database is NOT connected — data routes will return 503.');
      console.warn('[api] Set MONGO_URI in backend/.env (see .env.example) to use MongoDB.');
    }
  });
};

start().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exitCode = 1;
});

process.on('unhandledRejection', (reason) => {
  console.error('[api] Unhandled promise rejection:', reason);
});
