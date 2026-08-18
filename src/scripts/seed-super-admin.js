require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const SuperAdmin = require('../models/SuperAdmin');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const PasswordUtil = require('../utils/passwordUtil');
const environment = require('../config/environment');
const logger = require('../utils/logger');

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    logger.info('--- Seeding Platform Super Admin & Subscription Plans ---');

    // 1. Seed Super Admin
    const existingAdmin = await SuperAdmin.findOne({ email: environment.superAdmin.email.toLowerCase() });
    if (!existingAdmin) {
      const hashedPassword = await PasswordUtil.hash(environment.superAdmin.password);
      await SuperAdmin.create({
        name: environment.superAdmin.name,
        email: environment.superAdmin.email.toLowerCase(),
        password: hashedPassword,
        phone: environment.superAdmin.phone,
        isActive: true,
      });
      logger.info(`✅ Super Admin created successfully: ${environment.superAdmin.email}`);
    } else {
      logger.info(`ℹ️ Super Admin already exists: ${environment.superAdmin.email}`);
    }

    // 2. Seed Default Subscription Plans
    const plans = [
      {
        name: 'Starter Plan',
        code: 'STARTER',
        description: 'Ideal for small lending operations and single-line daily collectors',
        price: 1999,
        durationMonths: 1,
        maxUsers: 5,
        maxAgents: 3,
        maxCustomers: 300,
        maxBranches: 1,
        features: ['Daily Collection', 'Weekly Collection', 'WhatsApp Receipts', 'Basic Reports'],
      },
      {
        name: 'Professional Plan',
        code: 'PRO',
        description: 'For growing microfinance companies with multiple collection lines and branches',
        price: 4999,
        durationMonths: 1,
        maxUsers: 25,
        maxAgents: 15,
        maxCustomers: 2500,
        maxBranches: 5,
        features: ['Daily/Weekly/Monthly Loans', 'Multi-Branch', 'Agent Tracking', 'Thermal Print', 'Advanced Analytics', 'CSV Export'],
      },
      {
        name: 'Enterprise Plan',
        code: 'ENTERPRISE',
        description: 'Unlimited capacity for large financial corporations and lending groups',
        price: 11999,
        durationMonths: 1,
        maxUsers: 100,
        maxAgents: 50,
        maxCustomers: 10000,
        maxBranches: 20,
        features: ['Unlimited Everything', 'Custom Finance Schemes', 'API Access', 'Dedicated Support', 'Audit Logs'],
      },
    ];

    for (const p of plans) {
      const existingPlan = await SubscriptionPlan.findOne({ code: p.code });
      if (!existingPlan) {
        await SubscriptionPlan.create(p);
        logger.info(`✅ Plan created: ${p.name}`);
      }
    }

    logger.info('--- Seed Completed Successfully ---');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.error(`Seed error: ${error.message}`);
    await disconnectDB();
    process.exit(1);
  }
};

seedSuperAdmin();
