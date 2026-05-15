const currencyFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return currencyFormatter.format(rounded);
};

const formatRatio = (value) => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2);
};

const parseInput = (id) => {
  const element = document.getElementById(id);
  if (!element) {
    return 0;
  }
  const parsed = Number(element.value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  document.getElementById("grossProfit").textContent = formatCurrency(grossProfit);
  document.getElementById("operatingProfit").textContent = formatCurrency(operatingProfit);
  document.getElementById("pretaxProfit").textContent = formatCurrency(pretaxProfit);
  document.getElementById("netProfit").textContent = formatCurrency(netProfit);
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

  document.getElementById("workingCapital").textContent = formatCurrency(workingCapital);
  document.getElementById("debtToEquity").textContent = debtToEquity === null ? "—" : formatRatio(debtToEquity);
  document.getElementById("currentRatio").textContent = currentRatio === null ? "—" : formatRatio(currentRatio);
};

const updateCashFlow = () => {
  const operating = parseInput("operatingCash");
  const investing = parseInput("investingCash");
  const financing = parseInput("financingCash");
  const netCashFlow = operating + investing + financing;
  document.getElementById("netCashFlow").textContent = formatCurrency(netCashFlow);
};

const updateLedger = () => {
  const debits = parseInput("debits");
  const credits = parseInput("credits");
  const difference = debits - credits;
  document.getElementById("ledgerDiff").textContent = formatCurrency(difference);
};

const recalc = () => {
  updateIncomeStatement();
  updateBalanceOverview();
  updateCashFlow();
  updateLedger();
};

const trackedInputs = document.querySelectorAll(".calculator-shell input");
trackedInputs.forEach((input) => {
  input.addEventListener("input", recalc);
});

const resetButton = document.getElementById("reset");
resetButton?.addEventListener("click", () => {
  document.querySelectorAll(".calculator-shell input").forEach((inp) => {
    inp.value = "";
  });
  recalc();
});

recalc();
