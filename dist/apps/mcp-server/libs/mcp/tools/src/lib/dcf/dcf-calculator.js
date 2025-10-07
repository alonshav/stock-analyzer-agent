#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var dcf_calculator_exports = {};
__export(dcf_calculator_exports, {
  DCFCalculator: () => DCFCalculator
});
module.exports = __toCommonJS(dcf_calculator_exports);
class DCFCalculator {
  /**
   * Calculate DCF valuation using LLM-provided projections and assumptions
   * This is a purely computational tool - all business logic/assumptions come from the LLM
   */
  calculateDCF(inputs) {
    const {
      projectedFreeCashFlows,
      terminalGrowthRate,
      discountRate,
      netDebt,
      sharesOutstanding
    } = inputs;
    this.validateInputs(inputs);
    const presentValueResults = this.calculatePresentValues(
      projectedFreeCashFlows,
      terminalGrowthRate,
      discountRate
    );
    const equityValue = presentValueResults.enterpriseValue - netDebt;
    const sharePrice = equityValue / sharesOutstanding;
    const sensitivityAnalysis = this.performSensitivityAnalysis(
      projectedFreeCashFlows,
      discountRate,
      terminalGrowthRate,
      netDebt,
      sharesOutstanding
    );
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
      inputs,
      // Store inputs for reference
      calculations: {
        discountFactors,
        terminalCashFlow,
        terminalMultiple
      },
      sensitivityAnalysis
    };
  }
  validateInputs(inputs) {
    const { projectedFreeCashFlows, terminalGrowthRate, discountRate, netDebt, sharesOutstanding } = inputs;
    if (!projectedFreeCashFlows || projectedFreeCashFlows.length === 0) {
      throw new Error("Projected free cash flows are required");
    }
    if (projectedFreeCashFlows.some((fcf) => typeof fcf !== "number" || isNaN(fcf))) {
      throw new Error("All projected free cash flows must be valid numbers");
    }
    if (typeof terminalGrowthRate !== "number" || isNaN(terminalGrowthRate)) {
      throw new Error("Terminal growth rate must be a valid number");
    }
    if (typeof discountRate !== "number" || isNaN(discountRate) || discountRate <= 0) {
      throw new Error("Discount rate must be a positive number");
    }
    if (terminalGrowthRate >= discountRate) {
      throw new Error("Terminal growth rate must be less than discount rate");
    }
    if (typeof sharesOutstanding !== "number" || sharesOutstanding <= 0) {
      throw new Error("Shares outstanding must be a positive number");
    }
  }
  calculatePresentValues(projectedCashFlows, terminalGrowthRate, discountRate) {
    const presentValueOfCashFlows = [];
    let sumPVOfCashFlows = 0;
    projectedCashFlows.forEach((cashFlow, index) => {
      const year = index + 1;
      const pv = cashFlow / Math.pow(1 + discountRate, year);
      presentValueOfCashFlows.push(pv);
      sumPVOfCashFlows += pv;
    });
    const finalYearCashFlow = projectedCashFlows[projectedCashFlows.length - 1];
    const terminalCashFlow = finalYearCashFlow * (1 + terminalGrowthRate);
    const terminalValue = terminalCashFlow / (discountRate - terminalGrowthRate);
    const presentValueOfTerminalValue = terminalValue / Math.pow(1 + discountRate, projectedCashFlows.length);
    const enterpriseValue = sumPVOfCashFlows + presentValueOfTerminalValue;
    return {
      presentValueOfCashFlows,
      sumPVOfCashFlows,
      terminalValue,
      presentValueOfTerminalValue,
      enterpriseValue
    };
  }
  performSensitivityAnalysis(projectedCashFlows, baseDiscountRate, baseTerminalGrowth, netDebt, sharesOutstanding) {
    const discountRateRange = [
      baseDiscountRate - 0.02,
      baseDiscountRate - 0.01,
      baseDiscountRate,
      baseDiscountRate + 0.01,
      baseDiscountRate + 0.02
    ];
    const terminalGrowthRange = [
      Math.max(5e-3, baseTerminalGrowth - 0.01),
      // Don't go below 0.5%
      baseTerminalGrowth - 5e-3,
      baseTerminalGrowth,
      baseTerminalGrowth + 5e-3,
      Math.min(0.05, baseTerminalGrowth + 0.01)
      // Don't go above 5%
    ];
    const valuationMatrix = [];
    discountRateRange.forEach((discountRate) => {
      const row = [];
      terminalGrowthRange.forEach((terminalGrowth) => {
        if (discountRate <= terminalGrowth) {
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
  formatResults(results) {
    const formatCurrency = (amount) => new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
    const formatPercent = (rate) => new Intl.NumberFormat("en-US", {
      style: "percent",
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
      return `Year ${i + 1}: FCF ${formatCurrency(fcf)}${revenue ? ` | Revenue ${formatCurrency(revenue)}` : ""}`;
    }).join("\n")}

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
  formatSensitivityMatrix(sensitivity) {
    const formatPercent = (rate) => (rate * 100).toFixed(1) + "%";
    const formatPrice = (price) => "$" + price.toFixed(0);
    let table = "\nTerminal Growth \u2192\nDiscount Rate \u2193";
    sensitivity.terminalGrowthRange.forEach((rate) => {
      table += `	${formatPercent(rate)}`;
    });
    table += "\n";
    sensitivity.discountRateRange.forEach((discountRate, i) => {
      table += `${formatPercent(discountRate)}`;
      sensitivity.valuationMatrix[i].forEach((price) => {
        table += `	${formatPrice(price)}`;
      });
      table += "\n";
    });
    return table;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DCFCalculator
});
