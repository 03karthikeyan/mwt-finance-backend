const mongoose = require('mongoose');
const environment = require('./environment');
const logger = require('../utils/logger');

let memoryServer = null;

const connectDB = async () => {
  try {
    let uri = environment.mongoUri;

    // Check if URI is explicitly set to memory or fallback
    if (uri === 'memory') {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri();
      logger.info(`Starting in-memory MongoDB Server at: ${uri}`);
    }

    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 15000,
      });
      logger.info(`MongoDB Connected successfully to: ${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`);
    } catch (primaryErr) {
      // In development, if local MongoDB is not running, fall back to MongoMemoryServer
      if (environment.env === 'development') {
        logger.warn(`Could not connect to ${uri}. Falling back to embedded MongoMemoryServer for local development...`);
        try {
          const { MongoMemoryServer } = require('mongodb-memory-server');
          memoryServer = await MongoMemoryServer.create();
          const fallbackUri = memoryServer.getUri();
          await mongoose.connect(fallbackUri);
          logger.info(`Embedded MongoDB Connected successfully at: ${fallbackUri}`);
        } catch (memErr) {
          logger.error(`Failed to start embedded MongoDB: ${memErr.message}`);
          throw primaryErr;
        }
      } else {
        throw primaryErr;
      }
    }

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB runtime error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });

  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    if (environment.env === 'production') {
      process.exit(1);
    }
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
    }
    logger.info('MongoDB disconnected and memory server stopped.');
  } catch (err) {
    logger.error(`Error during MongoDB disconnection: ${err.message}`);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
};
