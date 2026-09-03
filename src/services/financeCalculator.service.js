const { CollectionFrequency } = require('../constants/enums');

class FinanceCalculatorService {
  /**
   * Calculate financial figures and generate installment dates
   */
  static calculateFinance({
    principalAmount,
    product,
    frequency,
    customInstallments,
    customInterestPercentage,
    customDocChargePercentage,
    customDocChargeFixed,
    startDate = new Date(),
    excludeSundays = false,
  }) {
    const principal = Number(principalAmount);
    const freq = frequency || product.frequency || CollectionFrequency.DAILY;
    const totalInstallments = Number(customInstallments || product.defaultInstallments || 100);

    const interestRate = customInterestPercentage !== undefined 
      ? Number(customInterestPercentage) 
      : Number(product.interestPercentage || 0);

    let interestAmount = 0;
    let installmentAmount = 0;
    const calcType = product.calculationType || 'FLAT_INTEREST';

    if (calcType === 'FLAT_INTEREST' || calcType === 'DOCUMENTATION_FEE_DEDUCTION') {
      interestAmount = Math.round((principal * interestRate) / 100);
      const totalPayable = principal + interestAmount;
      installmentAmount = Math.round(totalPayable / totalInstallments);
    } else if (calcType === 'REDUCING_BALANCE') {
      // Monthly reducing EMI formula: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
      const monthlyRate = (interestRate / 12) / 100;
      if (monthlyRate > 0) {
        const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, totalInstallments)) /
                    (Math.pow(1 + monthlyRate, totalInstallments) - 1);
        installmentAmount = Math.round(emi);
        interestAmount = (installmentAmount * totalInstallments) - principal;
      } else {
        installmentAmount = Math.round(principal / totalInstallments);
        interestAmount = 0;
      }
    } else if (calcType === 'INTEREST_ONLY') {
      // Interest servicing only per period, principal due on last installment
      const periodicInterest = Math.round((principal * interestRate) / 100);
      installmentAmount = periodicInterest;
      interestAmount = periodicInterest * totalInstallments;
    } else {
      installmentAmount = Math.round(principal / totalInstallments);
      interestAmount = 0;
    }

    // Documentation / Processing Fee
    const docPercent = customDocChargePercentage !== undefined 
      ? Number(customDocChargePercentage) 
      : Number(product.docChargePercentage || 0);

    const docFixed = customDocChargeFixed !== undefined 
      ? Number(customDocChargeFixed) 
      : Number(product.docChargeFixed || 0);

    const docChargeAmount = Math.round((principal * docPercent) / 100) + docFixed;

    // Net Disbursed vs Total Payable
    const totalPayableAmount = calcType === 'INTEREST_ONLY' 
      ? (principal + interestAmount)
      : (principal + interestAmount);
    
    const deductUpfront = product.deductChargesUpfront !== false;
    const netDisbursedAmount = deductUpfront ? (principal - docChargeAmount) : principal;

    // Generate Installment Schedule Dates
    const schedule = [];
    let currentDate = new Date(startDate);

    for (let i = 1; i <= totalInstallments; i++) {
      if (freq === CollectionFrequency.DAILY) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (excludeSundays && currentDate.getDay() === 0) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (freq === CollectionFrequency.WEEKLY) {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (freq === CollectionFrequency.MONTHLY) {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        currentDate.setDate(currentDate.getDate() + 1);
      }

      let currentExpected = installmentAmount;
      if (calcType === 'INTEREST_ONLY' && i === totalInstallments) {
        // Last installment includes principal payback
        currentExpected = installmentAmount + principal;
      } else if (i === totalInstallments && calcType !== 'INTEREST_ONLY') {
        // Rounding adjustment for last installment
        const previousTotal = installmentAmount * (totalInstallments - 1);
        currentExpected = totalPayableAmount - previousTotal;
      }

      schedule.push({
        installmentNumber: i,
        dueDate: new Date(currentDate),
        expectedAmount: currentExpected,
        paidAmount: 0,
        remainingAmount: currentExpected,
        penaltyAmount: 0,
        status: 'UPCOMING',
      });
    }

    const endDate = schedule.length > 0 ? schedule[schedule.length - 1].dueDate : new Date();
    const nextDueDate = schedule.length > 0 ? schedule[0].dueDate : new Date();

    return {
      principalAmount: principal,
      interestAmount,
      docChargeAmount,
      netDisbursedAmount,
      totalPayableAmount,
      installmentAmount,
      totalInstallments,
      frequency: freq,
      startDate: new Date(startDate),
      endDate,
      nextDueDate,
      schedule,
    };
  }

  /**
   * Calculate foreclosure / early loan settlement details
   */
  static calculateForeclosure({ account, rebatePercentage = 0 }) {
    const remainingAmount = account.remainingAmount || 0;
    const rebateAmount = Math.round((remainingAmount * Number(rebatePercentage)) / 100);
    const finalSettlementAmount = Math.max(0, remainingAmount - rebateAmount);

    return {
      outstandingAmount: remainingAmount,
      rebatePercentage: Number(rebatePercentage),
      rebateAmount,
      finalSettlementAmount,
    };
  }
}

module.exports = FinanceCalculatorService;
