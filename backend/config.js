/**
 * Central configuration.
 *
 * Environment variables (see .env.example):
 *   PORT                  - HTTP port (default 5000)
 *   MONGO_URI             - MongoDB connection string (required in production)
 *   MONGO_DB_NAME         - optional database name override
 *   CLOUDINARY_*          - Cloudinary credentials (optional; falls back to
 *                           local disk storage under backend/uploads)
 *   UPLOAD_DIR            - directory for local image uploads
 *   CORS_ORIGIN           - comma separated list of allowed browser origins
 *                           ("*" allows any, default in development)
 *   NODE_ENV              - "production" turns on stricter checks
 */
const path = require('path');

require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';
const isTest = env === 'test';

const parseOrigins = (value) => {
  if (!value || value.trim() === '*') return '*';
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const config = {
  env,
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || '',
  mongoDbName: process.env.MONGO_DB_NAME || undefined,
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(__dirname, 'uploads'),
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  maxUploadBytes: 5 * 1024 * 1024, // 5 MB
  defaultPageSize: 20,
  maxPageSize: 100,
  // Demo records make a fresh clone look alive. Disable in production by
  // setting SEED_DEMO_DATA=false.
  seedDemoData: process.env.SEED_DEMO_DATA
    ? !['false', '0', 'no'].includes(process.env.SEED_DEMO_DATA.toLowerCase())
    : !isProduction,
};

config.useCloudinary = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
);

module.exports = config;
