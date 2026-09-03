const License = require('../models/License');
const Company = require('../models/Company');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const auditService = require('../services/audit.service');

// Get license status for current company
const getCompanyLicense = async (req, res, next) => {
  try {
    const companyId = req.user.companyId;
    if (!companyId) {
      throw ApiError.badRequest('Company context missing');
    }

    let license = await License.findOne({ companyId });
    if (!license) {
      // Auto-provision default 1-year lifetime license with annual maintenance
      const company = await Company.findById(companyId);
      const licenseKey = `FMP-LIFETIME-${(company?.companyCode || 'COMP')}-${Date.now().toString(36).toUpperCase()}`;
      
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);

      license = await License.create({
        companyId,
        licenseKey,
        licenseType: 'LIFETIME',
        lifetimeStatus: 'ACTIVE',
        serviceStartDate: new Date(),
        serviceExpiryDate: expiry,
        gracePeriodDays: 15,
        annualMaintenanceFee: 5000,
        status: 'ACTIVE',
      });
    }

    // Check service expiry and update status if needed
    const now = new Date();
    const expiry = new Date(license.serviceExpiryDate);
    const graceEnd = new Date(expiry);
    graceEnd.setDate(graceEnd.getDate() + license.gracePeriodDays);

    let updatedStatus = license.status;
    if (now > graceEnd) {
      updatedStatus = 'SERVICE_EXPIRED';
    } else if (now > expiry) {
      updatedStatus = 'GRACE_PERIOD';
    } else if (license.lifetimeStatus === 'ACTIVE') {
      updatedStatus = 'ACTIVE';
    }

    if (updatedStatus !== license.status) {
      license.status = updatedStatus;
      await license.save();
    }

    return ApiResponse.success(res, 'License details retrieved successfully', { license });
  } catch (error) {
    next(error);
  }
};

// Record Annual Service Maintenance Renewal (SuperAdmin / Admin)
const renewServiceMaintenance = async (req, res, next) => {
  try {
    const { companyId, amountPaid, paymentMethod, transactionRef, extendedMonths = 12, notes } = req.body;
    
    if (!companyId || !amountPaid) {
      throw ApiError.badRequest('Company ID and Amount Paid are required');
    }

    let license = await License.findOne({ companyId });
    if (!license) {
      throw ApiError.notFound('License not found for company');
    }

    const currentExpiry = new Date(license.serviceExpiryDate > new Date() ? license.serviceExpiryDate : new Date());
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + Number(extendedMonths));

    const invoiceNo = `INV-MAINT-${Date.now().toString(36).toUpperCase()}`;

    license.renewalHistory.push({
      renewalDate: new Date(),
      serviceStartDate: currentExpiry,
      serviceExpiryDate: newExpiry,
      amountPaid: Number(amountPaid),
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      transactionRef: transactionRef || '',
      invoiceNo,
      notes: notes || '',
    });

    license.serviceExpiryDate = newExpiry;
    license.lastRenewalDate = new Date();
    license.status = 'ACTIVE';
    await license.save();

    await auditService.logAction({
      req,
      action: 'LICENSE_RENEWAL',
      entity: 'License',
      entityId: license._id,
      details: { companyId, amountPaid, newExpiry, invoiceNo },
    });

    return ApiResponse.success(res, 'Annual Maintenance Service renewed successfully', { license });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCompanyLicense,
  renewServiceMaintenance,
};
