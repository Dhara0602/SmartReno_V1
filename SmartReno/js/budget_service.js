/**
 * BudgetService — calculates costs, determines status, and formats currency.
 */
const BudgetService = (() => {
  const LABOUR_RATE     = 0.20; // 20% of materials
  const CONTINGENCY_RATE = 0.10; // 10% buffer

  const BUDGET_CAPS = {
    economy:  1500,
    moderate: 3000,
    premium:  Infinity,
  };

  function formatGBP(amount) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function calculate(furniture, selectedBudget) {
    const materialsCost = furniture.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
    const labourCost    = Math.round(materialsCost * LABOUR_RATE);
    const contingency   = Math.round((materialsCost + labourCost) * CONTINGENCY_RATE);
    const totalCost     = materialsCost + labourCost + contingency;

    const cap = BUDGET_CAPS[selectedBudget] || Infinity;
    let statusKey, statusLabel;

    if (totalCost <= cap * 0.85) {
      statusKey = 'success'; statusLabel = 'On Budget';
    } else if (totalCost <= cap * 1.1) {
      statusKey = 'warning'; statusLabel = 'Moderate';
    } else {
      statusKey = 'danger'; statusLabel = 'High Capital';
    }

    return {
      materialsCost,
      labourCost,
      contingency,
      totalCost,
      statusKey,
      statusLabel,
      labourRate: LABOUR_RATE,
      contingencyRate: CONTINGENCY_RATE,
    };
  }

  function renderTable(furniture, selectedBudget, tableEl) {
    const calc = calculate(furniture, selectedBudget);

    const rows = furniture.map(item => `
      <tr>
        <td>${escHtml(item.name)}</td>
        <td>${escHtml(item.description || '—')}</td>
        <td>${formatGBP(item.estimatedCost)}</td>
      </tr>`).join('');

    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Item</th>
          <th>Description</th>
          <th style="text-align:right">Est. Cost</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="subtotal-row">
          <td colspan="2">Materials Subtotal</td>
          <td>${formatGBP(calc.materialsCost)}</td>
        </tr>
        <tr>
          <td colspan="2">Labour (${Math.round(LABOUR_RATE * 100)}% of materials)</td>
          <td>${formatGBP(calc.labourCost)}</td>
        </tr>
        <tr>
          <td colspan="2">Contingency buffer (${Math.round(CONTINGENCY_RATE * 100)}%)</td>
          <td>${formatGBP(calc.contingency)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="2">Total Project Estimate</td>
          <td>${formatGBP(calc.totalCost)}</td>
        </tr>
      </tbody>`;

    return calc;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { calculate, renderTable, formatGBP };
})();

window.BudgetService = BudgetService;
