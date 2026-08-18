const app = require('./app');
const environment = require('./config/environment');
const { connectDB, disconnectDB } = require('./config/database');
const logger = require('./utils/logger');

let server;

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Auto-bootstrap Initial Super Admin & Demo Tenant if needed
    const { autoBootstrap } = require('./services/bootstrap.service');
    await autoBootstrap();

    // 3. Start HTTP Server on 0.0.0.0 (all network interfaces)
    const os = require('os');
    const getLocalIpAddresses = () => {
      const interfaces = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            addresses.push(net.address);
          }
        }
      }
      return addresses;
    };

    server = app.listen(environment.port, '0.0.0.0', () => {
      const lanIps = getLocalIpAddresses();
      logger.info(`=======================================================`);
      logger.info(`🚀 Finance Management SaaS Backend is running!`);
      logger.info(`📡 Port: ${environment.port} | Mode: ${environment.env}`);
      logger.info(`🔗 Local Base URL: http://localhost:${environment.port}${environment.apiPrefix}`);
      lanIps.forEach(ip => {
        logger.info(`📱 Real Device / LAN URL: http://${ip}:${environment.port}${environment.apiPrefix}`);
      });
      logger.info(`=======================================================`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed.');
          await disconnectDB();
          process.exit(0);
        });
      } else {
        await disconnectDB();
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
