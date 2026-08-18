const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
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
} = require('../models');
const { ROLES } = require('../config/roles');
const FinanceCalculatorService = require('./financeCalculator.service');

const autoBootstrap = async () => {
  try {
    // 1. Check if Super Admin exists
    const superAdminCount = await SuperAdmin.countDocuments();
    if (superAdminCount === 0) {
      logger.info('⚙️ Initializing Platform Super Admin & Subscription Plans...');
      const hashedPassword = await bcrypt.hash(environment.superAdmin.password, environment.bcryptSaltRounds);
      await SuperAdmin.create({
        name: environment.superAdmin.name,
        email: environment.superAdmin.email.toLowerCase(),
        password: hashedPassword,
        phone: environment.superAdmin.phone,
      });

      // Create Subscription Plans
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
      logger.info('✅ Super Admin and Subscription Plans initialized.');
    }

    // 2. Only seed Demo Company if explicitly requested via SEED_DEMO_DATA=true
    if (process.env.SEED_DEMO_DATA === 'true') {
      const companyCount = await Company.countDocuments();
      if (companyCount === 0) {
        logger.info('⚙️ Seeding Demo Tenant (Apex Micro Finance Ltd)...');
        
        const proPlan = await SubscriptionPlan.findOne({ code: 'PRO' });

        // Company
        const company = await Company.create({
          name: 'Apex Micro Finance Ltd',
          companyCode: 'APEX',
          email: 'contact@apexfinance.com',
          phone: '+919876543000',
          address: { street: '104, Market Complex', city: 'Mumbai', state: 'Maharashtra', country: 'India', pincode: '400001' },
          currency: { code: 'INR', symbol: '₹' },
        });

        // Subscription
        if (proPlan) {
          const subscription = await Subscription.create({
            companyId: company._id,
            planId: proPlan._id,
            startDate: new Date(),
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            status: 'ACTIVE',
            paymentStatus: 'PAID',
            amountPaid: proPlan.price,
          });
          await Company.findByIdAndUpdate(company._id, { subscriptionId: subscription._id });
        }

        // Branch
        const branch = await Branch.create({
          companyId: company._id,
          name: 'Main Market Branch',
          branchCode: 'MAIN-01',
          phone: '+919876543001',
          email: 'branch.main@apexfinance.com',
          address: { city: 'Mumbai', state: 'Maharashtra' },
        });

        // Company Admin
        const adminHashedPassword = await bcrypt.hash('ApexAdmin@2026!', environment.bcryptSaltRounds);
        await User.create({
          companyId: company._id,
          name: 'Vikram Mehta (Company Admin)',
          email: 'admin@apexfinance.com',
          password: adminHashedPassword,
          phone: '+919876543010',
          role: ROLES.COMPANY_ADMIN,
          branchId: branch._id,
        });

        // Field Agents
        const agentHashedPassword = await bcrypt.hash('Agent@2026!', environment.bcryptSaltRounds);
        const agentUser1 = await User.create({
          companyId: company._id,
          name: 'Rajesh Kumar (Field Collector)',
          email: 'rajesh.agent@apexfinance.com',
          password: agentHashedPassword,
          phone: '+919876543021',
          role: ROLES.AGENT,
          branchId: branch._id,
        });
        const agent1 = await Agent.create({
          companyId: company._id,
          userId: agentUser1._id,
          agentCode: 'AGT-1001',
          branchId: branch._id,
          assignedRoutes: ['Line 1 - Wholesale Market', 'Line 2 - Station Bazaar'],
          dailyTarget: 25000,
        });

        const agentUser2 = await User.create({
          companyId: company._id,
          name: 'Priya Sharma (Field Officer)',
          email: 'priya.agent@apexfinance.com',
          password: agentHashedPassword,
          phone: '+919876543022',
          role: ROLES.AGENT,
          branchId: branch._id,
        });
        const agent2 = await Agent.create({
          companyId: company._id,
          userId: agentUser2._id,
          agentCode: 'AGT-1002',
          branchId: branch._id,
          assignedRoutes: ['Line 3 - Textile Line', 'Line 4 - East Gate'],
          dailyTarget: 30000,
        });

        // Products (Schemes)
        const dailyProduct = await FinanceProduct.create({
          companyId: company._id,
          name: 'Daily 100-Day Loan (5% Doc Charge)',
          productCode: 'DAILY-100D',
          frequency: 'DAILY',
          calculationType: 'DOCUMENTATION_FEE_DEDUCTION',
          defaultInstallments: 100,
          docChargePercentage: 5.0,
          interestPercentage: 0.0,
          deductChargesUpfront: true,
          excludeSundays: true,
        });

        const weeklyProduct = await FinanceProduct.create({
          companyId: company._id,
          name: 'Weekly 10-Week Commercial Loan',
          productCode: 'WEEKLY-10W',
          frequency: 'WEEKLY',
          calculationType: 'DOCUMENTATION_FEE_DEDUCTION',
          defaultInstallments: 10,
          docChargePercentage: 4.0,
          interestPercentage: 0.0,
          deductChargesUpfront: true,
        });

        // Customers
        const customer1 = await Customer.create({
          companyId: company._id,
          customerCode: 'CUST-0001',
          name: 'Ramesh Patel (Kirana Store)',
          phone: '+919811122233',
          email: 'ramesh.patel@gmail.com',
          address: { routeArea: 'Line 1 - Wholesale Market', city: 'Mumbai' },
          branchId: branch._id,
          assignedAgentId: agent1._id,
        });

        const customer2 = await Customer.create({
          companyId: company._id,
          customerCode: 'CUST-0002',
          name: 'Sunita Verma (Fruit Vendor)',
          phone: '+919822233344',
          address: { routeArea: 'Line 2 - Station Bazaar', city: 'Mumbai' },
          branchId: branch._id,
          assignedAgentId: agent1._id,
        });

        const customer3 = await Customer.create({
          companyId: company._id,
          customerCode: 'CUST-0003',
          name: 'Anil Gupta (Textile Trader)',
          phone: '+919833344455',
          address: { routeArea: 'Line 3 - Textile Line', city: 'Mumbai' },
          branchId: branch._id,
          assignedAgentId: agent2._id,
        });

        // Disburse Loans
        const p1Calc = FinanceCalculatorService.calculateFinance({
          principalAmount: 10000,
          product: dailyProduct,
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        });

        const account1 = await FinanceAccount.create({
          companyId: company._id,
          accountNumber: 'FIN-2026-00001',
          customerId: customer1._id,
          productId: dailyProduct._id,
          branchId: branch._id,
          agentId: agent1._id,
          principalAmount: p1Calc.principalAmount,
          docChargeAmount: p1Calc.docChargeAmount,
          netDisbursedAmount: p1Calc.netDisbursedAmount,
          interestAmount: p1Calc.interestAmount,
          totalPayableAmount: p1Calc.totalPayableAmount,
          totalPaidAmount: 500,
          remainingAmount: 9500,
          installmentAmount: p1Calc.installmentAmount,
          totalInstallments: p1Calc.totalInstallments,
          paidInstallments: 5,
          frequency: dailyProduct.frequency,
          status: 'ACTIVE',
          disbursementDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          endDate: p1Calc.endDate,
          nextDueDate: new Date(),
        });

        // Save Installment documents
        const instDocs1 = p1Calc.schedule.map((inst, i) => ({
          companyId: company._id,
          financeAccountId: account1._id,
          customerId: customer1._id,
          installmentNumber: inst.installmentNumber,
          expectedAmount: inst.expectedAmount,
          paidAmount: i < 5 ? 100 : 0,
          remainingAmount: i < 5 ? 0 : 100,
          dueDate: inst.dueDate,
          status: i < 5 ? 'PAID' : 'UPCOMING',
          paidAt: i < 5 ? new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000) : null,
        }));
        await Installment.insertMany(instDocs1);

        // Loan 2
        const p2Calc = FinanceCalculatorService.calculateFinance({
          principalAmount: 20000,
          product: dailyProduct,
          startDate: new Date(),
        });

        const account2 = await FinanceAccount.create({
          companyId: company._id,
          accountNumber: 'FIN-2026-00002',
          customerId: customer2._id,
          productId: dailyProduct._id,
          branchId: branch._id,
          agentId: agent1._id,
          principalAmount: 20000,
          docChargeAmount: p2Calc.docChargeAmount,
          netDisbursedAmount: p2Calc.netDisbursedAmount,
          totalPayableAmount: 20000,
          totalPaidAmount: 0,
          remainingAmount: 20000,
          installmentAmount: 200,
          totalInstallments: 100,
          paidInstallments: 0,
          frequency: dailyProduct.frequency,
          status: 'ACTIVE',
          disbursementDate: new Date(),
          startDate: new Date(),
          endDate: p2Calc.endDate,
          nextDueDate: new Date(),
        });

        const instDocs2 = p2Calc.schedule.map((inst) => ({
          companyId: company._id,
          financeAccountId: account2._id,
          customerId: customer2._id,
          installmentNumber: inst.installmentNumber,
          expectedAmount: inst.expectedAmount,
          paidAmount: 0,
          remainingAmount: inst.expectedAmount,
          dueDate: inst.dueDate,
          status: 'UPCOMING',
        }));
        await Installment.insertMany(instDocs2);

        // Update customer aggregates
        await Customer.findByIdAndUpdate(customer1._id, { totalActiveLoans: 1, totalPrincipalBorrowed: 10000, totalPaidAmount: 500, totalOutstandingAmount: 9500 });
        await Customer.findByIdAndUpdate(customer2._id, { totalActiveLoans: 1, totalPrincipalBorrowed: 20000, totalPaidAmount: 0, totalOutstandingAmount: 20000 });
        await Customer.findByIdAndUpdate(customer3._id, { totalActiveLoans: 0, totalPrincipalBorrowed: 0, totalPaidAmount: 0, totalOutstandingAmount: 0 });

        logger.info('✅ Demo Tenant (APEX) seeded.');
      }
    }
  } catch (error) {
    logger.error(`Error during autoBootstrap: ${error.message}`);
  }
};

module.exports = { autoBootstrap };
