// Fitness graph: plots run_summary.json's mean_fitness / best_fitness (with
// std_deviation as a band around the mean) from currentRunSummary. Each array
// index is a generic ordinal checkpoint - the backend doesn't expose what a
// checkpoint corresponds to (generation, run segment, ...), so the x-axis is
// deliberately labelled generically rather than guessing.

const FITNESS_COLOR_BEST = "#2a78d6";
const FITNESS_COLOR_MEAN = "#1baf7a";
const FITNESS_BAND_FILL = "rgba(27, 175, 122, 0.10)";
const FITNESS_GRIDLINE = "#e1e0d9";
const FITNESS_AXIS = "#c3c2b7";
const FITNESS_MUTED = "#898781";
const FITNESS_INK = "#0b0b0b";
const FITNESS_INK_SECONDARY = "#52514e";

const SVG_NS = "http://www.w3.org/2000/svg";

function _fitnessData() {
  const s = currentRunSummary;
  if (!s || !Array.isArray(s.mean_fitness) || !Array.isArray(s.best_fitness) || !s.mean_fitness.length) {
    return null;
  }
  const n = s.mean_fitness.length;
  const std = Array.isArray(s.std_deviation) ? s.std_deviation : new Array(n).fill(0);
  return {
    mean: s.mean_fitness.slice(0, n),
    best: s.best_fitness.slice(0, n),
    std: std.slice(0, n),
  };
}

function refreshFitnessChartButton() {
  const btn = document.getElementById("fitness-chart-btn");
  if (!btn) return;
  const has = _fitnessData() !== null;
  btn.disabled = !has;
  btn.style.opacity = has ? "1" : "0.4";
  btn.style.pointerEvents = has ? "auto" : "none";
}

function _formatFitness(v) {
  if (v == null || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

function openFitnessChart() {
  const data = _fitnessData();
  const modal = document.getElementById("fitness-chart-modal");
  const subtitle = document.getElementById("fitness-chart-subtitle");
  const mount = document.getElementById("fitness-chart-mount");
  const empty = document.getElementById("fitness-chart-empty");
  const tableWrap = document.getElementById("fitness-chart-table-wrap");
  if (!modal || !mount) return;

  modal.style.display = "flex";
  subtitle.textContent = currentDir ? `Run: ${currentDir}` : "";

  if (!data) {
    mount.replaceChildren();
    empty.textContent = "No fitness data in this run's run_summary.json.";
    empty.style.display = "block";
    tableWrap.style.display = "none";
    return;
  }
  empty.style.display = "none";
  tableWrap.style.display = "block";
  document.getElementById("fitness-chart-table").style.display = "none";
  document.getElementById("fitness-table-toggle").textContent = "Show as table";
  _renderFitnessChart(mount, data);
}

function closeFitnessChart() {
  const modal = document.getElementById("fitness-chart-modal");
  if (modal) modal.style.display = "none";
  const mount = document.getElementById("fitness-chart-mount");
  if (mount) mount.replaceChildren();
}

function toggleFitnessTable() {
  const table = document.getElementById("fitness-chart-table");
  const toggle = document.getElementById("fitness-table-toggle");
  const showing = table.style.display !== "none";
  if (showing) {
    table.style.display = "none";
    toggle.textContent = "Show as table";
    return;
  }
  const data = _fitnessData();
  if (data) _buildFitnessTable(table, data);
  table.style.display = "block";
  toggle.textContent = "Hide table";
}

function _buildFitnessTable(container, data) {
  container.replaceChildren();
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:11px;";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["#", "Best fitness", "Mean fitness", "Std deviation"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    th.style.cssText = "text-align:left;padding:4px 8px;border-bottom:1px solid " + FITNESS_GRIDLINE + ";color:" + FITNESS_INK_SECONDARY + ";position:sticky;top:0;background:#fcfcfb;";
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  data.mean.forEach((mean, i) => {
    const tr = document.createElement("tr");
    const cells = [String(i + 1), data.best[i], mean, data.std[i]];
    cells.forEach((val, ci) => {
      const td = document.createElement("td");
      td.textContent = ci === 0 ? val : (val == null ? "—" : val.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      td.style.cssText = "padding:4px 8px;border-bottom:1px solid " + FITNESS_GRIDLINE + ";color:" + FITNESS_INK + ";font-variant-numeric:tabular-nums;";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function _renderFitnessChart(mount, data) {
  mount.replaceChildren();

  const width = 660;
  const height = 300;
  const marginTop = 16;
  const marginRight = 20;
  const marginBottom = 28;
  const marginLeft = 64;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;
  const n = data.mean.length;

  const lowVals = data.mean.map((m, i) => m - (data.std[i] || 0));
  const highVals = data.mean.map((m, i) => m + (data.std[i] || 0));
  const allVals = [...data.mean, ...data.best, ...lowVals, ...highVals].filter((v) => v != null && !Number.isNaN(v));
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const pad = (yMax - yMin) * 0.1;
  yMin -= pad;
  yMax += pad;

  const xAt = (i) => n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW;
  const yAt = (v) => plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", "100%");
  svg.style.display = "block";
  svg.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', sans-serif";

  const plot = document.createElementNS(SVG_NS, "g");
  plot.setAttribute("transform", `translate(${marginLeft}, ${marginTop})`);
  svg.appendChild(plot);

  // Y gridlines + ticks (clean-ish steps)
  const tickCount = 4;
  for (let t = 0; t <= tickCount; t++) {
    const v = yMin + ((yMax - yMin) * t) / tickCount;
    const y = yAt(v);
    const grid = document.createElementNS(SVG_NS, "line");
    grid.setAttribute("x1", "0");
    grid.setAttribute("x2", String(plotW));
    grid.setAttribute("y1", String(y));
    grid.setAttribute("y2", String(y));
    grid.setAttribute("stroke", FITNESS_GRIDLINE);
    grid.setAttribute("stroke-width", "1");
    plot.appendChild(grid);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", "-8");
    label.setAttribute("y", String(y + 3));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "10");
    label.setAttribute("fill", FITNESS_MUTED);
    label.textContent = _formatFitness(v);
    plot.appendChild(label);
  }

  // Baseline (x axis)
  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", "0");
  baseline.setAttribute("x2", String(plotW));
  baseline.setAttribute("y1", String(plotH));
  baseline.setAttribute("y2", String(plotH));
  baseline.setAttribute("stroke", FITNESS_AXIS);
  baseline.setAttribute("stroke-width", "1");
  plot.appendChild(baseline);

  // X ticks
  for (let i = 0; i < n; i++) {
    if (n > 12 && i % Math.ceil(n / 12) !== 0 && i !== n - 1) continue;
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(xAt(i)));
    label.setAttribute("y", String(plotH + 18));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "10");
    label.setAttribute("fill", FITNESS_MUTED);
    label.textContent = String(i + 1);
    plot.appendChild(label);
  }
  const xAxisTitle = document.createElementNS(SVG_NS, "text");
  xAxisTitle.setAttribute("x", String(plotW / 2));
  xAxisTitle.setAttribute("y", String(plotH + marginBottom - 2));
  xAxisTitle.setAttribute("text-anchor", "middle");
  xAxisTitle.setAttribute("font-size", "9");
  xAxisTitle.setAttribute("fill", FITNESS_MUTED);
  xAxisTitle.textContent = "Checkpoint #";
  plot.appendChild(xAxisTitle);

  // Std-deviation band around mean (area for n>1, error-bar for n==1)
  if (n > 1) {
    let d = "M";
    for (let i = 0; i < n; i++) d += `${xAt(i)},${yAt(highVals[i])} `;
    d += "L";
    for (let i = n - 1; i >= 0; i--) d += `${xAt(i)},${yAt(lowVals[i])} `;
    d += "Z";
    const band = document.createElementNS(SVG_NS, "path");
    band.setAttribute("d", d);
    band.setAttribute("fill", FITNESS_BAND_FILL);
    band.setAttribute("stroke", "none");
    plot.appendChild(band);
  } else {
    const x = xAt(0);
    const bar = document.createElementNS(SVG_NS, "line");
    bar.setAttribute("x1", String(x));
    bar.setAttribute("x2", String(x));
    bar.setAttribute("y1", String(yAt(lowVals[0])));
    bar.setAttribute("y2", String(yAt(highVals[0])));
    bar.setAttribute("stroke", FITNESS_COLOR_MEAN);
    bar.setAttribute("stroke-width", "2");
    bar.setAttribute("opacity", "0.4");
    plot.appendChild(bar);
  }

  function drawSeries(values, color, endLabel) {
    if (n > 1) {
      let d = "";
      values.forEach((v, i) => {
        d += (i === 0 ? "M" : "L") + `${xAt(i)},${yAt(v)} `;
      });
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      plot.appendChild(path);
    }
    values.forEach((v, i) => {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(xAt(i)));
      dot.setAttribute("cy", String(yAt(v)));
      dot.setAttribute("r", "4");
      dot.setAttribute("fill", color);
      dot.setAttribute("stroke", "#fcfcfb");
      dot.setAttribute("stroke-width", "2");
      plot.appendChild(dot);
    });
    // Direct label at the last point only
    const lastI = n - 1;
    const endTextX = xAt(lastI) + (n > 1 ? 6 : 10);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(Math.min(endTextX, plotW - 2)));
    label.setAttribute("y", String(yAt(values[lastI]) - 8));
    label.setAttribute("text-anchor", n > 1 ? "start" : "middle");
    label.setAttribute("font-size", "10");
    label.setAttribute("font-weight", "600");
    label.setAttribute("fill", FITNESS_INK);
    label.textContent = endLabel + ": " + _formatFitness(values[lastI]);
    plot.appendChild(label);
  }

  drawSeries(data.best, FITNESS_COLOR_BEST, "Best");
  drawSeries(data.mean, FITNESS_COLOR_MEAN, "Mean");

  // Hover layer: crosshair + tooltip
  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("y1", "0");
  crosshair.setAttribute("y2", String(plotH));
  crosshair.setAttribute("stroke", FITNESS_AXIS);
  crosshair.setAttribute("stroke-width", "1");
  crosshair.setAttribute("visibility", "hidden");
  plot.appendChild(crosshair);

  const hitArea = document.createElementNS(SVG_NS, "rect");
  hitArea.setAttribute("x", "0");
  hitArea.setAttribute("y", "0");
  hitArea.setAttribute("width", String(plotW));
  hitArea.setAttribute("height", String(plotH));
  hitArea.setAttribute("fill", "transparent");
  plot.appendChild(hitArea);

  const tooltip = document.createElement("div");
  tooltip.style.cssText = "position:fixed;pointer-events:none;background:#0b0b0b;color:#fff;font-size:11px;line-height:1.6;padding:8px 10px;border-radius:5px;display:none;z-index:250;white-space:nowrap;";
  mount.appendChild(tooltip);

  function nearestIndex(mouseX) {
    if (n === 1) return 0;
    const ratio = mouseX / plotW;
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
  }

  function showTooltip(evt, i) {
    crosshair.setAttribute("x1", String(xAt(i)));
    crosshair.setAttribute("x2", String(xAt(i)));
    crosshair.setAttribute("visibility", "visible");

    tooltip.replaceChildren();
    const title = document.createElement("div");
    title.style.cssText = "color:#c3c2b7;margin-bottom:2px;";
    title.textContent = `Checkpoint ${i + 1}`;
    tooltip.appendChild(title);

    function row(color, label, value) {
      const r = document.createElement("div");
      r.style.cssText = "display:flex;align-items:center;gap:6px;";
      const key = document.createElement("span");
      key.style.cssText = `display:inline-block;width:10px;height:2px;background:${color};`;
      const val = document.createElement("strong");
      val.textContent = _formatFitness(value);
      const lbl = document.createElement("span");
      lbl.style.color = "#c3c2b7";
      lbl.textContent = " " + label;
      r.appendChild(key);
      r.appendChild(val);
      r.appendChild(lbl);
      tooltip.appendChild(r);
    }
    row(FITNESS_COLOR_BEST, "best fitness", data.best[i]);
    row(FITNESS_COLOR_MEAN, "mean fitness", data.mean[i]);
    if (data.std[i]) row(FITNESS_COLOR_MEAN, "± std deviation", data.std[i]);

    tooltip.style.display = "block";
    tooltip.style.left = evt.clientX + 14 + "px";
    tooltip.style.top = evt.clientY - 10 + "px";
  }

  hitArea.addEventListener("pointermove", (evt) => {
    const rect = hitArea.getBoundingClientRect();
    const mouseX = ((evt.clientX - rect.left) / rect.width) * plotW;
    showTooltip(evt, nearestIndex(mouseX));
  });
  hitArea.addEventListener("pointerleave", () => {
    crosshair.setAttribute("visibility", "hidden");
    tooltip.style.display = "none";
  });

  // Legend
  const legend = document.createElement("div");
  legend.style.cssText = "display:flex;gap:16px;margin-top:8px;font-size:11px;color:" + FITNESS_INK_SECONDARY + ";flex-wrap:wrap;";
  function legendItem(color, label, dashed) {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;gap:6px;";
    const swatch = document.createElement("span");
    swatch.style.cssText = `display:inline-block;width:14px;height:2px;background:${color};`;
    const text = document.createElement("span");
    text.textContent = label;
    item.appendChild(swatch);
    item.appendChild(text);
    legend.appendChild(item);
  }
  legendItem(FITNESS_COLOR_BEST, "Best fitness");
  legendItem(FITNESS_COLOR_MEAN, "Mean fitness");
  const bandItem = document.createElement("div");
  bandItem.style.cssText = "display:flex;align-items:center;gap:6px;";
  const bandSwatch = document.createElement("span");
  bandSwatch.style.cssText = `display:inline-block;width:14px;height:10px;background:${FITNESS_BAND_FILL};border:1px solid ${FITNESS_COLOR_MEAN};`;
  const bandText = document.createElement("span");
  bandText.textContent = "± std deviation";
  bandItem.appendChild(bandSwatch);
  bandItem.appendChild(bandText);
  legend.appendChild(bandItem);

  mount.appendChild(svg);
  mount.appendChild(legend);
}
