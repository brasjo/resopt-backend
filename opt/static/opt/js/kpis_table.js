// Click a solution's column in a .kpis-table to compare every other
// solution against it: cells switch from their absolute value to a diff
// (magnitude + % of the clicked column's value), colored per-row using
// that KPI's direction (more-is-good vs less-is-good), which the server
// renders into data-more-is-good on each cell. Clicking the same column
// again reverts to absolute values. Rows with no direction (e.g. a
// timestamp KPI) or non-numeric cells are left showing their absolute
// value regardless of the active baseline.

function formatDiffMagnitude(n) {
  const rounded = Math.round(Math.abs(n) * 100) / 100;
  return rounded.toLocaleString('en-US');
}

function renderAbsolute(table) {
  table.querySelectorAll('td[data-abs-text]').forEach((td) => {
    td.textContent = td.dataset.absText;
    td.className = td.dataset.absClass;
  });
}

function renderDiff(table, baselineIndex) {
  table.querySelectorAll('tbody tr').forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll('td[data-solution-index]'));
    const baselineCell = cells.find(
      (td) => Number(td.dataset.solutionIndex) === baselineIndex
    );
    if (!baselineCell) {
      return;
    }
    const moreIsGood = baselineCell.dataset.moreIsGood;
    const baselineRaw = baselineCell.dataset.rawValue;
    const rowIsDirectional = moreIsGood !== '' && baselineRaw !== '';

    cells.forEach((td) => {
      if (Number(td.dataset.solutionIndex) === baselineIndex) {
        td.textContent = td.dataset.absText;
        td.className = 'kpi-baseline';
        return;
      }
      if (!rowIsDirectional || td.dataset.rawValue === '') {
        td.textContent = td.dataset.absText;
        td.className = td.dataset.absClass;
        return;
      }
      const value = parseFloat(td.dataset.rawValue);
      const baseline = parseFloat(baselineRaw);
      const diff = value - baseline;
      if (diff === 0) {
        td.textContent = td.dataset.absText;
        td.className = 'kpi-good';
        return;
      }
      const better = moreIsGood === 'true' ? value > baseline : value < baseline;
      const sign = diff > 0 ? '+' : '−';
      let text = `${sign}${formatDiffMagnitude(diff)}`;
      if (baseline !== 0) {
        const percentage = Math.abs((diff / baseline) * 100).toFixed(1);
        text += ` (${percentage}%)`;
      }
      td.textContent = text;
      td.className = better ? 'kpi-good' : 'kpi-bad';
    });
  });
}

document.querySelectorAll('.kpis-table').forEach((table) => {
  let baselineIndex = null;

  table.querySelectorAll('td[data-solution-index]').forEach((td) => {
    td.addEventListener('click', () => {
      const index = Number(td.dataset.solutionIndex);
      if (baselineIndex === index) {
        baselineIndex = null;
        renderAbsolute(table);
      } else {
        baselineIndex = index;
        renderDiff(table, index);
      }
    });
  });
});
