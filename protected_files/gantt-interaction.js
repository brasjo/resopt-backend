function getRectangleAtPosition(canvas, x, y) {
  for (const key in rectangleMap) {
    const rect = rectangleMap[key];
    if (x >= rect.x && x <= rect.x + rect.width &&
        y >= rect.y && y <= rect.y + rect.height) {
      return rect;
    }
  }
  return null;
}

function showTooltip(x, y, activityId) {
  const rect = rectangleMap[activityId];

  if (rect?.isMaintenance) {
    const m = rect.maintenanceData;
    const start = new Date(m.start + "Z");
    const end   = new Date(m.end   + "Z");
    const startStr = start.toISOString().slice(0, 16).replace("T", " ");
    const endStr   = end.toISOString().slice(0, 16).replace("T", " ");
    const durationMin = Math.round((end - start) / 60000);
    const durationStr = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin}m`;

    const tooltip = document.getElementById("tooltip");
    tooltip.innerHTML = `
      <div style="font-weight:bold;font-size:15px;margin-bottom:4px">${m.type ?? m.custom_fields?.type ?? ""}</div>
      <div style="margin-bottom:6px;opacity:0.85">${startStr} → ${endStr} UTC (${durationStr})</div>
      <table style="border-collapse:collapse;font-size:12px">
        <tr><td style="opacity:0.65;padding-right:10px">station</td><td>${m.station}</td></tr>
        <tr><td style="opacity:0.65;padding-right:10px">aircraft</td><td>${m.aircraft_id}</td></tr>
      </table>
    `;
    tooltip.style.display = "block";
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight, gap = 12;
    tooltip.style.left = (x + gap + tw > window.innerWidth  ? x - gap - tw : x + gap) + "px";
    tooltip.style.top  = (y + gap + th > window.innerHeight ? y - gap - th : y + gap) + "px";
    return;
  }

  const activity = activities.find(a => a.id === activityId);
  if (!activity) return;

  const f = activity.raw || {};

  const startStr = activity.start.toISOString().slice(0, 16).replace("T", " ");
  const endStr = activity.end.toISOString().slice(0, 16).replace("T", " ");
  const durationMin = Math.round((activity.end - activity.start) / 60000);
  const durationStr = durationMin >= 60
    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
    : `${durationMin}m`;

  const skipInTable = new Set(["start", "end", "id"]);
  const tableRows = Object.entries(f)
    .filter(([k]) => !skipInTable.has(k))
    .map(([k, v]) => `<tr><td style="opacity:0.65;padding-right:10px;white-space:nowrap">${k}</td><td>${v}</td></tr>`)
    .join("");

  const tooltip = document.getElementById("tooltip");
  tooltip.innerHTML = `
    <div style="font-weight:bold;font-size:15px;margin-bottom:4px">${activity.label}</div>
    <div style="margin-bottom:6px;opacity:0.85">${startStr} → ${endStr} UTC (${durationStr})</div>
    <table style="border-collapse:collapse;font-size:12px">${tableRows}</table>
  `;
  tooltip.style.display = "block";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const gap = 12;
  const left = x + gap + tw > window.innerWidth  ? x - gap - tw : x + gap;
  const top  = y + gap + th > window.innerHeight ? y - gap - th : y + gap;
  tooltip.style.left = left + "px";
  tooltip.style.top  = top  + "px";
}

function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  tooltip.style.display = "none";
}

function clearHoverTimeout() {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
}

function flattenObjectToRows(obj, prefix) {
  const result = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result.push(...flattenObjectToRows(v, key));
    } else {
      result.push([key, v ?? ""]);
    }
  }
  return result;
}

function showAircraftTooltip(x, y, aircraft, aircraftId) {
  const tooltip = document.getElementById("tooltip");
  const fields = aircraft
    ? flattenObjectToRows(aircraft)
        .map(([k, v]) =>
          `<tr><td style="opacity:0.65;padding-right:10px;white-space:nowrap">${k}</td><td>${v}</td></tr>`
        ).join("")
    : "";
  tooltip.innerHTML = `
    <div style="font-weight:bold;font-size:15px;margin-bottom:4px">${aircraftId}</div>
    <table style="border-collapse:collapse;font-size:12px">${fields}</table>
  `;
  tooltip.style.display = "block";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight, gap = 12;
  tooltip.style.left = (x + gap + tw > window.innerWidth  ? x - gap - tw : x + gap) + "px";
  tooltip.style.top  = (y + gap + th > window.innerHeight ? y - gap - th : y + gap) + "px";
}

function attachLabelHover() {
  const canvas = canvasMap.labels;
  if (!canvas) return;
  canvas.style.cursor = "default";

  let hoveredRow = -1;
  let labelHoverTimeout = null;

  canvas.addEventListener("mousemove", (e) => {
    const container = document.getElementById("canvas-container");
    const ganttTop = container.getBoundingClientRect().top + 10 + HEADER_HEIGHT;
    const row = Math.floor((e.clientY - ganttTop) / rowHeight);

    if (row < 0 || row >= rows) {
      if (hoveredRow !== -1) {
        hoveredRow = -1;
        clearTimeout(labelHoverTimeout);
        labelHoverTimeout = null;
        hideTooltip();
      }
      return;
    }

    if (hoveredRow !== row) {
      hoveredRow = row;
      clearTimeout(labelHoverTimeout);
      hideTooltip();
      labelHoverTimeout = setTimeout(() => {
        const rowToAircraft = Object.fromEntries(
          Object.entries(aircraftRowIndex).map(([id, r]) => [r, id])
        );
        const aircraftId = rowToAircraft[row];
        if (!aircraftId) return;
        const aircraft = (userInput?.aircrafts ?? []).find(a => String(a.id) === String(aircraftId));
        showAircraftTooltip(e.clientX, e.clientY, aircraft, aircraftId);
      }, HOVER_DELAY_MS);
    }
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredRow = -1;
    clearTimeout(labelHoverTimeout);
    labelHoverTimeout = null;
    hideTooltip();
  });
}

function attachMouseTracking() {
  const canvas = canvasMap.viewport;
  if (!canvas) return;

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hoveredRect = getRectangleAtPosition(canvas, x, y);
    if (!hoveredRect) return;

    e.preventDefault();
    draggingActivityId = hoveredRect.activityId;
    const activity = activities.find(t => t.id === draggingActivityId);
    if (!activity) return;

    dragRowOffset = y - (activity.row * rowHeight + 5);
    canvas.style.cursor = "grabbing";
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggingActivityId) {
      const activity = activities.find(t => t.id === draggingActivityId);
      if (activity) {
        const activityCenterY = y - dragRowOffset + (rowHeight - 10) / 2;
        const targetRow = Math.min(rows - 1, Math.max(0, Math.floor(activityCenterY / rowHeight)));
        if (activity.row !== targetRow) {
          activity.row = targetRow;
          render();
        }
      }
      return;
    }

    const hoveredRect = getRectangleAtPosition(canvas, x, y);
    if (hoveredRect) {
      canvas.style.cursor = "pointer";
      if (hoveredActivityId !== hoveredRect.activityId) {
        hoveredActivityId = hoveredRect.activityId;
        clearHoverTimeout();
        hideTooltip();

        hoverTimeout = setTimeout(() => {
          showTooltip(e.clientX, e.clientY, hoveredRect.activityId);
        }, HOVER_DELAY_MS);
      }
    } else {
      canvas.style.cursor = "default";
      if (hoveredActivityId) {
        hoveredActivityId = null;
        clearHoverTimeout();
        hideTooltip();
      }
    }
  });

  const stopDragging = () => {
    if (draggingActivityId) {
      draggingActivityId = null;
      canvas.style.cursor = "default";
      render();
    }
  };

  canvas.addEventListener("mouseup", stopDragging);
  canvas.addEventListener("mouseleave", () => {
    hoveredActivityId = null;
    clearHoverTimeout();
    hideTooltip();
    stopDragging();
  });
}

function startRender() {
  // Restore all viewport values BEFORE creating the canvas so that
  // createViewportCanvas uses the correct pixelsPerMinute when it computes worldWidth.
  let restoreScrollY = 0;

  if (_savedState) {
    pixelsPerMinute = _savedState.pixelsPerMinute || pixelsPerMinute;
    rowHeight       = _savedState.rowHeight       || rowHeight;
    camera.x        = _savedState.cameraX         ?? camera.x;
    restoreScrollY  = parseInt(localStorage.getItem("ganttScrollY") || "0") || 0;
  } else {
    let vpRestored = false;
    try {
      const vp = JSON.parse(localStorage.getItem("ganttViewport"));
      if (vp?.pixelsPerMinute > 0) { pixelsPerMinute = vp.pixelsPerMinute; vpRestored = true; }
      if (vp?.rowHeight > 0) rowHeight = vp.rowHeight;
      if (vp?.cameraX != null) camera.x = vp.cameraX;
      restoreScrollY = parseInt(localStorage.getItem("ganttScrollY") || "0") || 0;
    } catch (_) {}
    if (!vpRestored) {
      const container = document.getElementById("canvas-container");
      const rawWidth = container ? (container.clientWidth || Math.max(800, window.innerWidth - 40)) : 800;
      pixelsPerMinute = (Math.max(200, rawWidth - 20) - LABEL_WIDTH - 1) / (30 * 1440);
    }
  }

  createViewportCanvas();
  attachMouseTracking();
  attachLabelHover();
  updateCanvasSize();
  render();

  if (restoreScrollY) setTimeout(() => window.scrollTo(0, restoreScrollY), 0);
}

history.scrollRestoration = "manual";
fetchDirectories();

window.addEventListener("resize", () => {
  updateCanvasSize();
  render();
});

window.addEventListener("scroll", () => {
  drawLabels();
  try { localStorage.setItem("ganttScrollY", String(window.scrollY)); } catch (_) {}
});

window.addEventListener("wheel", function (event) {
  const canvas = canvasMap.viewport;
  if (!canvas) return;

  if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
    event.preventDefault();
    const factor = Math.pow(0.998, event.deltaY);
    rowHeight = Math.min(200, Math.max(15, rowHeight * factor));
    updateCanvasSize();
  } else if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    const minPpm = canvas ? canvas.width / (180 * 1440) : 0.02;
    const factor = Math.pow(0.998, event.deltaY);
    pixelsPerMinute = Math.max(minPpm, pixelsPerMinute * factor);
    worldWidth = timeGridConfig.totalDurationMinutes * pixelsPerMinute;
    clampCamera();
  } else if (event.shiftKey) {
    event.preventDefault();
    const scrollMultiplier = event.deltaMode === 1 ? 20 : 1;
    camera.x += event.deltaY * scrollMultiplier;
    clampCamera();
  } else {
    return;
  }

  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      render();
      ticking = false;
    });
  }
}, { passive: false });

// -------------------------
// TIMING SLIDERS
// -------------------------

function updateTimingBar() {
  const animPct  = (ANIMATION_DURATION_MS / PLAYBACK_INTERVAL_MS) * 100;
  const pausePct = 100 - animPct;
  const barAnim  = document.getElementById("timing-bar-anim");
  const barPause = document.getElementById("timing-bar-pause");
  if (!barAnim || !barPause) return;
  barAnim.style.width  = animPct  + "%";
  barPause.style.width = pausePct + "%";
  barPause.style.left  = animPct  + "%";
}

function saveTimingSettings() {
  try {
    localStorage.setItem("ganttTimingSettings", JSON.stringify({
      playbackIntervalMs: PLAYBACK_INTERVAL_MS,
      animationDurationMs: ANIMATION_DURATION_MS
    }));
  } catch (err) { console.warn("Failed to save timing settings:", err); }
}

function loadTimingSettings() {
  try {
    const raw = localStorage.getItem("ganttTimingSettings");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.playbackIntervalMs) PLAYBACK_INTERVAL_MS = s.playbackIntervalMs;
    if (s.animationDurationMs) ANIMATION_DURATION_MS = s.animationDurationMs;
  } catch (err) { console.warn("Failed to load timing settings:", err); }
}

function setupTimingSliders() {
  loadTimingSettings();

  const intervalSlider = document.getElementById("interval-slider");
  const animSlider     = document.getElementById("anim-slider");
  if (!intervalSlider || !animSlider) return;

  intervalSlider.value = PLAYBACK_INTERVAL_MS;
  animSlider.value     = ANIMATION_DURATION_MS;
  document.getElementById("interval-val").textContent = (PLAYBACK_INTERVAL_MS / 1000).toFixed(1) + "s";
  document.getElementById("anim-val").textContent     = (ANIMATION_DURATION_MS / 1000).toFixed(1) + "s";

  function syncAnimMax() {
    animSlider.max = PLAYBACK_INTERVAL_MS - MIN_PAUSE_MS;
  }

  intervalSlider.addEventListener("input", () => {
    PLAYBACK_INTERVAL_MS = parseInt(intervalSlider.value);
    const maxAnim = PLAYBACK_INTERVAL_MS - MIN_PAUSE_MS;
    if (ANIMATION_DURATION_MS > maxAnim) {
      ANIMATION_DURATION_MS = maxAnim;
      animSlider.value = ANIMATION_DURATION_MS;
      document.getElementById("anim-val").textContent = (ANIMATION_DURATION_MS / 1000).toFixed(1) + "s";
    }
    syncAnimMax();
    document.getElementById("interval-val").textContent = (PLAYBACK_INTERVAL_MS / 1000).toFixed(1) + "s";
    updateTimingBar();
    saveTimingSettings();
  });

  animSlider.addEventListener("input", () => {
    ANIMATION_DURATION_MS = parseInt(animSlider.value);
    const minInterval = ANIMATION_DURATION_MS + MIN_PAUSE_MS;
    if (PLAYBACK_INTERVAL_MS < minInterval) {
      PLAYBACK_INTERVAL_MS = minInterval;
      intervalSlider.value = PLAYBACK_INTERVAL_MS;
      document.getElementById("interval-val").textContent = (PLAYBACK_INTERVAL_MS / 1000).toFixed(1) + "s";
    }
    syncAnimMax();
    document.getElementById("anim-val").textContent = (ANIMATION_DURATION_MS / 1000).toFixed(1) + "s";
    updateTimingBar();
    saveTimingSettings();
  });

  syncAnimMax();
  updateTimingBar();
}

setupTimingSliders();
initCompareLink();
