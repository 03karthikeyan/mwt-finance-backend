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

    // Interest Calculation
    const interestRate = customInterestPercentage !== undefined 
      ? Number(customInterestPercentage) 
      : Number(product.interestPercentage || 0);

    let interestAmount = 0;
    if (product.calculationType === 'FLAT_INTEREST') {
      interestAmount = Math.round((principal * interestRate) / 100);
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
    const totalPayableAmount = principal + interestAmount;
    const deductUpfront = product.deductChargesUpfront !== false;
    const netDisbursedAmount = deductUpfront ? (principal - docChargeAmount) : principal;

    // Per-Installment Amount
    const installmentAmount = Math.round(totalPayableAmount / totalInstallments);

    // Generate Installment Schedule Dates
    const schedule = [];
    let currentDate = new Date(startDate);

    for (let i = 1; i <= totalInstallments; i++) {
      if (freq === CollectionFrequency.DAILY) {
        currentDate.setDate(currentDate.getDate() + 1);
        if (excludeSundays && currentDate.getDay() === 0) {
          // If Sunday, skip to Monday
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (freq === CollectionFrequency.WEEKLY) {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (freq === CollectionFrequency.MONTHLY) {
        currentDate.setMonth(currentDate.getMonth() + 1);
      } else {
        // Custom default 1 day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Handle last installment rounding difference
      const currentExpected = (i === totalInstallments)
        ? (totalPayableAmount - (installmentAmount * (totalInstallments - 1)))
        : installmentAmount;

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
}

module.exports = FinanceCalculatorService;
