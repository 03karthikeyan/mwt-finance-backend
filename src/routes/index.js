const express = require('express');
const authRoutes = require('./auth.routes');
const superAdminRoutes = require('./superAdmin.routes');
const companyRoutes = require('./company.routes');
const branchRoutes = require('./branch.routes');
const agentRoutes = require('./agent.routes');
const customerRoutes = require('./customer.routes');
const financeProductRoutes = require('./financeProduct.routes');
const financeAccountRoutes = require('./financeAccount.routes');
const collectionRoutes = require('./collection.routes');
const paymentRoutes = require('./payment.routes');
const receiptRoutes = require('./receipt.routes');
const reportRoutes = require('./report.routes');
const notificationRoutes = require('./notification.routes');
const documentRoutes = require('./document.routes');

const router = express.Router();

// API Root Overview
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    service: 'Finance Collection SaaS Backend API',
    version: '1.0.0',
    documentation: 'https://github.com/MediaWaveTech/FINANCE-COLLECTION-SaaS/tree/main/docs',
    health: `${req.baseUrl}/health`,
    endpoints: {
      auth: `${req.baseUrl}/auth`,
      superAdmin: `${req.baseUrl}/super-admin`,
      company: `${req.baseUrl}/company`,
      branches: `${req.baseUrl}/branches`,
      agents: `${req.baseUrl}/agents`,
      customers: `${req.baseUrl}/customers`,
      financeProducts: `${req.baseUrl}/finance-products`,
      financeAccounts: `${req.baseUrl}/finance-accounts`,
      collections: `${req.baseUrl}/collections`,
      payments: `${req.baseUrl}/payments`,
      receipts: `${req.baseUrl}/receipts`,
      reports: `${req.baseUrl}/reports`,
      notifications: `${req.baseUrl}/notifications`,
      documents: `${req.baseUrl}/documents`,
    },
  });
});

// Health Check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Finance Collection SaaS Backend API',
    uptime: `${Math.round(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
});

// Modular Routes
router.use('/auth', authRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/company', companyRoutes);
router.use('/branches', branchRoutes);
router.use('/agents', agentRoutes);
router.use('/customers', customerRoutes);
router.use('/finance-products', financeProductRoutes);
router.use('/finance-accounts', financeAccountRoutes);
router.use('/collections', collectionRoutes);
router.use('/payments', paymentRoutes);
router.use('/receipts', receiptRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/documents', documentRoutes);

module.exports = router;
