const config = require('../config');

/** Wraps async route handlers so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** 404 for unmatched API routes. */
const notFound = (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
};

/** Central error handler: turns multer / mongoose / http errors into JSON. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Image is too large (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB)`
        : err.message;
    return res.status(413).json({ error: message });
  }

  if (err && err.status === 415) {
    return res.status(415).json({ error: err.message });
  }

  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }

  if (err && err.name === 'ValidationError') {
    const fields = {};
    Object.entries(err.errors || {}).forEach(([key, value]) => {
      fields[key] = value.message;
    });
    return res.status(422).json({ error: 'Validation failed', fields });
  }

  const status = err?.statusCode || err?.status || 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
  });
};

module.exports = { asyncHandler, notFound, errorHandler };
