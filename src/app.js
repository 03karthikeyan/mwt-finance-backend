const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const environment = require('./config/environment');
const routes = require('./routes');
const errorHandler = require('./middlewares/error.middleware');
const { apiLimiter } = require('./middlewares/rateLimiter');
const ApiError = require('./utils/apiError');

const app = express();

// Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (
        environment.env === 'development' ||
        environment.clientUrls.includes(origin) ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev/testing
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'idempotency-key'],
  })
);

// Compression & Body Parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
if (environment.env !== 'test') {
  app.use(morgan('dev'));
}

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(environment.upload.dir)));

// Apply Rate Limiter to API routes
app.use(environment.apiPrefix, apiLimiter);

// Mount API routes
app.use(environment.apiPrefix, routes);

// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Root Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    message: 'Welcome to Finance Collection SaaS API',
    api: `${environment.apiPrefix}`,
    health: `${environment.apiPrefix}/health`,
    version: '1.0.0',
  });
});

// 404 Route Handler
app.use((req, res, next) => {
  next(ApiError.notFound(`API endpoint not found: [${req.method}] ${req.originalUrl}`));
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
