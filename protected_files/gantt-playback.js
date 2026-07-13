// -------------------------
// PLAYBACK QUEUE
// -------------------------

function enqueueAssignment(flightData, kpis = null, label = "", listIdx = null) {
  assignmentQueue.push({ flights: flightData, kpis, label, listIdx });
  updateQueueCount();
  if (playbackWanted && !playbackRunning) {
    playbackRunning = true;
    const btn = document.getElementById("playback-btn");
    if (btn) { btn.textContent = "Running…"; btn.style.background = "#27ae60"; }
    playbackTick();
  }
}

function _applyFlightSnapshot(flights, kpis, label, listIdx, fromQueue = false) {
  if (typeof listIdx === "number") {
    if (_solCurrentPlayIdx >= 0) {
      _updateSolItemStyle(_solCurrentPlayIdx, fromQueue ? "played" : "queued");
    }
    _solCurrentPlayIdx = listIdx;
    _updateSolItemStyle(listIdx, "playing");
  }

  const prevAircraftById = {};
  activities.forEach(a => { prevAircraftById[a.id] = a.aircraft_id; });

  const nextActivities = mapFlightDataToActivities(flights);
  const targetRowById = {};
  nextActivities.forEach(a => { targetRowById[a.id] = a.row; });

  const fromRowById = {};
  nextActivities.forEach(a => {
    const prevAircraft = prevAircraftById[a.id];
    const changed = prevAircraft !== undefined
      && String(prevAircraft) !== String(a.aircraft_id);
    fromRowById[a.id] = changed
      ? (aircraftRowIndex[prevAircraft] ?? aircraftRowIndex[UNASSIGNED_ID])
      : targetRowById[a.id];
    a.row = fromRowById[a.id];
  });

  activities = nextActivities;
  rows = Math.max(Object.keys(aircraftRowIndex).length, ...Object.values(targetRowById).map(r => r + 1));
  updateCanvasSize();
  updateKpiDisplay(kpis, label);

  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

  isAnimating = true;
  const startTime = performance.now();

  function animateFrame(timestamp) {
    const t = Math.min(1, (timestamp - startTime) / ANIMATION_DURATION_MS);
    const eased = easeInOut(t);

    activities.forEach(a => {
      const from = fromRowById[a.id] ?? targetRowById[a.id];
      a.row = from + (targetRowById[a.id] - from) * eased;
    });

    Object.keys(rectangleMap).forEach(k => delete rectangleMap[k]);
    drawHeader();
    drawLabels();
    drawGrid();
    drawRotations();
    drawMaintenances();
    activities.forEach(a => drawActivity(a));

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animateFrame);
    } else {
      activities.forEach(a => { a.row = targetRowById[a.id]; });
      isAnimating = false;
      animationFrameId = null;
      render();
      onAnimationComplete();
    }
  }

  animationFrameId = requestAnimationFrame(animateFrame);
}

function applyNextAssignment() {
  while (assignmentQueue.length > 0) {
    const { flights, kpis, label, listIdx } = assignmentQueue.shift();
    updateQueueCount();
    if (typeof listIdx === "number" && _solList[listIdx]?.enabled === false) continue;
    _scheduleFill();
    _applyFlightSnapshot(flights, kpis, label, listIdx, true);
    return;
  }
}

async function jumpToSolution(idx) {
  if (idx < 0 || idx >= _solList.length) return;

  if (playbackRunning) {
    playbackRunning = false;
    clearTimeout(playbackTimer);
    playbackTimer = null;
    const btn = document.getElementById("playback-btn");
    if (btn) { btn.textContent = "Start"; btn.style.background = "#3498db"; }
  }
  if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
  isAnimating = false;

  // _solFetched items are drained into assignmentQueue and deleted from the map,
  // so search both sources before falling back to a network fetch.
  let item = _solFetched.get(idx);
  if (!item) {
    const queued = assignmentQueue.find(q => q.listIdx === idx);
    if (queued) item = { flights: queued.flights, kpis: queued.kpis, label: queued.label };
  }

  if (!item && _solFetching.has(idx)) {
    _updateSolItemStyle(idx, "fetching");
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (!_solFetching.has(idx)) { clearInterval(check); resolve(); }
      }, 50);
    });
    item = _solFetched.get(idx);
    if (!item) {
      const queued = assignmentQueue.find(q => q.listIdx === idx);
      if (queued) item = { flights: queued.flights, kpis: queued.kpis, label: queued.label };
    }
  }

  if (!item) {
    _updateSolItemStyle(idx, "fetching");
    const gen = _solGeneration;
    const { filename, label } = _solList[idx];
    try {
      const url = `${solutionBaseUrl}${filename}`;
      const data = await fetch(url, { credentials: "include" }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      });
      if (gen !== _solGeneration) return;
      const flights = transformSolutionToFlights(data);
      item = { flights, kpis: data.kpis ?? null, label };
    } catch (err) {
      console.error(`jumpToSolution: failed to fetch ${_solList[idx].filename}:`, err);
      _updateSolItemStyle(idx, "error");
      return;
    }
  }

  // Snap instantly — animation is only for playlist playback
  if (_solCurrentPlayIdx >= 0) _updateSolItemStyle(_solCurrentPlayIdx, "queued");
  _solCurrentPlayIdx = idx;
  _updateSolItemStyle(idx, "playing");

  activities = mapFlightDataToActivities(item.flights);
  rows = Math.max(Object.keys(aircraftRowIndex).length, ...activities.map(a => a.row + 1));
  updateCanvasSize();
  updateKpiDisplay(item.kpis, item.label);
  render();
}

function onAnimationComplete() {
  if (!playbackRunning) return;
  if (assignmentQueue.length === 0) {
    playbackRunning = false;
    const waiting = playbackWanted && !!_liveSource;
    if (!waiting) playbackWanted = false;
    const btn = document.getElementById("playback-btn");
    if (btn) { btn.textContent = waiting ? "Waiting…" : "Start"; btn.style.background = waiting ? "#e67e22" : "#3498db"; }
    return;
  }
  playbackTimer = setTimeout(playbackTick, PLAYBACK_INTERVAL_MS);
}

function playbackTick() {
  if (!playbackRunning) return;
  applyNextAssignment();
}

function togglePlayback() {
  const btn = document.getElementById("playback-btn");
  if (playbackRunning || playbackWanted) {
    playbackRunning = false;
    playbackWanted = false;
    clearTimeout(playbackTimer);
    playbackTimer = null;
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
    isAnimating = false;
    btn.textContent = "Start";
    btn.style.background = "#3498db";
  } else {
    if (assignmentQueue.length === 0) {
      if (_solList.length > 0) {
        playbackWanted = true;
        btn.textContent = "Running…";
        btn.style.background = "#27ae60";
        loadSolutionsIntoQueue();
      }
      return;
    }
    playbackWanted = true;
    playbackRunning = true;
    btn.textContent = "Running…";
    btn.style.background = "#27ae60";
    playbackTick();
  }
}

function updateQueueCount() {
  const el = document.getElementById("playback-queue-count");
  if (!el) return;
  el.textContent = assignmentQueue.length > 0 ? `${assignmentQueue.length} in playlist` : "";
}

function updateKpiDisplay(kpis, label) {
  const el = document.getElementById("kpi-display");
  if (!el) return;
  if (!kpis) { el.innerHTML = ""; return; }
  const total = (kpis.num_assigned ?? 0) + (kpis.num_unassigned ?? 0);
  const cost = kpis.cost != null ? (kpis.cost / 1e6).toFixed(2) + "M" : "—";
  el.innerHTML = `
    <div style="font-weight:bold;color:#333;margin-bottom:2px;">${label}</div>
    <div>${kpis.num_assigned} / ${total} assigned</div>
    <div style="color:#888;">cost: ${cost}</div>
  `;
}

// -------------------------
// SOLUTION FILE LOADING
// -------------------------

function getBackendUrl() {
  const el = document.getElementById("backend-base-url");
  return el ? el.value.replace(/\/$/, "") : "";
}

async function _populateDirectories(select, dirs) {
  const current = select.value;
  select.innerHTML = '<option value="">-- select --</option>';
  dirs.forEach(dir => {
    const opt = document.createElement("option");
    opt.value = dir;
    opt.textContent = dir;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

async function fetchDirectories() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const savedUrl = urlParams.get("url");
    if (savedUrl) {
      const el = document.getElementById("backend-base-url");
      if (el) el.value = savedUrl;
    }
    const resp = await fetch(`${getBackendUrl()}/opt/directories/`, { credentials: "include" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { run_directories } = await resp.json();
    const select = document.getElementById("dir-select");
    await _populateDirectories(select, run_directories);
    const urlDir = new URLSearchParams(window.location.search).get("dir");
    if (urlDir) {
      select.value = urlDir;
      await loadBackendDirectory(urlDir);
    }
  } catch (err) {
    console.warn("Backend directories unavailable:", err);
  }
}

async function refreshDirectories() {
  try {
    const resp = await fetch(`${getBackendUrl()}/opt/directories/`, { credentials: "include" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { run_directories } = await resp.json();
    await _populateDirectories(document.getElementById("dir-select"), run_directories);
  } catch (err) {
    console.warn("Failed to refresh directories:", err);
  }
}

async function loadBackendDirectory(dir) {
  const status = document.getElementById("dir-status");
  status.style.color = "#e67e22";
  status.textContent = "Loading…";
  try {
    const base = `${getBackendUrl()}/opt/directories/${dir}`;
    const fetchInput = async () => {
      for (const name of ["input.json", "user_input.json"]) {
        const r = await fetch(`${base}/${name}`, { credentials: "include" });
        if (r.ok) return r.json();
      }
      throw new Error("Neither user_input.json nor input.json found");
    };
    const [summary, input] = await Promise.all([
      fetch(`${base}/run_summary.json`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error(`run_summary: HTTP ${r.status}`); return r.json(); }),
      fetchInput(),
    ]);
    console.log("[debug] run_summary:", summary);
    console.log("[debug] input keys:", Object.keys(input));
    console.log("[debug] first flight:", input.flights?.[0]);
    console.log("[debug] flight count:", input.flights?.length);
    currentDir = dir;
    solutionBaseUrl = `${base}/`;
    SOLUTION_FILES = summary.solutions ?? [];
    userInput = input;
    const params = new URLSearchParams({ dir });
    const backendUrl = getBackendUrl();
    if (backendUrl !== "") params.set("url", backendUrl);
    history.replaceState({}, "", "?" + params.toString());
    initApp();
    status.style.color = "#27ae60";
    status.textContent = `${SOLUTION_FILES.length} solution(s)`;
    if (SOLUTION_FILES.length) loadSolutionsIntoQueue();
  } catch (err) {
    console.error("Failed to load backend directory:", err);
    status.style.color = "#e74c3c";
    status.textContent = "Error: " + err.message;
  }
}

function loadBackendSelected() {
  const dir = document.getElementById("dir-select").value;
  if (!dir) { alert("Select a backend directory first."); return; }
  loadBackendDirectory(dir);
}

function transformSolutionToFlights(solutionData) {
  if (!solutionData?.chains) throw new Error("solution missing 'chains' key");

  const aircraftById = Object.fromEntries(
    userInput.aircrafts.map(a => [String(a.id), a])
  );

  const assignment = new Map();
  Object.entries(solutionData.chains).forEach(([chainKey, flightIds]) => {
    let aircraftId;
    if (chainKey === UNASSIGNED_ID) {
      aircraftId = UNASSIGNED_ID;
    } else {
      const aircraft = aircraftById[chainKey];
      if (!aircraft) return;
      aircraftId = aircraft.id;
    }
    flightIds.forEach(fid => assignment.set(String(fid), aircraftId));
  });

  return userInput.flights.map(f => ({
    ...f,
    aircraft_id: assignment.get(String(f.id)) ?? UNASSIGNED_ID
  }));
}

// -------------------------
// SOLUTION STREAMING
// -------------------------

function _updateSolItemStyle(idx, state) {
  const item = _solList[idx];
  if (!item?.el) return;
  item.state = state;
  const solId = currentDir ? `${currentDir}/${item.filename}` : item.filename;
  const sel = selectedSolutionIds.has(solId) ? "box-shadow:inset 0 0 0 2px #2980b9;" : "";
  item.el.style.cssText = "padding:2px 5px;border-radius:3px;font-size:10px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;gap:4px;" + (_solItemStyles[state] ?? _solItemStyles.pending) + sel;
}

async function _fetchSolution(idx, gen) {
  const { filename, label } = _solList[idx];
  try {
    const url = `${solutionBaseUrl}${filename}`;
    const data = await fetch(url, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
      return r.json();
    });
    if (gen !== _solGeneration) return;
    const flights = transformSolutionToFlights(data);
    _solFetched.set(idx, { flights, kpis: data.kpis ?? null, label });
  } catch (err) {
    console.error(`Failed to fetch ${filename}:`, err);
    if (gen !== _solGeneration) return;
    _solFetched.set(idx, null);
    _updateSolItemStyle(idx, "error");
  }
  _solFetching.delete(idx);
  _drainFetchedToQueue();
  _scheduleFill();
}

function _drainFetchedToQueue() {
  while (_solFetched.has(_solEnqueueNext)) {
    const item = _solFetched.get(_solEnqueueNext);
    _solFetched.delete(_solEnqueueNext);
    if (item && _solList[_solEnqueueNext]?.enabled !== false) {
      _updateSolItemStyle(_solEnqueueNext, "queued");
      enqueueAssignment(item.flights, item.kpis, item.label, _solEnqueueNext);
    }
    _solEnqueueNext++;
  }
}

function _scheduleFill() {
  const ready = assignmentQueue.length + _solFetching.size + _solFetched.size;
  let slots = QUEUE_TARGET - ready;
  while (slots > 0 && _solFetchNext < _solList.length) {
    const idx = _solFetchNext++;
    _solFetching.add(idx);
    _updateSolItemStyle(idx, "fetching");
    _fetchSolution(idx, _solGeneration);
    slots--;
  }
}

function _createSolItem(filename, idx) {
  const el = document.createElement("div");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = true;
  cb.style.cssText = "flex-shrink:0;margin:0;cursor:pointer;";
  cb.addEventListener("change", () => {
    if (_solList[idx]) _solList[idx].enabled = cb.checked;
    updateSelectAllCheckbox();
  });
  cb.addEventListener("click", e => e.stopPropagation());

  const span = document.createElement("span");
  span.textContent = filename;
  span.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;";

  el.appendChild(cb);
  el.appendChild(span);

  el.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey) {
      const solId = `${currentDir}/${filename}`;
      if (selectedSolutionIds.has(solId)) selectedSolutionIds.delete(solId);
      else selectedSolutionIds.add(solId);
      _updateSolItemStyle(idx, _solList[idx]?.state ?? "pending");
      updateCompareLink();
    } else {
      jumpToSolution(idx);
    }
  });

  return el;
}

function toggleAllSolutions(checked) {
  _solList.forEach((item, i) => {
    item.enabled = checked;
    const cb = item.el?.querySelector("input[type=checkbox]");
    if (cb) cb.checked = checked;
  });
}

function updateSelectAllCheckbox() {
  const master = document.getElementById("solutions-all-checkbox");
  if (!master || _solList.length === 0) return;
  const allChecked = _solList.every(s => s.enabled !== false);
  const noneChecked = _solList.every(s => s.enabled === false);
  master.indeterminate = !allChecked && !noneChecked;
  master.checked = allChecked;
}

function loadSolutionsIntoQueue() {
  if (!SOLUTION_FILES.length) { alert("Load a backend directory first."); return; }

  _solGeneration++;
  _solList = [];
  _solFetchNext = 0;
  _solEnqueueNext = 0;
  _solFetched.clear();
  _solFetching.clear();
  _solCurrentPlayIdx = -1;
  assignmentQueue.length = 0;
  updateQueueCount();
  selectedSolutionIds.clear();
  updateCompareLink();

  if (playbackRunning) togglePlayback();

  function stepNum(f) { const m = f.match(/step(\d+)/); return m ? parseInt(m[1]) : 0; }
  function solLabel(f) { return f.replace(/_sol\d+\.json$/, "").replace(/_original\.json$/, " (original)").replace(/^step(\d+)/, "Step $1"); }
  const sorted = [...SOLUTION_FILES].sort((a, b) => {
    const d = stepNum(a) - stepNum(b);
    if (d !== 0) return d;
    return (a.includes("original") ? 0 : 1) - (b.includes("original") ? 0 : 1);
  });

  const listEl = document.getElementById("solution-list");
  if (listEl) listEl.innerHTML = "";

  sorted.forEach((filename, i) => {
    const label = solLabel(filename);
    const el = _createSolItem(filename, i);
    if (listEl) listEl.appendChild(el);
    _solList.push({ filename, label, el, state: "pending", enabled: true });
    _updateSolItemStyle(i, "pending");
  });

  _solList.forEach((_, i) => {
    _solFetching.add(i);
    _updateSolItemStyle(i, "fetching");
    _fetchSolution(i, _solGeneration);
  });
  _solFetchNext = _solList.length;
}

// -------------------------
// COMPARE LINK
// -------------------------

function encodeFilePath(path) {
  let encodedPath = path.replace(/\//g, '-').replace(/^-+/, '');
  encodedPath = encodedPath.replace(/-(?=[^-]*$)/, ':');
  return encodedPath;
}

function updateCompareLink() {
  const link = document.getElementById("compare-link");
  if (!link) return;
  const canCompare = selectedSolutionIds.size >= 2;
  link.style.opacity = canCompare ? "1" : "0.4";
  link.style.pointerEvents = canCompare ? "auto" : "none";
}

function clearSelectedSolutions() {
  const toRedraw = [...selectedSolutionIds];
  selectedSolutionIds.clear();
  toRedraw.forEach(solId => {
    const idx = _solList.findIndex(s => (currentDir ? `${currentDir}/${s.filename}` : s.filename) === solId);
    if (idx !== -1) _updateSolItemStyle(idx, _solList[idx].state ?? "pending");
  });
  updateCompareLink();
}

function initCompareLink() {
  const link = document.getElementById("compare-link");
  if (!link) return;
  link.addEventListener("mouseover", () => {
    const solutionIds = [...selectedSolutionIds];
    const solutionIdsEncoded = solutionIds.map(id => encodeFilePath(id));
    const queryString = solutionIdsEncoded.join(',');
    link.setAttribute("href", `${getBackendUrl()}/opt/compare?solution_ids=${queryString}`);
  });
}

// -------------------------
// LIVE POLLING
// -------------------------

const LIVE_POLL_INTERVAL_MS = 1000;

function toggleLive() {
  const cb = document.getElementById("live-checkbox");
  if (cb.checked) {
    if (!currentDir) { cb.checked = false; alert("Load a backend directory first."); return; }
    _startLiveStream();
  } else {
    _stopLive();
  }
}

function _setLiveLabel(active) {
  const el = document.getElementById("live-label");
  if (!el) return;
  el.textContent = active ? "Live ●" : "Live";
  el.style.color = active ? "#27ae60" : "#555";
}

function _startLiveStream() {
  _stopLive();
  _liveSource = true; // sentinel: polling is active before first setTimeout ID is assigned
  _setLiveLabel(true);
  _pollLive();
}

async function _pollLive() {
  if (!_liveSource) return;
  try {
    const summary = await fetch(`${solutionBaseUrl}run_summary.json`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    const knownSet = new Set(SOLUTION_FILES);
    const newFiles = (summary.solutions ?? []).filter(f => !knownSet.has(f));
    if (newFiles.length) _addLiveSolutions(newFiles);
  } catch (err) {
    console.warn("Live poll error:", err);
  }
  if (_liveSource) _liveSource = setTimeout(_pollLive, LIVE_POLL_INTERVAL_MS);
}

function _stopLive() {
  if (_liveSource) { clearTimeout(_liveSource); _liveSource = null; }
  _setLiveLabel(false);
}

function _addLiveSolutions(newFilenames) {
  function stepNum(f) { const m = f.match(/step(\d+)/); return m ? parseInt(m[1]) : 0; }
  function solLabel(f) { return f.replace(/_sol\d+\.json$/, "").replace(/_original\.json$/, " (original)").replace(/^step(\d+)/, "Step $1"); }
  newFilenames.sort((a, b) => stepNum(a) - stepNum(b) || (a.includes("original") ? -1 : 1));

  const listEl = document.getElementById("solution-list");
  newFilenames.forEach(filename => {
    SOLUTION_FILES.push(filename);
    const label = solLabel(filename);
    const idx = _solList.length;
    const el = _createSolItem(filename, idx);
    if (listEl) listEl.appendChild(el);
    _solList.push({ filename, label, el, state: "pending", enabled: true });
    _updateSolItemStyle(_solList.length - 1, "pending");
  });

  _scheduleFill();
}
