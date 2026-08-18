require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const environment = require('../config/environment');
const {
  SuperAdmin,
  SubscriptionPlan,
  Company,
  Subscription,
  User,
  Branch,
  Agent,
  Customer,
  FinanceProduct,
  FinanceAccount,
  Installment,
  Payment,
  AuditLog,
} = require('../models');

const cleanDatabase = async () => {
  try {
    console.log('🔄 Connecting to MongoDB database...');
    const mongoUri = environment.mongoUri;
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB!');

    console.log('\n🧹 Wiping all dummy data (Customers, Accounts, Installments, Payments, Agents, Branches, Users, Companies)...');
    await Promise.all([
      Customer.deleteMany({}),
      FinanceAccount.deleteMany({}),
      Installment.deleteMany({}),
      Payment.deleteMany({}),
      Agent.deleteMany({}),
      Branch.deleteMany({}),
      User.deleteMany({}),
      Company.deleteMany({}),
      Subscription.deleteMany({}),
      AuditLog.deleteMany({}),
      SuperAdmin.deleteMany({}),
      SubscriptionPlan.deleteMany({}),
    ]);
    console.log('✅ Database completely cleaned!');

    console.log('\n⚙️ Initializing Platform Super Admin...');
    const hashedPassword = await bcrypt.hash(environment.superAdmin.password, environment.bcryptSaltRounds);
    const superAdmin = await SuperAdmin.create({
      name: environment.superAdmin.name,
      email: environment.superAdmin.email.toLowerCase(),
      password: hashedPassword,
      phone: environment.superAdmin.phone,
    });
    console.log(`✅ Super Admin created: ${superAdmin.email} (Password: ${environment.superAdmin.password})`);

    console.log('\n⚙️ Initializing Subscription Plans...');
    const plans = [
      {
        name: 'Starter Micro Plan',
        code: 'STARTER',
        description: 'Designed for independent line collectors and small finance operators.',
        price: 999,
        durationMonths: 1,
        maxBranches: 1,
        maxAgents: 3,
        maxCustomers: 300,
        maxUsers: 5,
        features: ['Daily Collection Pad', 'WhatsApp Receipts', 'CSV Export'],
      },
      {
        name: 'Professional Enterprise',
        code: 'PRO',
        description: 'Full-featured package for established finance businesses with multiple routes.',
        price: 2499,
        durationMonths: 1,
        maxBranches: 5,
        maxAgents: 15,
        maxCustomers: 2500,
        maxUsers: 25,
        features: ['Daily & Weekly Collection', 'Custom Branding', 'WhatsApp Receipts', 'CSV Export', 'API Access'],
      },
      {
        name: 'Unlimited NBFC Suite',
        code: 'ENTERPRISE',
        description: 'Unlimited scale, multi-branch hierarchy, custom workflows and integrations.',
        price: 4999,
        durationMonths: 1,
        maxBranches: 999,
        maxAgents: 999,
        maxCustomers: 999999,
        maxUsers: 9999,
        features: ['Unlimited Branches', 'Unlimited Agents', 'Full Audit Logs', 'Custom Workflows', 'Dedicated Support'],
      },
    ];
    await SubscriptionPlan.insertMany(plans);
    console.log('✅ Subscription Plans initialized.');

    console.log('\n=======================================================');
    console.log('🎉 YOUR DATABASE IS NOW 100% CLEAN & PRODUCTION READY!');
    console.log('=======================================================');
    console.log('🔑 Platform Super Admin Credentials:');
    console.log(`   Email:    ${superAdmin.email}`);
    console.log(`   Password: ${environment.superAdmin.password}`);
    console.log('\n📋 HOW TO ADD YOUR REAL COMPANY DATA:');
    console.log('   Step 1: Sign in with Super Admin to onboard your real company & create your company admin.');
    console.log('   Step 2: Sign in with your Company Admin account.');
    console.log('   Step 3: Create your Loan Schemes (e.g. Daily 100-Day / Weekly 10-Week) in "Finance Schemes".');
    console.log('   Step 4: Add your Field Collection Officers in "Agents & Routes".');
    console.log('   Step 5: Register your Borrowers in "Borrowers" tab.');
    console.log('   Step 6: Disburse loans in "Loans" tab and start collecting with "Quick Collect"!');
    console.log('=======================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database clean error:', error);
    process.exit(1);
  }
};

cleanDatabase();
