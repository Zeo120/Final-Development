"use strict";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2
});

const formatCurrency = (value) => {
  return Number.isFinite(value) ? currencyFormatter.format(value) : "—";
};

const formatRatio = (value) => {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
};

const parseInput = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    return 0;
  }
  const parsed = Number(element.value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
};

const updateIncomeStatement = () => {
  const revenue = parseInput("revenue");
  const cogs = parseInput("cogs");
  const operatingExpenses = parseInput("operatingExpenses");
  const otherIncome = parseInput("otherIncome");
  const taxRate = parseInput("taxRate") / 100;

  const grossProfit = revenue - cogs;
  const operatingProfit = grossProfit - operatingExpenses;
  const pretaxProfit = operatingProfit + otherIncome;
  const tax = pretaxProfit > 0 ? pretaxProfit * taxRate : 0;
  const netProfit = pretaxProfit - tax;

  setText("grossProfit", formatCurrency(grossProfit));
  setText("operatingProfit", formatCurrency(operatingProfit));
  setText("pretaxProfit", formatCurrency(pretaxProfit));
  setText("netProfit", formatCurrency(netProfit));
};

const updateBalanceOverview = () => {
  const totalAssets = parseInput("totalAssets");
  const totalLiabilities = parseInput("totalLiabilities");
  const currentAssets = parseInput("currentAssets");
  const currentLiabilities = parseInput("currentLiabilities");
  const totalEquity = parseInput("totalEquity");

  const workingCapital = currentAssets - currentLiabilities;
  const debtToEquity = totalEquity === 0 ? null : totalLiabilities / totalEquity;
  const currentRatio = currentLiabilities === 0 ? null : currentAssets / currentLiabilities;

  setText("workingCapital", formatCurrency(workingCapital));
  setText("debtToEquity", debtToEquity === null ? "—" : formatRatio(debtToEquity));
  setText("currentRatio", currentRatio === null ? "—" : formatRatio(currentRatio));
};

const updateCashFlow = () => {
  const operating = parseInput("operatingCash");
  const investing = parseInput("investingCash");
  const financing = parseInput("financingCash");
  const netCashFlow = operating + investing + financing;

  setText("netCashFlow", formatCurrency(netCashFlow));
};

const updateLedger = () => {
  const debits = parseInput("debits");
  const credits = parseInput("credits");
  const difference = debits - credits;

  setText("ledgerDiff", formatCurrency(difference));
};

const recalc = () => {
  updateIncomeStatement();
  updateBalanceOverview();
  updateCashFlow();
  updateLedger();
};

const wireInputs = () => {
  const trackedInputs = document.querySelectorAll(".calculator-shell input");
  trackedInputs.forEach((input) => {
    input.addEventListener("input", recalc);
  });

  const resetButton = document.getElementById("reset");
  resetButton?.addEventListener("click", () => {
    trackedInputs.forEach((input) => {
      input.value = "";
    });
    recalc();
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    wireInputs();
    recalc();
  });
} else {
  wireInputs();
  recalc();
}
