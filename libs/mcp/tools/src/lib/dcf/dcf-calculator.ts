export interface DCFInputs {
  // Required projections (LLM must provide these)
  projectedFreeCashFlows: number[];  // Array of projected FCF for each year
  terminalGrowthRate: number;        // Terminal growth rate (e.g., 0.025 for 2.5%)
  discountRate: number;              // WACC/discount rate (e.g., 0.10 for 10%)

  // Balance sheet data for equity value calculation
  netDebt: number;                   // Total debt minus cash
  sharesOutstanding: number;         // Diluted shares outstanding

  // Optional: Additional data for context/validation
  currentRevenue?: number;
  projectedRevenues?: number[];
  assumptions?: {
    projectionYears: number;
    baseYear: string;
    [key: string]: any;  // LLM can add any assumptions for reference
  };
}

export interface DCFResults {
  // Valuation calculations
  presentValueOfCashFlows: number[];     // PV of each projected year's FCF
  sumPVOfCashFlows: number;             // Sum of all projected years PV
  terminalValue: number;                // Terminal value in final year
  presentValueOfTerminalValue: number;  // PV of terminal value
  enterpriseValue: number;              // Total enterprise value
  equityValue: number;                  // Equity value (EV - net debt)
  sharePrice: number;                   // Price per share

  // Inputs used (for reference)
  inputs: DCFInputs;

  // Calculations breakdown
  calculations: {
    discountFactors: number[];          // Discount factor for each year
    terminalCashFlow: number;           // Final year FCF * (1 + terminal growth)
    terminalMultiple: number;           // 1 / (discount rate - terminal growth)
  };

  // Sensitivity analysis
  sensitivityAnalysis: {
    discountRateRange: number[];
    terminalGrowthRange: number[];
    valuationMatrix: number[][];
  };
}

export class DCFCalculator {

  /**
   * Calculate DCF valuation using LLM-provided projections and assumptions
   * This is a purely computational tool - all business logic/assumptions come from the LLM
   */
  calculateDCF(inputs: DCFInputs): DCFResults {
    const {
      projectedFreeCashFlows,
      terminalGrowthRate,
      discountRate,
      netDebt,
      sharesOutstanding
    } = inputs;

    // Validate required inputs
    this.validateInputs(inputs);

    // Calculate present values of projected cash flows
    const presentValueResults = this.calculatePresentValues(
      projectedFreeCashFlows,
      terminalGrowthRate,
      discountRate
    );

    // Calculate equity value and share price
    const equityValue = presentValueResults.enterpriseValue - netDebt;
    const sharePrice = equityValue / sharesOutstanding;

    // Generate sensitivity analysis
    const sensitivityAnalysis = this.performSensitivityAnalysis(
      projectedFreeCashFlows,
      discountRate,
      terminalGrowthRate,
      netDebt,
      sharesOutstanding
    );

    // Create calculations breakdown for transparency
    const discountFactors = projectedFreeCashFlows.map((_, index) => {
      const year = index + 1;
      return 1 / Math.pow(1 + discountRate, year);
    });

    const finalYearCashFlow = projectedFreeCashFlows[projectedFreeCashFlows.length - 1];
    const terminalCashFlow = finalYearCashFlow * (1 + terminalGrowthRate);
    const terminalMultiple = 1 / (discountRate - terminalGrowthRate);

    return {
      presentValueOfCashFlows: presentValueResults.presentValueOfCashFlows,
      sumPVOfCashFlows: presentValueResults.sumPVOfCashFlows,
      terminalValue: presentValueResults.terminalValue,
      presentValueOfTerminalValue: presentValueResults.presentValueOfTerminalValue,
      enterpriseValue: presentValueResults.enterpriseValue,
      equityValue,
      sharePrice,

      inputs, // Store inputs for reference

      calculations: {
        discountFactors,
        terminalCashFlow,
        terminalMultiple
      },

      sensitivityAnalysis
    };
  }

  private validateInputs(inputs: DCFInputs): void {
    const { projectedFreeCashFlows, terminalGrowthRate, discountRate, netDebt, sharesOutstanding } = inputs;

    if (!projectedFreeCashFlows || projectedFreeCashFlows.length === 0) {
      throw new Error('Projected free cash flows are required');
    }

    if (projectedFreeCashFlows.some(fcf => typeof fcf !== 'number' || isNaN(fcf))) {
      throw new Error('All projected free cash flows must be valid numbers');
    }

    if (typeof terminalGrowthRate !== 'number' || isNaN(terminalGrowthRate)) {
      throw new Error('Terminal growth rate must be a valid number');
    }

    if (typeof discountRate !== 'number' || isNaN(discountRate) || discountRate <= 0) {
      throw new Error('Discount rate must be a positive number');
    }

    if (terminalGrowthRate >= discountRate) {
      throw new Error('Terminal growth rate must be less than discount rate');
    }

    if (typeof sharesOutstanding !== 'number' || sharesOutstanding <= 0) {
      throw new Error('Shares outstanding must be a positive number');
    }
  }

  private calculatePresentValues(
    projectedCashFlows: number[],
    terminalGrowthRate: number,
    discountRate: number
  ) {
    const presentValueOfCashFlows: number[] = [];
    let sumPVOfCashFlows = 0;

    // Calculate PV of projected cash flows
    projectedCashFlows.forEach((cashFlow, index) => {
      const year = index + 1;
      const pv = cashFlow / Math.pow(1 + discountRate, year);
      presentValueOfCashFlows.push(pv);
      sumPVOfCashFlows += pv;
    });

    // Calculate terminal value
    const finalYearCashFlow = projectedCashFlows[projectedCashFlows.length - 1];
    const terminalCashFlow = finalYearCashFlow * (1 + terminalGrowthRate);
    const terminalValue = terminalCashFlow / (discountRate - terminalGrowthRate);

    // Present value of terminal value
    const presentValueOfTerminalValue = terminalValue / Math.pow(1 + discountRate, projectedCashFlows.length);

    // Enterprise value
    const enterpriseValue = sumPVOfCashFlows + presentValueOfTerminalValue;

    return {
      presentValueOfCashFlows,
      sumPVOfCashFlows,
      terminalValue,
      presentValueOfTerminalValue,
      enterpriseValue
    };
  }

  private performSensitivityAnalysis(
    projectedCashFlows: number[],
    baseDiscountRate: number,
    baseTerminalGrowth: number,
    netDebt: number,
    sharesOutstanding: number
  ) {
    // Discount rate range: ±2% from base
    const discountRateRange = [
      baseDiscountRate - 0.02,
      baseDiscountRate - 0.01,
      baseDiscountRate,
      baseDiscountRate + 0.01,
      baseDiscountRate + 0.02
    ];

    // Terminal growth rate range: ±1% from base
    const terminalGrowthRange = [
      Math.max(0.005, baseTerminalGrowth - 0.01), // Don't go below 0.5%
      baseTerminalGrowth - 0.005,
      baseTerminalGrowth,
      baseTerminalGrowth + 0.005,
      Math.min(0.05, baseTerminalGrowth + 0.01) // Don't go above 5%
    ];

    // Create valuation matrix
    const valuationMatrix: number[][] = [];

    discountRateRange.forEach(discountRate => {
      const row: number[] = [];
      terminalGrowthRange.forEach(terminalGrowth => {
        if (discountRate <= terminalGrowth) {
          // Invalid scenario - discount rate must be higher than terminal growth
          row.push(0);
        } else {
          const presentValues = this.calculatePresentValues(
            projectedCashFlows,
            terminalGrowth,
            discountRate
          );
          const equityValue = presentValues.enterpriseValue - netDebt;
          const sharePrice = equityValue / sharesOutstanding;
          row.push(sharePrice);
        }
      });
      valuationMatrix.push(row);
    });

    return {
      discountRateRange,
      terminalGrowthRange,
      valuationMatrix
    };
  }

  /**
   * Format DCF results for display
   */
  formatResults(results: DCFResults): string {
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);

    const formatPercent = (rate: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(rate);

    const projectionYears = results.inputs.projectedFreeCashFlows.length;

    return `
## DCF Valuation Results

### Key Valuation Metrics
- **Enterprise Value**: ${formatCurrency(results.enterpriseValue)}
- **Equity Value**: ${formatCurrency(results.equityValue)}
- **Fair Value Per Share**: ${formatCurrency(results.sharePrice)}

### Financial Projections (${projectionYears} Years)
${results.inputs.projectedFreeCashFlows.map((fcf, i) => {
  const revenue = results.inputs.projectedRevenues?.[i];
  return `Year ${i + 1}: FCF ${formatCurrency(fcf)}${revenue ? ` | Revenue ${formatCurrency(revenue)}` : ''}`;
}).join('\n')}

### Key Assumptions
- **Discount Rate (WACC)**: ${formatPercent(results.inputs.discountRate)}
- **Terminal Growth Rate**: ${formatPercent(results.inputs.terminalGrowthRate)}
- **Net Debt**: ${formatCurrency(results.inputs.netDebt)}
- **Shares Outstanding**: ${results.inputs.sharesOutstanding.toLocaleString()}

### Valuation Components
- **PV of Projected FCF**: ${formatCurrency(results.sumPVOfCashFlows)}
- **PV of Terminal Value**: ${formatCurrency(results.presentValueOfTerminalValue)}
- **Terminal Value**: ${formatCurrency(results.terminalValue)}

### Calculation Details
- **Terminal Cash Flow**: ${formatCurrency(results.calculations.terminalCashFlow)}
- **Terminal Multiple**: ${results.calculations.terminalMultiple.toFixed(2)}x

### Sensitivity Analysis
**Share Price Sensitivity to Discount Rate & Terminal Growth Rate**

${this.formatSensitivityMatrix(results.sensitivityAnalysis)}
`;
  }

  private formatSensitivityMatrix(sensitivity: any): string {
    const formatPercent = (rate: number) => (rate * 100).toFixed(1) + '%';
    const formatPrice = (price: number) => '$' + price.toFixed(0);

    let table = '\nTerminal Growth →\nDiscount Rate ↓';

    // Header row
    sensitivity.terminalGrowthRange.forEach((rate: number) => {
      table += `\t${formatPercent(rate)}`;
    });
    table += '\n';

    // Data rows
    sensitivity.discountRateRange.forEach((discountRate: number, i: number) => {
      table += `${formatPercent(discountRate)}`;
      sensitivity.valuationMatrix[i].forEach((price: number) => {
        table += `\t${formatPrice(price)}`;
      });
      table += '\n';
    });

    return table;
  }
}
