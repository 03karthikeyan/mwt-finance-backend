require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/database');
const Company = require('../models/Company');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Agent = require('../models/Agent');
const Customer = require('../models/Customer');
const FinanceProduct = require('../models/FinanceProduct');
const FinanceAccount = require('../models/FinanceAccount');
const Installment = require('../models/Installment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const CompanySettings = require('../models/CompanySettings');
const CollectionService = require('../services/collection.service');
const FinanceCalculatorService = require('../services/financeCalculator.service');
const PasswordUtil = require('../utils/passwordUtil');
const { ROLES } = require('../config/roles');
const { CollectionFrequency, FinanceStatus } = require('../constants/enums');
const logger = require('../utils/logger');

const seedDemoTenant = async () => {
  try {
    await connectDB();
    logger.info('--- Seeding Demo Multi-Tenant Finance Company ---');

    // 1. Check or Create Company
    let company = await Company.findOne({ companyCode: 'APEX' });
    if (!company) {
      company = new Company({
        name: 'Apex Micro Finance Ltd',
        companyCode: 'APEX',
        email: 'info@apexfinance.com',
        phone: '+919876500001',
        address: {
          street: '104, Market Commercial Complex',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
        },
        currency: { code: 'INR', symbol: '₹' },
        status: 'ACTIVE',
      });
      await company.save();
      logger.info(`✅ Company created: ${company.name} (${company.companyCode})`);
    }

    // 2. Attach Subscription
    const plan = await SubscriptionPlan.findOne({ code: 'PRO' }) || await SubscriptionPlan.findOne();
    if (plan && !company.subscriptionId) {
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const sub = await Subscription.create({
        companyId: company._id,
        planId: plan._id,
        startDate: new Date(),
        expiryDate,
        status: 'ACTIVE',
        paymentStatus: 'PAID',
        amountPaid: plan.price,
      });
      company.subscriptionId = sub._id;
      await company.save();
    }

    // 3. Create Default Company Settings
    await CompanySettings.findOneAndUpdate(
      { companyId: company._id },
      { companyId: company._id },
      { upsert: true }
    );

    // 4. Create Company Admin User
    const adminEmail = 'admin@apexfinance.com';
    let companyAdmin = await User.findOne({ email: adminEmail });
    if (!companyAdmin) {
      const hashedPassword = await PasswordUtil.hash('ApexAdmin@2026!');
      companyAdmin = await User.create({
        companyId: company._id,
        name: 'Suresh Menon (Company Admin)',
        email: adminEmail,
        password: hashedPassword,
        phone: '+919876500002',
        role: ROLES.COMPANY_ADMIN,
        status: 'ACTIVE',
      });
      logger.info(`✅ Company Admin created: ${adminEmail} (Password: ApexAdmin@2026!)`);
    }

    // 5. Create Branches
    let branch1 = await Branch.findOne({ companyId: company._id, branchCode: 'BR-MUM-01' });
    if (!branch1) {
      branch1 = await Branch.create({
        companyId: company._id,
        branchCode: 'BR-MUM-01',
        name: 'Main Market Branch',
        managerId: companyAdmin._id,
        phone: '+919876500010',
        email: 'market.branch@apexfinance.com',
        address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
      });
      logger.info(`✅ Branch created: ${branch1.name}`);
    }

    // 6. Create Collection Agents
    const agentDataList = [
      {
        name: 'Rajesh Kumar (Agent 1)',
        email: 'rajesh.agent@apexfinance.com',
        phone: '+919876500021',
        agentCode: 'AGT-1001',
        routes: ['Line 1 - Wholesale Market', 'Line 2 - Station Road'],
        target: 25000,
      },
      {
        name: 'Priya Sharma (Agent 2)',
        email: 'priya.agent@apexfinance.com',
        phone: '+919876500022',
        agentCode: 'AGT-1002',
        routes: ['Line 3 - Industrial Area', 'Line 4 - East Bazaar'],
        target: 30000,
      },
    ];

    const agents = [];
    for (const a of agentDataList) {
      let user = await User.findOne({ email: a.email });
      if (!user) {
        const hashedPassword = await PasswordUtil.hash('Agent@2026!');
        user = await User.create({
          companyId: company._id,
          branchId: branch1._id,
          name: a.name,
          email: a.email,
          password: hashedPassword,
          phone: a.phone,
          role: ROLES.AGENT,
          status: 'ACTIVE',
        });
      }

      let agent = await Agent.findOne({ companyId: company._id, userId: user._id });
      if (!agent) {
        agent = await Agent.create({
          companyId: company._id,
          userId: user._id,
          branchId: branch1._id,
          agentCode: a.agentCode,
          assignedRoutes: a.routes,
          dailyTarget: a.target,
          status: 'ACTIVE',
        });
        logger.info(`✅ Agent created: ${a.name} (${a.agentCode})`);
      }
      agents.push(agent);
    }

    // 7. Create Configurable Finance Products
    const productsData = [
      {
        productCode: 'DAILY-100D',
        name: 'Daily 100-Day Micro Finance',
        description: 'Standard daily collection loan for merchants. Doc fee 5% deducted upfront.',
        frequency: CollectionFrequency.DAILY,
        calculationType: 'DOCUMENTATION_FEE_DEDUCTION',
        minAmount: 5000,
        maxAmount: 100000,
        defaultInstallments: 100,
        docChargePercentage: 5,
        interestPercentage: 0,
        deductChargesUpfront: true,
      },
      {
        productCode: 'WEEKLY-10W',
        name: 'Weekly 10-Week Commercial Loan',
        description: '10-week installment loan with 10% flat interest.',
        frequency: CollectionFrequency.WEEKLY,
        calculationType: 'FLAT_INTEREST',
        minAmount: 10000,
        maxAmount: 200000,
        defaultInstallments: 10,
        docChargePercentage: 2,
        interestPercentage: 10,
        deductChargesUpfront: false,
      },
      {
        productCode: 'MONTHLY-12M',
        name: 'Monthly 12-Month Business Loan',
        description: '12-Month EMI loan with flat interest for business expansion.',
        frequency: CollectionFrequency.MONTHLY,
        calculationType: 'FLAT_INTEREST',
        minAmount: 50000,
        maxAmount: 500000,
        defaultInstallments: 12,
        docChargePercentage: 2,
        interestPercentage: 12,
        deductChargesUpfront: false,
      },
    ];

    const products = [];
    for (const p of productsData) {
      let product = await FinanceProduct.findOne({ companyId: company._id, productCode: p.productCode });
      if (!product) {
        product = await FinanceProduct.create({ ...p, companyId: company._id });
        logger.info(`✅ Finance Product created: ${product.name}`);
      }
      products.push(product);
    }

    // 8. Register Customers
    const customerDataList = [
      {
        name: 'Ramesh Patel',
        phone: '+919876510001',
        customerCode: 'CUST-00001',
        routeArea: 'Line 1 - Wholesale Market',
        agent: agents[0],
      },
      {
        name: 'Anil Gupta',
        phone: '+919876510002',
        customerCode: 'CUST-00002',
        routeArea: 'Line 1 - Wholesale Market',
        agent: agents[0],
      },
      {
        name: 'Sunita Devi',
        phone: '+919876510003',
        customerCode: 'CUST-00003',
        routeArea: 'Line 2 - Station Road',
        agent: agents[0],
      },
      {
        name: 'Mohammed Farooq',
        phone: '+919876510004',
        customerCode: 'CUST-00004',
        routeArea: 'Line 3 - Industrial Area',
        agent: agents[1],
      },
      {
        name: 'Kavita Shinde',
        phone: '+919876510005',
        customerCode: 'CUST-00005',
        routeArea: 'Line 4 - East Bazaar',
        agent: agents[1],
      },
    ];

    const customers = [];
    for (const c of customerDataList) {
      let cust = await Customer.findOne({ companyId: company._id, phone: c.phone });
      if (!cust) {
        cust = await Customer.create({
          companyId: company._id,
          branchId: branch1._id,
          assignedAgentId: c.agent ? c.agent._id : null,
          customerCode: c.customerCode,
          name: c.name,
          phone: c.phone,
          address: {
            street: 'Shop No. 12',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            routeArea: c.routeArea,
          },
          status: 'ACTIVE',
        });
        logger.info(`✅ Customer created: ${c.name} (${c.customerCode})`);
      }
      customers.push(cust);
    }

    // 9. Disburse Real Finance Accounts
    const existingAccounts = await FinanceAccount.find({ companyId: company._id });
    if (existingAccounts.length === 0) {
      // Disburse Loan 1: Daily 100-Day (₹10,000) to Customer 1
      const calc1 = FinanceCalculatorService.calculateFinance({
        principalAmount: 10000,
        product: products[0],
        frequency: products[0].frequency,
      });

      const acc1 = await FinanceAccount.create({
        companyId: company._id,
        branchId: branch1._id,
        accountNumber: 'FIN-2026-00001',
        customerId: customers[0]._id,
        agentId: agents[0]._id,
        productId: products[0]._id,
        frequency: calc1.frequency,
        principalAmount: calc1.principalAmount,
        interestAmount: calc1.interestAmount,
        docChargeAmount: calc1.docChargeAmount,
        netDisbursedAmount: calc1.netDisbursedAmount,
        totalPayableAmount: calc1.totalPayableAmount,
        installmentAmount: calc1.installmentAmount,
        totalInstallments: calc1.totalInstallments,
        totalPaidAmount: 0,
        remainingAmount: calc1.totalPayableAmount,
        startDate: calc1.startDate,
        endDate: calc1.endDate,
        nextDueDate: calc1.nextDueDate,
        status: FinanceStatus.ACTIVE,
        disbursedBy: companyAdmin._id,
      });

      const instDocs1 = calc1.schedule.map((s) => ({
        ...s,
        companyId: company._id,
        financeAccountId: acc1._id,
        customerId: customers[0]._id,
      }));
      await Installment.insertMany(instDocs1);
      logger.info(`✅ Disbursed Daily Loan: ${acc1.accountNumber} to ${customers[0].name} (Net Payout: ₹${calc1.netDisbursedAmount})`);

      // Disburse Loan 2: Weekly 10-Week (₹20,000) to Customer 2
      const calc2 = FinanceCalculatorService.calculateFinance({
        principalAmount: 20000,
        product: products[1],
        frequency: products[1].frequency,
      });

      const acc2 = await FinanceAccount.create({
        companyId: company._id,
        branchId: branch1._id,
        accountNumber: 'FIN-2026-00002',
        customerId: customers[1]._id,
        agentId: agents[0]._id,
        productId: products[1]._id,
        frequency: calc2.frequency,
        principalAmount: calc2.principalAmount,
        interestAmount: calc2.interestAmount,
        docChargeAmount: calc2.docChargeAmount,
        netDisbursedAmount: calc2.netDisbursedAmount,
        totalPayableAmount: calc2.totalPayableAmount,
        installmentAmount: calc2.installmentAmount,
        totalInstallments: calc2.totalInstallments,
        totalPaidAmount: 0,
        remainingAmount: calc2.totalPayableAmount,
        startDate: calc2.startDate,
        endDate: calc2.endDate,
        nextDueDate: calc2.nextDueDate,
        status: FinanceStatus.ACTIVE,
        disbursedBy: companyAdmin._id,
      });

      const instDocs2 = calc2.schedule.map((s) => ({
        ...s,
        companyId: company._id,
        financeAccountId: acc2._id,
        customerId: customers[1]._id,
      }));
      await Installment.insertMany(instDocs2);
      logger.info(`✅ Disbursed Weekly Loan: ${acc2.accountNumber} to ${customers[1].name}`);

      // 10. Record Initial Sample Collections to populate ledger
      await CollectionService.recordCollection({
        companyId: company._id,
        financeAccountId: acc1._id,
        amount: 200, // 2 daily installments
        paymentMethod: 'CASH',
        agentId: agents[0]._id,
        collectedById: agents[0].userId,
        notes: 'Initial day 1 & 2 collection',
      });
      logger.info(`✅ Recorded collection on ${acc1.accountNumber} (₹200)`);
    }

    logger.info('--- Demo Multi-Tenant Company Seed Completed Successfully ---');
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    logger.error(`Seed Demo Error: ${error.message}`);
    await disconnectDB();
    process.exit(1);
  }
};

seedDemoTenant();
