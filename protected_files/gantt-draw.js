function calculateTimeBounds() {
  const activityStartTimes = activities.map(t => t.start.getTime());
  const activityEndTimes = activities.map(t => t.end.getTime());

  const minActivityTime = Math.min(...activityStartTimes);
  const maxActivityTime = Math.max(...activityEndTimes);

  const startOfDayMin = new Date(minActivityTime);
  startOfDayMin.setUTCHours(0, 0, 0, 0);
  const paddedMinTime = startOfDayMin.getTime();

  const endOfDayMax = new Date(maxActivityTime);
  endOfDayMax.setUTCHours(23, 59, 59, 999);
  const paddedMaxTime = endOfDayMax.getTime();

  return { minTime: paddedMinTime, maxTime: paddedMaxTime };
}

function viewportCanvasHeight() {
  const container = document.getElementById("canvas-container");
  const topOffset = container ? container.getBoundingClientRect().top + window.scrollY : 0;
  return Math.max(rows * rowHeight, window.innerHeight - 100 - topOffset - HEADER_HEIGHT - 20);
}

function createViewportCanvas() {
  const bounds = calculateTimeBounds();
  const totalDurationMinutes = (bounds.maxTime - bounds.minTime) / (60 * 1000);

  timeGridConfig = {
    minTime: bounds.minTime,
    maxTime: bounds.maxTime,
    totalDurationMinutes
  };

  const container = document.getElementById("canvas-container");
  container.innerHTML = "";
  const existingHeader = document.getElementById("gantt-header-canvas");
  if (existingHeader) existingHeader.remove();
  const existingLabel = document.getElementById("gantt-label-canvas");
  if (existingLabel) existingLabel.remove();

  const rawWidth = container.clientWidth || Math.max(800, window.innerWidth - 40);
  const width = Math.max(200, rawWidth - 20);
  const viewportWidth = width - LABEL_WIDTH - 1;

  const headerCanvas = document.createElement("canvas");
  headerCanvas.id = "gantt-header-canvas";
  headerCanvas.width = window.innerWidth - PANEL_WIDTH;
  headerCanvas.height = HEADER_HEIGHT;
  headerCanvas.style.position = "fixed";
  headerCanvas.style.zIndex = 100;
  headerCanvas.style.pointerEvents = "none";
  headerCanvas.style.background = "#f5f5f5";
  headerCanvas.style.borderRadius = "0";
  headerCanvas.style.width = `calc(100vw - ${PANEL_WIDTH}px)`;
  headerCanvas.style.top = "0px";
  headerCanvas.style.left = "0px";
  document.body.appendChild(headerCanvas);

  const labelCanvas = document.createElement("canvas");
  labelCanvas.id = "gantt-label-canvas";
  labelCanvas.width = LABEL_WIDTH;
  labelCanvas.height = window.innerHeight;
  labelCanvas.style.position = "fixed";
  labelCanvas.style.top = "0px";
  labelCanvas.style.zIndex = 101;
  labelCanvas.style.pointerEvents = "auto";
  document.body.appendChild(labelCanvas);

  const canvas = document.createElement("canvas");
  canvas.id = "gantt-viewport-canvas";
  canvas.width = viewportWidth;
  canvas.height = viewportCanvasHeight();
  canvas.style.position = "absolute";
  canvas.style.left = LABEL_WIDTH + "px";
  canvas.style.top = (10 + HEADER_HEIGHT) + "px";
  canvas.style.backgroundColor = "#fff";
  canvas.style.borderRadius = "0 0 5px 5px";
  canvas.style.cursor = "default";
  canvas.style.width = viewportWidth + "px";

  container.appendChild(canvas);
  container.style.height = (canvas.height + HEADER_HEIGHT + 20) + "px";
  canvasMap = { viewport: canvas, header: headerCanvas, labels: labelCanvas };

  worldWidth = totalDurationMinutes * pixelsPerMinute;
}

function updateCanvasSize() {
  const canvas = canvasMap.viewport;
  if (!canvas) return;

  const container = document.getElementById("canvas-container");
  const rawWidth = container.clientWidth || Math.max(800, window.innerWidth - 40);
  const width = Math.max(200, rawWidth - 20);
  const viewportWidth = width - LABEL_WIDTH - 1;
  const h = viewportCanvasHeight();

  canvas.width = viewportWidth;
  canvas.height = h;
  canvas.style.top = (10 + HEADER_HEIGHT) + "px";
  canvas.style.left = LABEL_WIDTH + "px";
  canvas.style.width = viewportWidth + "px";

  const labelCanvas = canvasMap.labels;
  if (labelCanvas) {
    labelCanvas.width = LABEL_WIDTH;
    labelCanvas.height = window.innerHeight;
    labelCanvas.style.left = "0px";
  }

  const header = canvasMap.header;
  if (header) {
    header.width = window.innerWidth - PANEL_WIDTH;
    header.height = HEADER_HEIGHT;
    header.style.width = `calc(100vw - ${PANEL_WIDTH}px)`;
    header.style.top = "0px";
    header.style.left = "0px";
  }
  container.style.height = (h + HEADER_HEIGHT + 20) + "px";
  clampCamera();
}

function clampCamera() {
  const canvas = canvasMap.viewport;
  if (!canvas) return;

  const maxX = Math.max(0, worldWidth - canvas.width);
  camera.x = Math.min(Math.max(0, camera.x), maxX);
}

function timeToWorldX(timeMs) {
  return ((timeMs - timeGridConfig.minTime) / (60 * 1000)) * pixelsPerMinute;
}

function worldXToTimeMs(worldX) {
  return timeGridConfig.minTime + (worldX / pixelsPerMinute) * 60 * 1000;
}

function getTickIntervalMinutes() {
  const minSpacingPx = 40;
  const intervals = [15, 30, 60, 120, 180, 240, 360, 720, 1440, 2880, 4320, 7200, 10080, 20160, 43200];
  for (const interval of intervals) {
    if (interval * pixelsPerMinute >= minSpacingPx) return interval;
  }
  return intervals[intervals.length - 1];
}

function activityToWorldX(activity) {
  return timeToWorldX(activity.start.getTime());
}

function activityWidth(activity) {
  return ((activity.end.getTime() - activity.start.getTime()) / (60 * 1000)) * pixelsPerMinute;
}

function formatTime(d) {
  return d.toISOString().slice(11, 16);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function loadGanttState() {
  try {
    const raw = localStorage.getItem("ganttState");
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state.activities || state.version !== 8) return null;

    state.activities = state.activities.map(t => ({
      ...t,
      start: new Date(t.start),
      end: new Date(t.end)
    }));

    return state;
  } catch (err) {
    console.error("Failed to load Gantt state:", err);
    return null;
  }
}

function saveGanttState() {
  if (isAnimating) return;
  try {
    const state = {
      version: 8,
      dir: currentDir,
      scrollY: window.scrollY,
      activities: activities.map(t => ({
        id: t.id,
        row: t.row,
        start: t.start.toISOString(),
        end: t.end.toISOString(),
        color: t.color,
        label: t.label,
        raw: t.raw
      })),
      cameraX: camera.x,
      pixelsPerMinute: pixelsPerMinute,
      rowHeight: rowHeight
    };
    localStorage.setItem("ganttState", JSON.stringify(state));
    localStorage.setItem("ganttViewport", JSON.stringify({
      pixelsPerMinute: pixelsPerMinute,
      cameraX: camera.x,
      rowHeight: rowHeight,
      scrollY: window.scrollY
    }));
  } catch (err) {
    console.error("Failed to save Gantt state:", err);
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius = 5, roundLeft = true, roundRight = true) {
  const maxRadius = Math.min(height / 2, radius);
  const effectiveRadius = Math.min(maxRadius, width / 2);

  ctx.beginPath();

  if (roundLeft) {
    ctx.moveTo(x + effectiveRadius, y);
  } else {
    ctx.moveTo(x, y);
  }

  if (roundRight) {
    ctx.lineTo(x + width - effectiveRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + effectiveRadius);
  } else {
    ctx.lineTo(x + width, y);
  }

  if (roundRight) {
    ctx.lineTo(x + width, y + height - effectiveRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - effectiveRadius, y + height);
  } else {
    ctx.lineTo(x + width, y + height);
  }

  if (roundLeft) {
    ctx.lineTo(x + effectiveRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - effectiveRadius);
  } else {
    ctx.lineTo(x, y + height);
  }

  if (roundLeft) {
    ctx.lineTo(x, y + effectiveRadius);
    ctx.quadraticCurveTo(x, y, x + effectiveRadius, y);
  } else {
    ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.fill();
}

function drawActivity(activity) {
  const canvas = canvasMap.viewport;
  const ctx = canvas.getContext("2d");

  const worldX = activityToWorldX(activity);
  const width = activityWidth(activity);

  if (worldX + width < camera.x || worldX > camera.x + canvas.width) {
    return;
  }

  const screenX = worldX - camera.x;
  const y = activity.row * rowHeight + 5;
  const height = rowHeight - 10;
  const visibleX = Math.max(0, screenX);
  const visibleRight = Math.min(canvas.width, screenX + width);
  const visibleWidth = visibleRight - visibleX;
  const roundLeft = screenX >= 0;
  const roundRight = screenX + width <= canvas.width;

  if (visibleWidth <= 0) {
    return;
  }

  rectangleMap[activity.id] = {
    activityId: activity.id,
    x: visibleX,
    y,
    width: visibleWidth,
    height,
    color: activity.color,
    label: activity.label,
    activityStart: activity.start.getTime(),
    activityEnd: activity.end.getTime()
  };

  ctx.fillStyle = activity.color;
  drawRoundedRect(ctx, visibleX, y, visibleWidth, height, 5, roundLeft, roundRight);

  const raw = activity.raw || {};
  const pad = 5;
  const W = visibleWidth;
  const H = height;
  const cx = visibleX + W / 2;
  const midY = y + H / 2;
  const topY = midY - 8;
  const botY = midY + 8;

  ctx.save();
  ctx.beginPath();
  const clipRadius = Math.min(5, H / 2, W / 2);
  if (roundLeft && roundRight) {
    ctx.moveTo(visibleX + clipRadius, y);
    ctx.lineTo(visibleX + W - clipRadius, y);
    ctx.quadraticCurveTo(visibleX + W, y, visibleX + W, y + clipRadius);
    ctx.lineTo(visibleX + W, y + H - clipRadius);
    ctx.quadraticCurveTo(visibleX + W, y + H, visibleX + W - clipRadius, y + H);
    ctx.lineTo(visibleX + clipRadius, y + H);
    ctx.quadraticCurveTo(visibleX, y + H, visibleX, y + H - clipRadius);
    ctx.lineTo(visibleX, y + clipRadius);
    ctx.quadraticCurveTo(visibleX, y, visibleX + clipRadius, y);
  } else if (roundLeft) {
    ctx.moveTo(visibleX + clipRadius, y);
    ctx.lineTo(visibleX + W, y);
    ctx.lineTo(visibleX + W, y + H);
    ctx.lineTo(visibleX + clipRadius, y + H);
    ctx.quadraticCurveTo(visibleX, y + H, visibleX, y + H - clipRadius);
    ctx.lineTo(visibleX, y + clipRadius);
    ctx.quadraticCurveTo(visibleX, y, visibleX + clipRadius, y);
  } else if (roundRight) {
    ctx.moveTo(visibleX, y);
    ctx.lineTo(visibleX + W - clipRadius, y);
    ctx.quadraticCurveTo(visibleX + W, y, visibleX + W, y + clipRadius);
    ctx.lineTo(visibleX + W, y + H - clipRadius);
    ctx.quadraticCurveTo(visibleX + W, y + H, visibleX + W - clipRadius, y + H);
    ctx.lineTo(visibleX, y + H);
  } else {
    ctx.rect(visibleX, y, W, H);
  }
  ctx.closePath();
  ctx.clip();

  if (H < 12) { ctx.restore(); return; }

  ctx.fillStyle = "#222";
  ctx.textBaseline = "middle";

  const threeRows = H >= 36;
  const twoRows = H >= 22;

  ctx.font = "bold 12px sans-serif";
  const labelW = ctx.measureText(activity.label).width;
  const labelFits = labelW + 2 * pad <= W;

  if (W >= 110 && labelFits) {
    if (threeRows) {
      // Row 1: airports, Row 2: flight label, Row 3: times
      const r1Y = y + H * 0.25;
      const r2Y = y + H * 0.5;
      const r3Y = y + H * 0.75;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(raw.adep ?? "", visibleX + pad, r1Y);
      ctx.textAlign = "right";
      ctx.fillText(raw.ades ?? "", visibleX + W - pad, r1Y);
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(activity.label, cx, r2Y);
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(formatTime(activity.start), visibleX + pad, r3Y);
      ctx.textAlign = "right";
      ctx.fillText(formatTime(activity.end), visibleX + W - pad, r3Y);
    } else if (twoRows) {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(raw.adep ?? "", visibleX + pad, topY);
      ctx.fillText(formatTime(activity.start), visibleX + pad, botY);
      ctx.textAlign = "center";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(activity.label, cx, topY);
      ctx.font = "11px sans-serif";
      ctx.fillText(raw.planned_actype ?? "", cx, botY);
      ctx.textAlign = "right";
      ctx.fillText(raw.ades ?? "", visibleX + W - pad, topY);
      ctx.fillText(formatTime(activity.end), visibleX + W - pad, botY);
    } else {
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(raw.adep ?? "", visibleX + pad, midY);
      ctx.textAlign = "center";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(activity.label, cx, midY);
      ctx.textAlign = "right";
      ctx.font = "11px sans-serif";
      ctx.fillText(raw.ades ?? "", visibleX + W - pad, midY);
    }
  } else if (W >= 50 && labelFits) {
    ctx.font = "10px sans-serif";
    const startText = formatTime(activity.start);
    const endText = formatTime(activity.end);
    const timesWidth = ctx.measureText(startText).width + ctx.measureText(endText).width + pad * 3;
    const showTimes = twoRows && timesWidth <= W;
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(activity.label, cx, showTimes ? topY : midY);
    if (showTimes) {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(startText, visibleX + pad, botY);
      ctx.textAlign = "right";
      ctx.fillText(endText, visibleX + W - pad, botY);
    }
  } else if (labelFits) {
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(activity.label, cx, midY);
  }

  ctx.restore();
}

function drawHeader() {
  const header = canvasMap.header;
  if (!header || !timeGridConfig || !timeGridConfig.minTime) return;

  const ctx = header.getContext("2d");
  ctx.clearRect(0, 0, header.width, header.height);

  ctx.fillStyle = "#f7f7f7";
  ctx.fillRect(0, 0, header.width, header.height);

  ctx.fillStyle = "#333";
  ctx.font = "12px sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "right";

  const canvasLeft = canvasMap.viewport ? canvasMap.viewport.getBoundingClientRect().left : 0;

  const intervalMs = getTickIntervalMinutes() * 60 * 1000;
  let tickMs = timeGridConfig.minTime;
  let monthYearShown = false;
  while (tickMs <= timeGridConfig.maxTime) {
    const screenX = timeToWorldX(tickMs) - camera.x + canvasLeft;
    if (screenX >= -50 && screenX <= header.width + 50) {
      ctx.strokeStyle = "#ddd";
      ctx.beginPath();
      ctx.moveTo(screenX, header.height - 8);
      ctx.lineTo(screenX, header.height);
      ctx.stroke();
      const dt = new Date(tickMs);
      const hh = String(dt.getUTCHours()).padStart(2, '0');
      const mm = String(dt.getUTCMinutes()).padStart(2, '0');
      const isMidnight = dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0;
      const tickIntervalMinutes = getTickIntervalMinutes();

      ctx.textAlign = "left";
      const padding = 3;
      const labelX = screenX + padding;

      if (!isMidnight || tickIntervalMinutes < 1440) {
        ctx.fillText(`${hh}:${mm}`, labelX, header.height * 0.75);
      }

      if (isMidnight) {
        const day = dt.getUTCDate();
        const dateLabel = String(day);
        const weekdayLabel = dt.toLocaleString([], { weekday: 'short', timeZone: 'UTC' });
        const showMonthYear = !monthYearShown || day === 1;
        if (showMonthYear) {
          const monthYearLabel = dt.toLocaleString([], { month: 'short', timeZone: 'UTC' }) + ' ' + dt.getUTCFullYear();
          ctx.fillText(monthYearLabel, labelX, header.height * 0.25);
          monthYearShown = true;
        }
        ctx.fillText(`${dateLabel} ${weekdayLabel}`, labelX, header.height * 0.5);
      }
    }
    if (timeToWorldX(tickMs) - camera.x + canvasLeft > header.width + 50) break;
    tickMs += intervalMs;
  }
}

function drawGrid() {
  const canvas = canvasMap.viewport;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;

  const intervalMs = getTickIntervalMinutes() * 60 * 1000;
  const worldLeftMs = timeGridConfig.minTime + (camera.x / pixelsPerMinute) * 60 * 1000;
  const firstLineIndex = Math.floor((worldLeftMs - timeGridConfig.minTime) / intervalMs);
  let lineMs = timeGridConfig.minTime + firstLineIndex * intervalMs;

  while (lineMs <= timeGridConfig.maxTime) {
    const screenX = timeToWorldX(lineMs) - camera.x;
    if (screenX >= 0 && screenX <= canvas.width) {
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, rows * rowHeight);
      ctx.stroke();
    }
    if (screenX > canvas.width) break;
    lineMs += intervalMs;
  }

  for (let r = 0; r <= rows; r++) {
    const y = r * rowHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawLabels() {
  const canvas = canvasMap.labels;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const container = document.getElementById("canvas-container");
  const ganttTop = container.getBoundingClientRect().top + 10 + HEADER_HEIGHT;

  const aircraftByIdMap = Object.fromEntries((userInput?.aircrafts ?? []).map(a => [String(a.id), a]));
  const rowMeta = {};
  Object.entries(aircraftRowIndex).forEach(([id, r]) => {
    const ac = aircraftByIdMap[String(id)];
    const regno = ac?.regno ?? ac?.custom_fields?.regno ?? "";
    rowMeta[r] = { id, type: getNestedValue(ac, ["type"]) ?? "", regno };
  });

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (let r = 0; r < rows; r++) {
    const y = ganttTop + r * rowHeight;
    if (y + rowHeight < HEADER_HEIGHT || y > canvas.height) continue;

    ctx.fillStyle = r % 2 === 0 ? "#f7f7f7" : "#f0f0f0";
    ctx.fillRect(0, y, canvas.width, rowHeight);

    ctx.strokeStyle = "#ddd";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + rowHeight);
    ctx.lineTo(canvas.width, y + rowHeight);
    ctx.stroke();

    const { id, type, regno } = rowMeta[r] ?? { id: "", type: "", regno: "" };
    const cx = canvas.width / 2;
    const pad = 4;
    const midY = y + rowHeight / 2;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#333";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(id, pad, midY);
    if (regno) {
      ctx.fillStyle = "#555";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(regno, cx, midY);
    }
    if (type) {
      ctx.fillStyle = "#777";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(type, canvas.width - pad, midY);
    }
  }

  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, canvas.width, HEADER_HEIGHT);
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_HEIGHT - 0.5);
  ctx.lineTo(canvas.width, HEADER_HEIGHT - 0.5);
  ctx.stroke();
  ctx.fillStyle = "#555";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Aircraft", canvas.width / 2, HEADER_HEIGHT / 2);

  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canvas.width - 0.5, 0);
  ctx.lineTo(canvas.width - 0.5, canvas.height);
  ctx.stroke();
}

function drawRotations() {
  const canvas = canvasMap.viewport;
  const ctx = canvas.getContext("2d");

  const rotationSpans = {};
  activities.forEach(a => {
    const rid = a.raw?.rotation_id;
    if (rid == null) return;
    if (!rotationSpans[rid]) rotationSpans[rid] = { minStart: Infinity, maxEnd: -Infinity };
    const s = rotationSpans[rid];
    if (a.start.getTime() < s.minStart) s.minStart = a.start.getTime();
    if (a.end.getTime()   > s.maxEnd)   s.maxEnd   = a.end.getTime();
  });

  const rowCounts = {};
  activities.forEach(a => {
    const rid = a.raw?.rotation_id;
    if (rid == null) return;
    const key = `${rid}_${a.row}`;
    rowCounts[key] = (rowCounts[key] || 0) + 1;
  });
  const primaryRow = {};
  activities.forEach(a => {
    const rid = a.raw?.rotation_id;
    if (rid == null) return;
    const count = rowCounts[`${rid}_${a.row}`];
    if (!primaryRow[rid] || count > primaryRow[rid].count) {
      primaryRow[rid] = { row: a.row, count };
    }
  });

  ctx.strokeStyle = "rgba(80,80,80,0.25)";
  ctx.lineWidth = 1;

  const PAD = 2;

  Object.entries(primaryRow).forEach(([rid, { row }]) => {
    const span        = rotationSpans[rid];
    const worldX      = timeToWorldX(span.minStart);
    const worldRight  = timeToWorldX(span.maxEnd);
    const screenX     = worldX - camera.x - PAD;
    const screenRight = worldRight - camera.x + PAD;

    if (screenRight < 0 || screenX > canvas.width) return;

    const visibleX     = Math.max(0, screenX);
    const visibleRight = Math.min(canvas.width, screenRight);
    const visibleWidth = visibleRight - visibleX;
    const roundLeft    = screenX >= 0;
    const roundRight   = screenRight <= canvas.width;

    const y = row * rowHeight + 3;
    const h = rowHeight - 6;

    ctx.fillStyle = "#ddf2dd";
    drawRoundedRect(ctx, visibleX, y, visibleWidth, h, 7, roundLeft, roundRight);
    ctx.stroke();
  });
}

function drawMaintenances() {
  const canvas = canvasMap.viewport;
  const ctx = canvas.getContext("2d");
  const maintenances = userInput?.maintenances ?? [];

  maintenances.forEach((m, i) => {
    const row = aircraftRowIndex[m.aircraft_id];
    if (row === undefined) return;

    const start = new Date(m.start + "Z");
    const end   = new Date(m.end   + "Z");
    const worldX     = timeToWorldX(start.getTime());
    const worldRight = timeToWorldX(end.getTime());
    const screenX    = worldX - camera.x;
    const width      = worldRight - worldX;

    if (screenX + width < 0 || screenX > canvas.width) return;

    const visibleX     = Math.max(0, screenX);
    const visibleRight = Math.min(canvas.width, screenX + width);
    const visibleWidth = visibleRight - visibleX;
    const roundLeft    = screenX >= 0;
    const roundRight   = screenX + width <= canvas.width;

    const y = row * rowHeight + 5;
    const h = rowHeight - 10;

    rectangleMap[`maint_${i}`] = {
      activityId: `maint_${i}`,
      isMaintenance: true,
      maintenanceData: m,
      x: visibleX, y, width: visibleWidth, height: h,
      activityStart: start.getTime(),
      activityEnd: end.getTime()
    };

    ctx.fillStyle = "#fffaaa";
    drawRoundedRect(ctx, visibleX, y, visibleWidth, h, 5, roundLeft, roundRight);
    ctx.strokeStyle = "rgba(160,140,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const pad = 5;
    const cx  = visibleX + visibleWidth / 2;
    const topY = y + h * 0.3;
    const botY = y + h * 0.7;
    const midY = y + h / 2;
    const twoRows = (botY - topY) >= 13;

    if (h >= 12) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(visibleX, y, visibleWidth, h);
      ctx.clip();
      ctx.fillStyle = "#554400";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";

      const mType = m.type ?? m.custom_fields?.type ?? "";
      if (visibleWidth >= 50 && twoRows) {
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(mType, cx, topY);
        ctx.font = "10px sans-serif";
        ctx.fillText(m.station, cx, botY);
      } else if (visibleWidth >= 30) {
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(mType, cx, midY);
      }

      ctx.restore();
    }
  });
}

function render() {
  const canvas = canvasMap.viewport;
  if (!canvas) return;

  Object.keys(rectangleMap).forEach(key => delete rectangleMap[key]);
  drawHeader();
  drawLabels();
  drawGrid();
  drawRotations();
  drawMaintenances();
  activities.forEach(a => {
    if (a.id !== draggingActivityId) drawActivity(a);
  });
  if (draggingActivityId) {
    const a = activities.find(t => t.id === draggingActivityId);
    if (a) drawActivity(a);
  }

  saveGanttState();
}

function searchRectanglesByTime(timeMs) {
  const results = [];
  Object.keys(rectangleMap).forEach(key => {
    const rect = rectangleMap[key];
    if (timeMs >= rect.activityStart && timeMs <= rect.activityEnd) {
      results.push(rect);
    }
  });
  return results;
}

function removeActivity(activityId) {
  const activityIndex = activities.findIndex(t => t.id === activityId);
  if (activityIndex !== -1) activities.splice(activityIndex, 1);
  render();
}

function addActivity(activityData) {
  if (!activityData.id || activityData.row === undefined || !activityData.start || !activityData.end || !activityData.color || !activityData.label) {
    console.error("Invalid activity data. Required: id, row, start, end, color, label");
    return false;
  }

  if (activities.find(t => t.id === activityData.id)) {
    console.error(`Activity ID ${activityData.id} already exists`);
    return false;
  }

  activities.push(activityData);
  render();
  return true;
}
