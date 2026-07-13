function getNestedValue(obj, pathSegments) {
  return pathSegments.reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function parseKeyGroups(keyPaths) {
  if (typeof keyPaths !== "string") return [];
  keyPaths = keyPaths.trim();
  const regex = /-?[\w]+(?:\.[\w]+)*/g;
  const matches = keyPaths.match(regex) || [];
  return matches.map(group => {
    const desc = group.startsWith("-");
    const clean = desc ? group.slice(1) : group;
    return { path: clean.split("."), desc };
  });
}

function toComparable(val) {
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.trim() !== "" && !isNaN(val)) return Number(val);
  return val;
}

function sortByKey(items, keyPaths) {
  const keyGroups = parseKeyGroups(keyPaths);
  const sortedEntries = Object.entries(items).sort(([, a], [, b]) => {
    for (const { path, desc } of keyGroups) {
      let valA = getNestedValue(a, path);
      let valB = getNestedValue(b, path);
      if (valA == null && valB != null) return desc ? 1 : -1;
      if (valA != null && valB == null) return desc ? -1 : 1;
      if (valA == null && valB == null) continue;
      valA = toComparable(valA);
      valB = toComparable(valB);
      if (valA < valB) return desc ? 1 : -1;
      if (valA > valB) return desc ? -1 : 1;
    }
    return 0;
  });
  const newItems = new Map();
  for (const [index, [id]] of sortedEntries.entries()) newItems.set(id, index);
  return newItems;
}

function buildAircraftRowIndex(keyPaths) {
  const aircrafts = userInput?.aircrafts ?? [];
  const items = Object.fromEntries(aircrafts.map(a => [String(a.id), a]));
  const sorted = sortByKey(items, keyPaths || "id");
  const result = {};
  sorted.forEach((pos, id) => { result[id] = pos; });
  result[UNASSIGNED_ID] = sorted.size;
  return result;
}

function applyAircraftSort(key) {
  if (!userInput) return;
  aircraftSortKey = key;
  try { localStorage.setItem("ganttSortKey", key); } catch (_) {}
  aircraftRowIndex = buildAircraftRowIndex(key);
  activities.forEach(a => {
    a.row = aircraftRowIndex[a.aircraft_id] ?? aircraftRowIndex[UNASSIGNED_ID];
  });
  rows = Math.max(Object.keys(aircraftRowIndex).length, ...activities.map(a => a.row + 1));
  render();
}

function mapFlightDataToActivities(data) {
  if (userInput?.aircrafts?.length) {
    aircraftRowIndex = buildAircraftRowIndex(aircraftSortKey);
  } else {
    const ids = [...new Set(data.map(f => f.aircraft_id).filter(id => id != null))].sort();
    aircraftRowIndex = Object.fromEntries([...ids, UNASSIGNED_ID].map((id, i) => [id, i]));
  }

  return data.map(f => {
    const cf = f.custom_fields || {};
    const label = cf.carrier && cf.fl_num ? `${cf.carrier}${cf.fl_num}` : String(f.id);
    const effectiveId = f.aircraft_id ?? UNASSIGNED_ID;
    const row = aircraftRowIndex[effectiveId] ?? aircraftRowIndex[UNASSIGNED_ID];
    const serviceType = f.service_type ?? cf.svc_type ?? "F";
    const color = serviceTypeColors[serviceType] ?? "#a8dba8";
    return {
      id: f.id,
      aircraft_id: effectiveId,
      row,
      start: new Date(f.start + "Z"),
      end: new Date(f.end + "Z"),
      color,
      label,
      raw: f
    };
  });
}

function initApp() {
  try {
    const saved = localStorage.getItem("ganttSortKey");
    if (saved !== null) {
      aircraftSortKey = saved;
      const el = document.getElementById("sort-key-input");
      if (el) el.value = saved;
    }
  } catch (_) {}
  _savedState = loadGanttState();
  if (_savedState && _savedState.dir === currentDir) {
    aircraftRowIndex = buildAircraftRowIndex(aircraftSortKey);
    activities = _savedState.activities;
  } else {
    activities = mapFlightDataToActivities(userInput.flights);
    _savedState = null; // don't use zoom from a different dir's save
  }
  // viewport (pixelsPerMinute, camera, rowHeight) is applied in startRender
  rows = Math.max(Object.keys(aircraftRowIndex).length, ...activities.map(a => a.row + 1));
  startRender();
}
