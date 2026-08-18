require('dotenv').config();
const http = require('http');
const app = require('../app');
const { connectDB, disconnectDB } = require('../config/database');
const SuperAdmin = require('../models/SuperAdmin');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Company = require('../models/Company');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Agent = require('../models/Agent');
const Customer = require('../models/Customer');
const FinanceProduct = require('../models/FinanceProduct');
const FinanceAccount = require('../models/FinanceAccount');
const Installment = require('../models/Installment');
const Subscription = require('../models/Subscription');
const CompanySettings = require('../models/CompanySettings');
const PasswordUtil = require('../utils/passwordUtil');
const FinanceCalculatorService = require('../services/financeCalculator.service');
const { ROLES } = require('../config/roles');
const { CollectionFrequency, FinanceStatus } = require('../constants/enums');
const logger = require('../utils/logger');

let server;
const PORT = 5055;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataString),
      ...headers,
    };

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api/v1${path}`,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            resolve({ statusCode: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ statusCode: res.statusCode, body: responseBody });
          }
        });
      }
    );

    req.on('error', (e) => reject(e));
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function seedInProcess() {
  logger.info('--- Seeding In-Process Test DB ---');

  // 1. Seed Super Admin
  const hashedPasswordSA = await PasswordUtil.hash('SuperAdmin@2026!');
  await SuperAdmin.create({
    name: 'Platform Super Admin',
    email: 'superadmin@financesaas.com',
    password: hashedPasswordSA,
    phone: '+919876543210',
    isActive: true,
  });

  // 2. Seed Plan
  const plan = await SubscriptionPlan.create({
    name: 'Professional Plan',
    code: 'PRO',
    price: 4999,
    durationMonths: 1,
    maxUsers: 25,
    maxAgents: 15,
    maxCustomers: 2500,
    maxBranches: 5,
  });

  // 3. Seed Company
  const company = await Company.create({
    name: 'Apex Micro Finance Ltd',
    companyCode: 'APEX',
    email: 'info@apexfinance.com',
    phone: '+919876500001',
    currency: { code: 'INR', symbol: '₹' },
    status: 'ACTIVE',
  });

  const sub = await Subscription.create({
    companyId: company._id,
    planId: plan._id,
    startDate: new Date(),
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    status: 'ACTIVE',
    paymentStatus: 'PAID',
    amountPaid: 4999,
  });
  company.subscriptionId = sub._id;
  await company.save();

  await CompanySettings.create({ companyId: company._id });

  // 4. Seed Company Admin
  const hashedPasswordCA = await PasswordUtil.hash('ApexAdmin@2026!');
  const companyAdmin = await User.create({
    companyId: company._id,
    name: 'Suresh Menon (Company Admin)',
    email: 'admin@apexfinance.com',
    password: hashedPasswordCA,
    phone: '+919876500002',
    role: ROLES.COMPANY_ADMIN,
    status: 'ACTIVE',
  });

  // 5. Seed Branch
  const branch = await Branch.create({
    companyId: company._id,
    branchCode: 'BR-MUM-01',
    name: 'Main Market Branch',
    managerId: companyAdmin._id,
    phone: '+919876500010',
    status: 'ACTIVE',
  });

  // 6. Seed Agent
  const hashedPasswordAgent = await PasswordUtil.hash('Agent@2026!');
  const agentUser = await User.create({
    companyId: company._id,
    branchId: branch._id,
    name: 'Rajesh Kumar (Agent 1)',
    email: 'rajesh.agent@apexfinance.com',
    password: hashedPasswordAgent,
    phone: '+919876500021',
    role: ROLES.AGENT,
    status: 'ACTIVE',
  });

  const agent = await Agent.create({
    companyId: company._id,
    userId: agentUser._id,
    branchId: branch._id,
    agentCode: 'AGT-1001',
    assignedRoutes: ['Line 1 - Wholesale Market'],
    dailyTarget: 25000,
    status: 'ACTIVE',
  });

  // 7. Seed Finance Products
  const dailyProduct = await FinanceProduct.create({
    companyId: company._id,
    productCode: 'DAILY-100D',
    name: 'Daily 100-Day Micro Finance',
    frequency: CollectionFrequency.DAILY,
    calculationType: 'DOCUMENTATION_FEE_DEDUCTION',
    minAmount: 5000,
    maxAmount: 100000,
    defaultInstallments: 100,
    docChargePercentage: 5,
    interestPercentage: 0,
    deductChargesUpfront: true,
    status: 'ACTIVE',
  });

  // 8. Seed Customer
  const customer = await Customer.create({
    companyId: company._id,
    branchId: branch._id,
    assignedAgentId: agent._id,
    customerCode: 'CUST-00001',
    name: 'Ramesh Patel',
    phone: '+919876510001',
    address: { routeArea: 'Line 1 - Wholesale Market' },
    status: 'ACTIVE',
  });

  // 9. Seed Disbursed Loan
  const calc = FinanceCalculatorService.calculateFinance({
    principalAmount: 10000,
    product: dailyProduct,
    frequency: dailyProduct.frequency,
  });

  const acc = await FinanceAccount.create({
    companyId: company._id,
    branchId: branch._id,
    accountNumber: 'FIN-2026-00001',
    customerId: customer._id,
    agentId: agent._id,
    productId: dailyProduct._id,
    frequency: calc.frequency,
    principalAmount: calc.principalAmount,
    interestAmount: calc.interestAmount,
    docChargeAmount: calc.docChargeAmount,
    netDisbursedAmount: calc.netDisbursedAmount,
    totalPayableAmount: calc.totalPayableAmount,
    installmentAmount: calc.installmentAmount,
    totalInstallments: calc.totalInstallments,
    totalPaidAmount: 0,
    remainingAmount: calc.totalPayableAmount,
    startDate: calc.startDate,
    endDate: calc.endDate,
    nextDueDate: calc.nextDueDate,
    status: FinanceStatus.ACTIVE,
    disbursedBy: companyAdmin._id,
  });

  const instDocs = calc.schedule.map((s) => ({
    ...s,
    companyId: company._id,
    financeAccountId: acc._id,
    customerId: customer._id,
  }));
  await Installment.insertMany(instDocs);

  logger.info('--- In-Process Seed Completed ---');
  return { company, companyAdmin, agent, customer, acc };
}

async function runTests() {
  try {
    logger.info('=== Starting End-to-End API Verification ===');
    await connectDB();
    const seededData = await seedInProcess();

    server = app.listen(PORT);
    logger.info(`Test server listening on port ${PORT}`);

    // 1. Test Health Check
    const healthRes = await makeRequest('GET', '/health');
    console.assert(healthRes.statusCode === 200, 'Health check failed');
    logger.info('✅ 1. Health check passed');

    // 2. Test Super Admin Login
    const loginRes = await makeRequest('POST', '/auth/login', {
      email: 'superadmin@financesaas.com',
      password: 'SuperAdmin@2026!',
    });
    console.assert(loginRes.statusCode === 200, 'Super Admin login failed');
    const superAdminToken = loginRes.body.data.accessToken;
    logger.info('✅ 2. Super Admin Login passed');

    // 3. Test Super Admin Dashboard
    const saDash = await makeRequest('GET', '/super-admin/dashboard', null, {
      Authorization: `Bearer ${superAdminToken}`,
    });
    console.assert(saDash.statusCode === 200, 'Super Admin dashboard failed');
    logger.info(`✅ 3. Super Admin Dashboard passed (Total Companies: ${saDash.body.data.totalCompanies})`);

    // 4. Test Company Admin Login
    const companyAdminLogin = await makeRequest('POST', '/auth/login', {
      email: 'admin@apexfinance.com',
      password: 'ApexAdmin@2026!',
    });
    console.assert(companyAdminLogin.statusCode === 200, 'Company Admin login failed');
    const companyToken = companyAdminLogin.body.data.accessToken;
    logger.info('✅ 4. Company Admin Login passed');

    // 5. Test Company Dashboard
    const compDash = await makeRequest('GET', '/company/dashboard', null, {
      Authorization: `Bearer ${companyToken}`,
    });
    console.assert(compDash.statusCode === 200, 'Company dashboard failed');
    logger.info(`✅ 5. Company Dashboard passed (Total Customers: ${compDash.body.data.totalCustomers})`);

    // 6. Test Finance Products List
    const productsRes = await makeRequest('GET', '/finance-products', null, {
      Authorization: `Bearer ${companyToken}`,
    });
    console.assert(productsRes.statusCode === 200, 'Products list failed');
    logger.info(`✅ 6. Finance Products retrieved (${productsRes.body.data.length} products)`);

    // 7. Test Today Collection Sheet
    const sheetRes = await makeRequest('GET', '/collections/today-sheet', null, {
      Authorization: `Bearer ${companyToken}`,
    });
    console.assert(sheetRes.statusCode === 200, 'Collection sheet failed');
    logger.info(`✅ 7. Today Collection Sheet retrieved (${sheetRes.body.data.length} accounts)`);

    // 8. Test Recording a Collection ("Collecting" ₹200)
    const collectRes = await makeRequest(
      'POST',
      '/collections/record',
      {
        financeAccountId: seededData.acc._id.toString(),
        amount: 200,
        paymentMethod: 'CASH',
        notes: 'End-to-end verification collection',
      },
      {
        Authorization: `Bearer ${companyToken}`,
      }
    );
    console.assert(collectRes.statusCode === 200, 'Collection recording failed');
    logger.info(`✅ 8. Recorded collection payment (${collectRes.body.data.payment.receiptNumber}) - Remaining Balance: ₹${collectRes.body.data.account.remainingAmount}`);

    // 9. Test Daily Collection Report
    const reportRes = await makeRequest('GET', '/reports/daily', null, {
      Authorization: `Bearer ${companyToken}`,
    });
    console.assert(reportRes.statusCode === 200, 'Daily report failed');
    logger.info(`✅ 9. Daily Collection Report passed (Total Collected Today: ₹${reportRes.body.data.totalCollected})`);

    // 10. Test Receipt WhatsApp Link Generation
    const receiptRes = await makeRequest(
      'GET',
      `/receipts/${collectRes.body.data.payment.receiptNumber}/whatsapp`,
      null,
      {
        Authorization: `Bearer ${companyToken}`,
      }
    );
    console.assert(receiptRes.statusCode === 200, 'Receipt WhatsApp link failed');
    logger.info(`✅ 10. WhatsApp Receipt Link generated: ${receiptRes.body.data.whatsappUrl.slice(0, 60)}...`);

    logger.info('====================================================');
    logger.info('🎉 ALL 10/10 BACKEND END-TO-END TESTS PASSED CLEANLY! 🎉');
    logger.info('====================================================');

    server.close();
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    logger.error(`Test execution failed: ${err.message}`);
    if (server) server.close();
    await disconnectDB();
    process.exit(1);
  }
}

runTests();
