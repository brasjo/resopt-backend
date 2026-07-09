// localStorage.clear();
// Root styles and default values
const rootStyles = getComputedStyle(document.documentElement);
// Initial spacing between days (in pixels)
const defaultDaySpacing = parseFloat(
    rootStyles.getPropertyValue('--default-day-spacing')
)
const defaultResourceHeight = parseFloat(
    rootStyles.getPropertyValue('--default-resource-height')
);
//----------------------------------------------

const defaultSortKey = 'regno';
// Load previous state from localStorage
const initScrollLeft = getFloatFromStorage('scrollLeft');
const initScrollTop = getFloatFromStorage('scrollTop');
let daySpacing = getFloatFromStorage('daySpacing', defaultDaySpacing);
let liveModeIsOn = getBoolFromStorage('liveModeIsOn', false);
let loadedOutputPath = getStringFromStorage('loadedOutputPath');
let resourceHeight = getFloatFromStorage('resourceHeight', defaultResourceHeight);
let loadedOutputId = getStringFromStorage('loadedOutputId');
let selectedOptScenarioId = getStringFromStorage('selectedOptScenarioId');
let loadedOptScenarioId = getStringFromStorage('loadedOptScenarioId');
let selectedOutputId = getStringFromStorage('selectedOutputId');
let currentSortKey = getStringFromStorage('currentSortKey', defaultSortKey);
let currentSolutionId = getStringFromStorage('currentSolutionId', '');
let loadedOptScenarios = [];
let loadedOptScenario = null;
let menuOutputs = {};  // E.g. {"1": output1, "2": output2}
let runQueue = new Array();
let previousSolutionTimestamp = performance.now();
async function processQueue() {
    console.log("Processing runQueue, length:", runQueue.length);
    const interval = Number(animationIntervalElement.value) * 1000;
    let solution = null;
    while (true) {
        if (!isRunning) {
            break;
        }
        if (runQueue.length === 0) {
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
        }
        solution = runQueue.shift();
        const currentTime = performance.now();
        const elapsed = currentTime - previousSolutionTimestamp;
        const remainingTime = Math.max(interval - elapsed, 0);
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }
        if (!isRunning) {
            break;
        }
        clearStationLabels();
        if (runQueue.length === 0) {
            drawSolution(solution);
        } else {
            replaceCurrentSolution(solution);
        }
        setActiveSolutionInMenu(solution.outputId);
        setCurrentSolutionId(solution.outputId);
        previousSolutionTimestamp = performance.now();
    }
    createStationLabels(solution.chains)
}
document.documentElement.style.setProperty('--activity-height', `${resourceHeight}px`);
//----------------------------------------------

const maxZoomX = 4000;
const minZoomX = 20;
const maxZoomY = 100;
const minZoomY = 11;

let isRunning = false;
let periodStart;
let periodEnd;
let dataPeriodStart;
let dataPeriodEnd;
let daysInDataPeriod;
let daysInPeriod;
let loadedActivities;
let loadedRotations;
let maintenances;
let isSearching = false;
let currentKpisSolutionId = null; // Solution ID for which KPIs are shown
let solutionMouseEnterTimeout; // Id for solution hoover timeout
let solutionMouseEnterDelay = 1000; // Delay in milliseconds before showing solution info
let solutionMouseLeaveTimeout; // Id for solution mouse leave timeout
let solutionMouseLeaveDelay = 500; // Delay in milliseconds before hiding solution info
let liveInterval = 3000; // 2 seconds fetch interval
let updateGraphsIntervalId;
const updateGraphsInterval = 1000;
let liveIntervalId = null; // Interval ID for live mode
let circleIntervalId = null; // Interval ID for blinking circle
let loadedRegnos2Maintenances = {}; // E.g. {"AAAA": [maint1, maint2]}
let loadedResourceId2Maintenances = {}; // E.g. {"resourceId": [maint1, maint2]}
let loadedResources;
let sortedResourceIds2Index = {}; // E.g. {"resourceId": 0, "resourceId2": 1}
let sortedIndex2ResourceIds = [];
let loadedMaintenances;
let loadedRegnos2resources; // E.g. {"AAAA": resource1}
let generation;
let loadedGenerations = {};
let loadedSolutions = [];
let loadedSolutionIds = new Set();
let loadedSolutionFileName = "";
let loadedSolutionId = localStorage.getItem('loadedSolutionId') || "";
let loadedMeta = {};
let menuMeta = {};
let currentActivitiesMap = {};
let menuOutputPath = loadedOutputPath;
let minutesInDataPeriod;
let timeoutIds = [];
let selectedSolutionIds = [];
let isLive = false;
let unassignedResource = {
    "id": "unassigned",
    "regno": "UNASSIGNED",
};

// Function to update the visible range and scale
function updateVisibleRange(startDate, endDate, flights) {
    console.log("Visible Range:", startDate, "to", endDate);
    console.log("Visible Flights:", flights);

    // Calculate the visible duration in minutes
    const visibleDuration = (endDate - startDate) / (1000 * 60);

    // Update the scale dynamically
    const scaleFactor = chart.offsetWidth / visibleDuration;
    document.documentElement.style.setProperty('--scale-factor', scaleFactor);

    // Optionally, update a UI element to show the visible date range
    const visibleRangeElement = document.getElementById('visible-range');
    if (visibleRangeElement) {
        visibleRangeElement.textContent = `Visible Range: ${startDate.toISOString()} - ${endDate.toISOString()}`;
    }
}

let stdCanvas = document.getElementById('std-deviation-canvas');
const kpiMenuElement = document.getElementById('menu-kpi');
const kpiTableElement = document.getElementById('kpi-table');
const graphIconElement = document.getElementById('graph-icon');
let activeSolutionElement = null;
let meanCanvas = document.getElementById('mean-canvas');
let bestFitnessCanvas = document.getElementById('best-fitness-canvas');
let numDrawnInUnassigned = 0;
const numUnassignedThreshold = 99999;
const finderElement = document.getElementById('finder');
const finderInputElement = finderElement.querySelector('input');
const compareLinkElement = document.getElementById('compare-link');
const clearMarksButtonElement = document.getElementById('clear-marks-button');
const reportMenuElement = document.getElementById('menu-report');
const kpisIconElement = document.getElementById('kpis-icon');
const reportIconElement = document.getElementById('report-icon');
const inputSortElement = document.getElementById('input-sort');
inputSortElement.value = currentSortKey;
const sortButtonElement = document.getElementById('sort-button');
sortButtonElement.addEventListener('click', async () => {
    if (!loadedResources) {
        console.log("No loaded resources, cannot sort");
        return;
    }
    setCurrentSortKey(inputSortElement.value);
    sortedResourceIds2Index = sortByKey(loadedResources, currentSortKey);
    console.log('sortedResourceIds2Index:', sortedResourceIds2Index);
    sortedIndex2ResourceIds = reverseMapping(sortedResourceIds2Index);
    console.log('sortedIndex2ResourceIds:', sortedIndex2ResourceIds);
    drawResources();
    if (loadedSolutionId) {
        await drawSolutionId(loadedSolutionId);
    }
});
function setCurrentSortKey(sortKey) {
    currentSortKey = sortKey;
    localStorage.setItem('currentSortKey', sortKey);
    console.log('currentSortKey set to:', sortKey);
}
function encodePath(path) {
    return path.replace(/\//g, '-').replace(/^-+/, '');
}
function encodeFilePath(path) {
    let encodedPath = path.replace(/\//g, '-').replace(/^-+/, '');
    // Step 3: Replace only the last '-' with ':'
    encodedPath = encodedPath.replace(/-(?=[^-]*$)/, ':');
    return encodedPath;
}
function touches(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
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
    for (const [index, array] of sortedEntries.entries()) {
        const [id] = array;
        newItems.set(id, index);
    }
    return newItems;
}
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
reportMenuElement.querySelectorAll('a[data-report]').forEach(item => {
    item.addEventListener('click', (e) => {
        const format = item.dataset.format;
        const reportType = item.dataset.report;
        const optScenarioId = selectedOptScenarioId;
        const outputId = selectedReportOptScenarioId;

        // Build the URL
        // const url = `/${runId}/solutions/${outputId}/reports/?format=${encodeURIComponent(format)}&report_type=${encodeURIComponent(reportType)}`;
        const url = `/opt/${optScenarioId}/solutions/${outputId}/reports/?report=${reportType}_${format}`;

        console.log("User selected:", format, "→ navigating to:", url);

        // Hide menu
        reportMenuElement.classList.remove("show");

        // Programmatically “click” it (navigate)
        window.location.href = url;
    });
});
clearMarksButtonElement.addEventListener('click', () => {
    selectedSolutionIds = [];
    for (const div of document.querySelectorAll('#generations-fieldset div.selected')) {
        div.classList.remove('selected');
    }
    console.log("Cleared selected solutions:", selectedSolutionIds);
    setMarkedSolutionsInStorage();
});
function setMarkedSolutionsInStorage() {
    if (selectedSolutionIds.length >= 2) {
        compareLinkElement.classList.remove('disabled');
    } else {
        compareLinkElement.classList.add('disabled');
    }
    if (selectedSolutionIds.length === 0) {
        clearMarksButtonElement.disabled = true;
    } else {
        clearMarksButtonElement.disabled = false;
    }
    localStorage.setItem('selectedSolutionIds', JSON.stringify(selectedSolutionIds));
    console.log('selectedSolutionIds saved to storage:', selectedSolutionIds);
}
function loadSelectedSolutionIdsFromStorage() {
    const selectedSolutionIdsStr = localStorage.getItem('selectedSolutionIds');
    console.log("Loading selected output ids from storage:", selectedSolutionIdsStr);
    if (selectedSolutionIdsStr) {
        selectedSolutionIds = JSON.parse(selectedSolutionIdsStr);
        console.log("Loaded selected output ids:", selectedSolutionIds);
        console.log("menuOutputPath", menuOutputPath);
        if (selectedSolutionIds.length >= 2) {
            compareLinkElement.classList.remove('disabled');
        } else {
            compareLinkElement.classList.add('disabled');
        }
        if (selectedSolutionIds.length >= 1) {
            clearMarksButtonElement.disabled = false;
        } else {
            clearMarksButtonElement.disabled = true;
        }
        for (const div of document.querySelectorAll('#generations-fieldset div')) {
            const solutionId = div.dataset.solutionId;
            for (const id of selectedSolutionIds) {
                if (solutionId === id) {
                    div.classList.add('selected');
                }
            }
        }
    }
}
compareLinkElement.addEventListener('mouseover', async () => {
    // Group solutions by run
    const solutionIds = [ ...selectedSolutionIds ];
    const solutionIdsEncoded = solutionIds.map(id => encodeFilePath(id));
    console.log("Encoded solution IDs for comparison:", solutionIdsEncoded);
    let queryString = solutionIdsEncoded.join(',');

    // Final URL
    let url = `/opt/compare?solution_ids=${queryString}`;

    console.log(url);
    compareLinkElement.setAttribute('href', url);
    compareLinkElement.classList.remove('disabled');
});


function containsKeywords(activityElement, keywords) {
    if (keywords.size === 0) {
        return true;
    }
    const lastKeyword = Array.from(keywords).pop();
    if (keywords.size > 1) {
        for (const keyword of keywords) {
            if (keyword.startsWith("id-")) {
                const id = keyword.slice(3);
                const activityElemId = `${activityElement.dataset.activityType}-${id}`
                if (activityElement.id === activityElemId) {
                    return true;
                }
                return false;
            }
        };
        if (lastKeyword === "") {
            // Don't compare with empty string
            keywords.delete("");
        }
        if (isSubset(keywords, activityElement.keywords)) {
            return true;
        }
        return false;
    } else if (keywords.size === 1) {
        if (lastKeyword === "") {
            return true;
        }
    }
    return false;
}
function stringToKeywords(str) {
    const keywords = new Set(str.trim().split(" "));
    if (keywords.has("")) {
        keywords.delete("");
    }
    return keywords;
}
finderInputElement.addEventListener("input", function (event) {
    const value = event.target.value;
    const keywords = stringToKeywords(value);
    const lastKeyword = Array.from(keywords).pop();

    let activityElements = document.querySelectorAll('.activity');
    if (keywords.size === 0) {
        activityElements.forEach(activityElement => {
            activityElement.classList.remove('gray');
        });
        return;
    }
    if (keywords.size > 1) {
        for (const keyword of keywords) {
            if (keyword.startsWith("id-")) {
                const id = keyword.slice(3);
                activityElements.forEach(activityElement => {
                    const activityId = `${activityElement.dataset.activityType}-${id}`
                    if (activityElement.id === activityId) {
                        activityElement.classList.remove('gray');
                    } else {
                        activityElement.classList.add('gray');
                    }
                });
                return;
            }
        };
        if (lastKeyword === "") {
            // Don't compare with empty string
            keywords.delete("");
        }
        activityElements.forEach(activityElement => {
            if (isSubset(keywords, activityElement.keywords)) {
                activityElement.classList.remove('gray');
            } else {
                activityElement.classList.add('gray');
            }
        });
        return;
    } else if (keywords.size === 1) {
        if (lastKeyword === "") {
            activityElements.forEach(activityElement => {
                activityElement.classList.remove('gray');
            });
            return;
        }
    }

    activityElements.forEach(activityElement => {
        if (keywords.size > 1) {
            if (isSubset(keywords, activityElement.keywords)) {
                activityElement.classList.remove('gray');
            } else {
                activityElement.classList.add('gray');
            }
        }

        if (isSubset(keywords, activityElement.keywords)) {
            activityElement.classList.remove('gray');
        } else {
            activityElement.classList.add('gray');
        }
    });
});

graphIconElement.addEventListener('click', () => {
    console.log("Graph icon clicked");
    menuGraph.classList.toggle("active");;
});

document.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        console.log("Enter pressed");
        if (document.activeElement === finderInputElement) {
            finderElement.classList.remove('show');
        }
        if (document.activeElement === inputSortElement) {
            console.log("Sort button clicked via Enter");
            sortButtonElement.click();
        }
        return;
    }

    if (event.key === "Escape") {
        if (document.activeElement === finderInputElement) {
            finderElement.classList.remove('show');
            isSearching = false;
            finderInputElement.value = "";
            for (const activityElement of document.querySelectorAll('.activity')) {
                activityElement.classList.remove('gray');
            }
        }
        return;
    }

    if (event.shiftKey && event.key === "!") {
        console.log("Shift + F pressed");
        event.preventDefault(); // Prevent default shfit + F
        finderElement.classList.toggle('show');
        finderInputElement.focus();
        isSearching = true;
        console.log("FinderInputElement focused");
        return;
    }
});

function isSubset(setA, setB) {
    return [...setA].every(item => setB.has(item));
}

function isNullish(value) {
    if (value === "null" || value === null || value === "NaN" || value === undefined) {
        return true;
    }
    return false;
}

function getStringFromStorage(key, defaultValue='') {
    let value = localStorage.getItem(key);
    if (isNullish(value)) {
        return defaultValue;
    }
    return value;
}
function range(start, end) {
    return Array.from({ length: end - start }, (_, i) => i + start);
}
function renderGraphs(meta) {
    clearTimeout(updateGraphsIntervalId)
    console.time("renderGraphs");
    renderStdDeviationGraph(meta.std_deviation);
    renderMeanGraph(meta.mean_fitness);
    renderBestFitnessGraph(meta.best_fitness);
    console.timeEnd("renderGraphs");
}
function graphsAreRendered() {
    if (stdCanvas && stdCanvas.data && stdCanvas.data.datasets) {
        return true;
    }
    return false;
}
function updateGraph(yValues, graph) {
    const xValues = range(0, yValues.length);
    graph.data.labels = xValues;
    graph.data.datasets[0].data = yValues;

    const dataMin = Math.min(...yValues);
    const dataMax = Math.max(...yValues);
    const padding = (dataMax - dataMin) * 0.1; // 10% of the range
    graph.options.scales.y = {
        min: dataMin - padding,
        max: dataMax + padding,
        ticks: {
            callback: function (value, index, values) {
                // Hide first (bottom) and last (top) tick
                if (index === 0 || index === values.length - 1) {
                    return ''; // Return empty string to hide the tick label
                }
                return value; // Show other tick values normally
            }
            }
    }
    graph.options.scales.x = {
        min: 0,
        max: yValues.length,
    }

    graph.update();
}
function updateGraphs(meta) {
    console.log("Updating graphs with meta:", meta);
    console.log("loadedOutputPath", loadedOutputPath);
    console.log("menuOutputPath", menuOutputPath);
    console.time("updateGraphs");
    if (meta.std_deviation && meta.std_deviation.length === 0) {
        console.log("No std_deviation data in meta, skipping graph update");
        return;
    }
    if (!graphsAreRendered()) {
        console.log("Graphs are not rendered, rendering...");
        renderGraphs(meta);
        return;
    }
    updateGraph(meta.std_deviation, stdCanvas);
    updateGraph(meta.mean_fitness, meanCanvas);
    updateGraph(meta.best_fitness, bestFitnessCanvas);
    console.timeEnd("updateGraphs");
}
function createGraph(xValues, yValues, canvas, label, color) {
    const data = {
        labels: xValues,
        datasets: [{
            label: label,
            data: yValues,
            borderColor: color,
            borderWidth: 2,
            fill: false,
            tension: 0.4,          // for smooth curves
            pointRadius: 0,        // removes the dots
            pointHoverRadius: 0,
        }]
    };
    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: false,
            maintainAspectRatio: true,
        }
    };
    return new Chart(canvas, config)
}
function createGraphCanvas(id) {
    const canvas = document.getElementById(id);
    return canvas
}
function renderStdDeviationGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('std-deviation-canvas');
    const colorBlue = getComputedStyle(document.documentElement).getPropertyValue('--color-blue').trim() || 'blue';
    stdCanvas = createGraph(xValues, yValues, canvas, 'Standard deviation', colorBlue);
}
function renderBestFitnessGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('best-fitness-canvas');
    const colorRed = getComputedStyle(document.documentElement).getPropertyValue('--color-red').trim() || 'red';
    bestFitnessCanvas = createGraph(xValues, yValues, canvas, 'Best fitness', colorRed);
}
function renderMeanGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('mean-canvas');
    const colorGreen = getComputedStyle(document.documentElement).getPropertyValue('--color-green').trim() || 'green';
    meanCanvas = createGraph(xValues, yValues, canvas, 'Mean fitness', colorGreen);
}
function getFloatFromStorage(key, defaultValue=0) {
    let value = localStorage.getItem(key);
    if (isNullish(value)) {
        return defaultValue;
    }
    return parseFloat(value);
}

const menu = document.getElementById('menu');
const menuButton = document.getElementById('menu-button');
menuButton.addEventListener('click', async () => {
    await loadSolutionsInMenu(selectedOptScenarioId);
});

const menuGraph = document.getElementById('menu-graph');
const optScenarioSelectElement = document.getElementById('select-opt-scenario');
const runButtonElement = document.getElementById('run-button');
const selectAllElement = document.getElementById('select-all');
const generationsFieldsetElement = document.getElementById('generations-fieldset');
const progress = document.getElementById('progress');

const activityResourceSpacing = parseFloat(
    rootStyles.getPropertyValue('--activity-resource-spacing')
);
let horizontalLines = [];
let useAnimation = getBoolFromStorage('useAnimation', true);
const defaultDrawInterval = 3000;
let solutionDrawInterval = getFloatFromStorage('solutionDrawInterval', defaultDrawInterval);
const autoCheckSolutions = true;

let animationDuration = getFloatFromStorage(
    "animationDuration",
    parseFloat(rootStyles.getPropertyValue('--animation-duration'))
);
const chart = document.querySelector('.chart');
const gantt = document.getElementById('gantt');
const observer = new IntersectionObserver((entries) => {
    let visibleFlights = [];
    let visibleStartDate = null;
    let visibleEndDate = null;

    entries.forEach(entry => {
        const el = entry.target;

        if (entry.isIntersecting) {
            // Element is visible
            el.style.visibility = 'visible';
            el.dataset.isVisible = 'true';

            // Track visible flights
            if (el.classList.contains('flight')) {
                const flightId = getFlightId(el);
                const flight = loadedActivities[flightId];
                visibleFlights.push(flight);

                // Update visible date range
                const flightStart = flight.start;
                const flightEnd = flight.end;
                if (!visibleStartDate || flightStart < visibleStartDate) {
                    visibleStartDate = flightStart;
                }
                if (!visibleEndDate || flightEnd > visibleEndDate) {
                    visibleEndDate = flightEnd;
                }
            }
        } else {
            // Element is not visible
            el.style.visibility = 'hidden';
            el.dataset.isVisible = 'false';
        }
    });

    // Update the scale and visible range
    if (visibleStartDate && visibleEndDate) {
        updateVisibleRange(visibleStartDate, visibleEndDate, visibleFlights);
    }
}, {
    root: gantt, // Observe within the chart container
    rootMargin: '100px 0px', // Preload slightly before visible
    threshold: 0.1 // Trigger when 10% of the element is visible
});
const aircraftColumn = document.getElementById('aircraft-column');
const aircraftView = document.getElementById('aircraft-view');

const useAnimationElement = document.getElementById('select-animation');
useAnimationElement.checked = useAnimation;
const animationDurationElement = document.getElementById('animation-duration');
const animationDurationValueElement = document.getElementById('animation-duration-value');
setAnimationDuration(animationDuration);

const animationIntervalElement = document.getElementById('animation-interval');
const animationIntervalValueElement = document.getElementById('animation-interval-value');
setAnimationInterval(solutionDrawInterval / 1000);

const selectLiveElement = document.getElementById('select-live');
if (liveModeIsOn) {
    selectLiveElement.checked = true;
} else {
    selectLiveElement.checked = false;
}

function setAnimationDuration(seconds) {
    animationDuration = seconds;
    localStorage.setItem('animationDuration', animationDuration);
    animationDurationElement.value = animationDuration;
    animationDurationValueElement.textContent = `${animationDuration}s`;
    document.documentElement.style.setProperty('--animation-duration', `${animationDuration}s`);
}

function setAnimationInterval(seconds) {
    setSolutionDrawInterval(seconds * 1000);
    animationIntervalElement.value = seconds;
    animationIntervalValueElement.textContent = `${seconds}s`;
}

function turnOffLiveMode() {
    liveModeIsOn = false;
    localStorage.setItem('liveModeIsOn', liveModeIsOn);
    if (isLive) {
        stopLive();
    }
}

async function turnOnLiveMode() {
    liveModeIsOn = true;
    localStorage.setItem('liveModeIsOn', liveModeIsOn);
    console.log("Turned on Live mode")
    startLive();
}

function getBoolFromStorage(key, defaultValue=false) {
    let value = localStorage.getItem(key);
    if (isNullish(value)) {
        return defaultValue;
    }
    return value === 'true';
}
selectLiveElement.addEventListener('change', async (event) => {
    if (!event.target.checked) {
        turnOffLiveMode();
        return;
    }
    turnOnLiveMode();
});

async function stopLive() {
    isLive = false;
    clearInterval(liveIntervalId);
    clearInterval(updateGraphsIntervalId);
    if (!isRunning) {
        stopBlinking();
    }
    console.log("Stopped live mode");
}
async function startLive() {
    console.log('Starting live mode...');
    if (isLive) {
        console.log('Already live');
    }
    isLive = true;
    startBlinking();
    clearInterval(liveIntervalId)
    await live();
    liveIntervalId = setInterval(async () => {
        await live();
    }, liveInterval);
    console.log('Started live mode');
}

// Start live mode with a delay in milliseconds
async function startLiveAfter(delay) {
    setTimeout(async () => {
        await startLive();
    }, delay);
}

function setSolutionDrawInterval(milliseconds) {
    solutionDrawInterval = milliseconds;
    localStorage.setItem('solutionDrawInterval', solutionDrawInterval);
    console.log('solutionDrawInterval set to:', solutionDrawInterval);
}

animationIntervalElement.addEventListener('input', (event) => {
    const seconds = parseFloat(event.target.value);
    setAnimationInterval(seconds);

    const animationDurationValue = parseFloat(animationDurationElement.value);
    if (seconds <= animationDurationValue) {
        setAnimationDuration(Number(seconds - 0.1).toFixed(1));
    }
});

animationDurationElement.addEventListener('input', (event) => {
    const seconds = parseFloat(event.target.value); // seconds
    setAnimationDuration(seconds);
    const animationIntervalValue = parseFloat(animationIntervalElement.value);
    if (seconds >= animationIntervalValue) {
        setAnimationInterval(Number((seconds + 0.1).toFixed(1)));
    }
});

useAnimationElement.addEventListener('change', (event) => {
    useAnimation = event.target.checked;
    localStorage.setItem('useAnimation', useAnimation);
});

function toggleMenu() {
    menu.classList.toggle('active');
}

function setProgress(current, total) {
    progress.style.display = 'block';
    progress.current = current;
    progress.total = total;
    progress.textContent = `${progress.current} / ${progress.total}`;
}

function increaseProgress() {
    if (progress.current < progress.total) {
        progress.textContent = `${progress.current} / ${progress.total}`;
        progress.current++;
    } else {
        progress.style.display = 'none';
    }
}
function extractSelectedOutputIds(elem) {
    const outputIds = [];
    const checkboxes = elem.querySelectorAll('input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
        outputIds.push(checkbox.value);
    });
    return outputIds;
}
function createSolutionKeysFromFieldsets(fieldsets) {
    const solutionKeys = [];
    const solKeys = []
    fieldsets.forEach((fieldset, ix) => {
        const genKey = fieldset.genKey;
        console.log("fieldset.genKey", fieldset.genKey);
        const solutionElements = fieldset.querySelectorAll('input[type="checkbox"]:checked');
        if (solutionElements.length === 0) {
            return;
        }
        const solutionIds = Array.from(solutionElements).map(
            checkbox => parseInt(checkbox.value)
        );
        solKeys.push([genKey, solutionIds]);
    });
    solKeys.forEach((solKey) => {
        const [genKey, solutionIds] = solKey;
        solutionIds.forEach((solutionId) => {
            solutionKeys.push([genKey, solutionId]);
        });
    });
    return solutionKeys;
}
function mapGenerationIds2SolutionIds(fieldsets) {
    const generations2Solutions = {};
    fieldsets.forEach((fieldset, ix) => {
        const genKey = fieldset.genKey;
        const solutionElements = fieldset.querySelectorAll('input[type="checkbox"]:checked');
        if (solutionElements.length === 0) {
            return;
        }
        const solutionIds = Array.from(solutionElements).map(
            checkbox => parseInt(checkbox.value)
        );
        generations2Solutions[genKey] = solutionIds;
    });
    return generations2Solutions;
}

async function runSolutions(solutionIds) {
    console.log('Running solutions:', solutionIds);
    const solutionsData = await fetchSolutionsData(solutionIds);
    console.log("solutionsData", solutionsData);
    const solutions = createSolutionsFromData(solutionsData);
    console.log("Solutions loaded:", solutions);
    runQueue.push(...solutions);
}
function setCurrentSolutionId(id) {
    currentSolutionId = id;
    localStorage.setItem('currentSolutionId', currentSolutionId);
    console.log('currentSolutionId set to:', currentSolutionId);
}
const circleElement = document.getElementById('circle');
function toggleColor() {
    if (circleElement.style.backgroundColor === 'transparent') {
        turnOnCircle();
    } else {
        turnOffCircle();
    }
}
function updateRunButton() {
    if (isRunning) {
        runButtonElement.classList.add("stop");
        runButtonElement.textContent = "Stop";
    } else {
        runButtonElement.classList.remove("stop");
        runButtonElement.textContent = "Run";
    }
}
function turnOnCircle() {
    circleElement.style.background = 'linear-gradient(45deg, green, lightgreen)';
    circleElement.style.backgroundColor = 'lightgreen';
}
function turnOffCircle() {
    circleElement.style.background = '';
    circleElement.style.backgroundColor = 'transparent';
}
function startBlinking() {
    if (circleIntervalId) {
        clearInterval(circleIntervalId);
    }
    circleIntervalId = setInterval(toggleColor, 1000);
}
function stopBlinkingAfter(delay) {
    setTimeout(() => {
        stopBlinking();
    }, delay);
}
function stopBlinking() {
    if (!circleIntervalId) {
        return;
    }
    clearInterval(circleIntervalId);
    turnOffCircle();
}
function startRunning() {
    startBlinking();
    isRunning = true;
    updateRunButton();
}
function stopRunning() {
    stopRunningAfter(0);
}
function stopRunningAfter(delay) {
    setTimeout(() => {
        isRunning = false;
        clearTimeouts();
        if (!isLive) {
            stopBlinking();
        }
        updateRunButton();
    }, delay);
}
runButtonElement.addEventListener('click', async (event) => {
    if (!event.target.classList.contains('active')) {
        return;
    }
    if (isRunning) {
        console.log('Run ended by user')
        stopRunning();
        const currentSolution = await fetchAndCreateSolution(currentSolutionId);
        drawSolution(currentSolution);
        return;
    }
    console.log('Run initialized by user...');
    startRunning();
    stopLive();
    const outputFileIds = extractSelectedOutputIds(generationsFieldsetElement);
    console.log('outputFileIds', outputFileIds);
    if (outputFileIds.length === 0) {
        console.log('No generations/solutions selected');
        return;
    }
    const firstOutputFileId = outputFileIds[0];
    console.log('selectedDirectory', selectedDirectory);
    console.log('loadedDirectory', loadedDirectory);
    if (selectedDirectory !== loadedDirectory) {
        await load(selectedDirectory);
    }
    const solutionsData = await fetchSolutionsData(outputFileIds);
    console.log("solutionsData", solutionsData);
    const solutions = createSolutionsFromData(solutionsData);
    const numSolutionsSelected = solutions.length;
    console.log("solutions", solutions);
    const numSolutions = solutions.length;
    console.log("Solutions loaded:", solutions);
    const firstSolution = solutions[0];
    drawSolution(firstSolution);
    previousSolutionTimestamp = performance.now();
    setActiveOutputInMenu(firstSolution.outputId);
    updateInfo(loadedOptScenarioId, firstOutputFileId, firstSolution);
    runQueue = [];
    runQueue.push(...solutions.slice(1));
    setProgress(1, numSolutionsSelected);
    if (liveModeIsOn) {
        await startLive();
    }
    await processQueue();

});
async function fetchAndCreateSolution(solutionId) {
    const solutionData = await fetchSolutionData(solutionId);
    return createSolutionFromData(solutionId, solutionData);
}
function createSolutionFromData(solutionId, solutionData) {
    return Solution.from(solutionId, solutionData, loadedActivities, loadedResources);
}
function createSolutionsFromData(solutionsData) {
  const solutions = solutionsData.map(solutionObj => {
    const [solutionId, solutionData] = Object.entries(solutionObj)[0];
    return createSolutionFromData(solutionId, solutionData);
  });
  return solutions;
}
selectAllElement.addEventListener('change', (event) => {
    const checked = event.target.checked;
    const solutionInputs = generationsFieldsetElement.querySelectorAll('input[type="checkbox"]');
    solutionInputs.forEach(checkbox => {
        checkbox.checked = checked;
    });
    if (checked) {
        runButtonElement.classList.add('active');
    } else {
        runButtonElement.classList.remove('active');
    }
});

generationsFieldsetElement.addEventListener('change', (event) => {
    const solutionInputs = generationsFieldsetElement.querySelectorAll('input[type="checkbox"]');
    const checkedSolutions = generationsFieldsetElement.querySelectorAll('input[type="checkbox"]:checked');
    if (checkedSolutions.length === solutionInputs.length) {
        selectAllElement.checked = true;
    } else {
        selectAllElement.checked = false;
    }
    if (checkedSolutions.length >= 2) {
        runButtonElement.classList.add('active');
    } else {
        runButtonElement.classList.remove('active');
    }
});
optScenarioSelectElement.addEventListener('click', async (event) => {
    const directory = event.target.value;
    await loadDirectoriesInMenu(directory);
});
optScenarioSelectElement.addEventListener('change', async (event) => {
    const directory = event.target.value;
    if (directory && directory !== selectedDirectory) {
        setSelectedDirectory(directory);
        loadSolutionsInMenu(directory);
    }
});

function extractSolutionKey(solutionFileName) {
    let [genKey, solKey] = solutionFileName.split('_');
    solKey = solKey.split('.')[0];
    solKey = parseInt(solKey.slice(3)); // Remove "sol" prefix
    return [genKey, solKey];
}
function extractSolutionKeys(solutionFileNames) {
    // E.g. solutionNames = gen0_sol0.json
    const solutionKeys = solutionFileNames.map(solutionFileName => {
        return extractSolutionKey(solutionFileName);
    });
    return solutionKeys;
}

aircraftColumn.addEventListener('scroll', () => {
    gantt.scrollTop = aircraftColumn.scrollTop;
    localStorage.setItem('scrollTop', gantt.scrollTop);
});

function createMaintenanceContent(maintenance) {
    return `
        <div class="left">
            <div>${maintenance.startTimeString()}</div>
        </div>
        <div class="center">
            <div>${maintenance.type}</div>
            <div>${maintenance.station}</div>
        </div>
        <div class="right">
            <div>${maintenance.endTimeString()}</div>
        </div>
    `;
}

// Function to set visibility for elements
function setVisibility(elements, visibilityMap) {
    Object.keys(elements).forEach(key => {
        elements[key].style.display = visibilityMap[key] ? "block" : "none";
    });
}

function updateMaintenanceContent(element, width, height) {
    const elements = {
        maintStart: element.querySelector('.left > div'),
        maintType: element.querySelectorAll('.center > div')[0],
        maintStation: element.querySelectorAll('.center > div')[1],
        maintEnd: element.querySelector('.right > div'),
    };

    // Define layout & visibility rules
    const rules = [
        { width: x110, layout: { flexDirection: "row", justifyContent: "space-between" }, heights: [
            { min: y32, visibility: { maintStart: 1, maintType: 1, maintStation: 1, maintEnd: 1 } },
            { min: y17, visibility: { maintStart: 1, maintType: 1, maintStation: 0, maintEnd: 1 } },
            { min: 0, visibility: { maintStart: 0, maintType: 0, maintStation: 0, maintEnd: 0 } }
        ]},
        { width: x50, layout: { flexDirection: "column", justifyContent: "center" }, heights: [
            { min: y50, visibility: { maintStart: 1, maintType: 1, maintStation: 1, maintEnd: 1 } },
            { min: y41, visibility: { maintStart: 1, maintType: 1, maintStation: 1, maintEnd: 0 } },
            { min: y32, visibility: { maintStart: 0, maintType: 1, maintStation: 1, maintEnd: 0 } },
            { min: y17, visibility: { maintStart: 0, maintType: 1, maintStation: 0, maintEnd: 0 } },
            { min: 0, visibility: { maintStart: 0, maintType: 0, maintStation: 0, maintEnd: 0 } }
        ]},
        { width: x30, layout: { flexDirection: "column", justifyContent: "center" }, heights: [
            { min: y50, visibility: { maintStart: 1, maintType: 0, maintStation: 1, maintEnd: 1 } },
            { min: y41, visibility: { maintStart: 1, maintType: 0, maintStation: 1, maintEnd: 0 } },
            { min: y32, visibility: { maintStart: 0, maintType: 0, maintStation: 1, maintEnd: 0 } },
            { min: y17, visibility: { maintStart: 1, maintType: 0, maintStation: 0, maintEnd: 0 } },
            { min: 0, visibility: { maintStart: 0, maintType: 0, maintStation: 0, maintEnd: 0 } }
        ]}
    ];

    // Apply the first matching rule
    for (const rule of rules) {
        if (width >= rule.width) {
            Object.assign(element.style, rule.layout);
            for (const heightRule of rule.heights) {
                if (height >= heightRule.min) {
                    setVisibility(elements, heightRule.visibility);
                    return;
                }
            }
        }
    }

    // Default case: Hide everything
    setVisibility(elements, { maintStart: 0, maintType: 0, maintStation: 0, maintEnd: 0 });
}

function clearTimeouts() {
    for (let timeoutId of timeoutIds) {
        clearTimeout(timeoutId);  // Cancel each timeout
    }
    timeoutIds = [];   // Clear the list
}

function resource2TopPosition(resourceId) {
    const spacing = activityResourceSpacing / 2;
    if (resourceId === "unassigned") {
        return Object.keys(loadedResources).length * resourceHeight + spacing;
    }
    const ix = getResourceIndex(resourceId);
    return ix * resourceHeight + spacing;
}
function assignMaintenanceElementToResource(element, resource) {
    element.dataset.resourceId = resource.id;
    element.dataset.regno = resource.regno;
    element.style.top = `${resource2TopPosition(resource.id)}px`;
}
function createMaintenanceElement(maint) {
    const maintenanceElement = document.createElement('div');
    maintenanceElement.id = getMaintElemId(maint.id);
    maintenanceElement.dataset.activityType = maint.activityType;
    maintenanceElement.classList.add('activity', 'maintenance');
    const width = duration2Width(maint.duration);
    const height = resourceHeight - activityResourceSpacing;
    maintenanceElement.style.left = `${startTime2Position(maint.start)}px`;
    maintenanceElement.style.width = `${width}px`;
    maintenanceElement.style.height = `${height}px`;
    maintenanceElement.dataset.nextStart = maint.nextStart;
    maintenanceElement.innerHTML = createMaintenanceContent(maint);
    maintenanceElement.keywords = createKeywordsForAllCharsAndSubChars(maint.toKeywords());
    updateMaintenanceContent(maintenanceElement, width, height);
    maintenanceElement.addEventListener("mouseenter", () => {
        maintenanceElement.classList.add("floating-shadow");
        maintenanceElement.title = JSON.stringify(maint, null, 2);
    });
    maintenanceElement.addEventListener("mouseleave", () => {
        maintenanceElement.classList.remove("floating-shadow");
        maintenanceElement.title = "";
    });
    return maintenanceElement;
}

function clearStationLabels() {
    const stationLabels = [...chart.querySelectorAll('.station-label')]; // Convert NodeList to array
    stationLabels.forEach(stationLabel => stationLabel.remove());
}
function createStationLabels(chains) {
    clearStationLabels();
    chains.forEach(chain => {
        createStationLabelElements(chain);
    });
}
function createStationLabelElements(chain) {
    if (chain.resourceId === "unassigned") {
        return;
    }
    chain.setChainDependentValues();
    chain.activities.forEach((activity, ix) => {
        const nextActivitySobt = activity.nextStart;
        const gapDuration = nextActivitySobt - activity.end;
        if (gapDuration) {
            const stationLabelElement = document.createElement('div');
            stationLabelElement.className = 'station-label';
            if (activity instanceof Maintenance) {
                stationLabelElement.id = `station-label-${getMaintElemId(activity.id)}`;
                stationLabelElement.textContent = activity.station;
            } else {
                stationLabelElement.id = `station-label-${getFlightElemId(activity.id)}`;
                stationLabelElement.textContent = activity.ades;
            }
            const resourcePositionTop = resource2TopPosition(chain.resourceId);
            const top = resourcePositionTop + resourceHeight / 2;
            stationLabelElement.style.top = `${top}px`;
            const gapWidth = duration2Width(gapDuration / 1000 / 60);
            if (gapWidth < 30) {
                stationLabelElement.style.display = "none";
            } else {
                const gapHalfDuration = Math.floor(gapDuration / 2);
                const gapHalfTime = new Date(activity.end.getTime() + gapHalfDuration);
                stationLabelElement.style.left = `${startTime2Position(gapHalfTime)}px`;
            }
            chart.appendChild(stationLabelElement);
        }
    });
}
function getSubStringSet(str) {
    const substrings = new Set();
    for (let i = 1; i <= str.length; i++) {
        substrings.add(str.substring(0, i));
    }
    return substrings;
}
function assignFlightElementToResource(element, resource) {
    element.dataset.resourceId = resource.id;
    let regno = resource.regno || resource.custom_fields.regno;
    element.regno = regno;
    element.style.top = `${resource2TopPosition(resource.id)}px`;
    if (regno) {
        element.keywords.add(getSubStringSet(regno.toLowerCase()));
    }
}
function createFlightElement(flight) {
    const flightElement = document.createElement('div');
    flightElement.id = getFlightElemId(flight.id);
    flightElement.dataset.activityType = flight.activityType;
    flightElement.dataset.nextStart = flight.nextStart;
    flightElement.dataset.nextId = flight.nextId;
    flightElement.dataset.prevId = flight.prevId;
    flightElement.dataset.prevSibt = flight.prevSibt;
    if (flight.serviceType) {
        flightElement.dataset.serviceType = flight.serviceType;
    }
    flightElement.className = 'activity flight';
    flightElement.style.left = `${startTime2Position(flight.start)}px`;
    const width = duration2Width(flight.duration);
    flightElement.style.width = `${width}px`;
    const height = resourceHeight - activityResourceSpacing;
    flightElement.style.height = `${height}px`;
    flightElement.dataset.start = flight.start;
    flightElement.dataset.end = flight.end;
    flightElement.dataset.adep = flight.adep;
    flightElement.dataset.ades = flight.ades;
    if (typeof flight.seqnum === "number")  {
        flightElement.dataset.seqnum = flight.seqnum;
    }
    if (typeof flight.multilegId === "number" || typeof flight.multilegId === "string") {
        flightElement.dataset.multilegId = flight.multilegId;
        flightElement.classList.add('multileg');
    }
    flightElement.innerHTML = createFlightContent(flight);

    flightElement.keywords = createKeywordsForAllCharsAndSubChars(
        flight.toKeywords()
    );
    updateFlightContent(flightElement, width, height);

    flightElement.addEventListener("mouseenter", () => {
        flightElement.classList.add("floating-shadow");
        flightElement.title = JSON.stringify(flight, null, 2);
    });

    flightElement.addEventListener("mouseleave", () => {
        flightElement.classList.remove("floating-shadow");
        flightElement.title = "";
    });
    return flightElement;
}
function mapActivityIds2ResourceIds(solution) {
    const activityIdsToResourceIds = {};
    // Loop through the chains property of the solution
    for (const chain of solution.chains) {
        chain.activities.forEach(activity => {
            if (activity instanceof Maintenance) {
                return;
            }
            activityIdsToResourceIds[activity.id] = chain.resourceId; // Map activity ID to resource ID
        });
    }
    return activityIdsToResourceIds;
}
function getActivityById(activityId, activities) {
    const activity = activities[activityId];
    if (!activity) {
        console.error('Activity not found:', activityId);
        return null;
    }
    return activity;
}
function getResourceIndex(resourceId) {
    const index = sortedResourceIds2Index.get(String(resourceId));
    if (index === undefined) {
        console.trace('Resource index not found for resourceId:', resourceId);
        return -1;
    }
    return index;
}
function getResource(resourceId, resources) {
    if (resourceId === "unassigned") {
        return unassignedResource;
    }
    const resource = resources[resourceId];
    if (!resource) {
        console.trace('Resource not found:', resourceId, "returning unassignedResource");
        return unassignedResource;
    }
    if (resource.id === undefined) {
        resource.id = resourceId;
    }
    return resource;
}
function assign(activityElement, resource) {
    const resourceId = resource.id;
    const currentResourceId = activityElement.dataset.resourceId;
    const currentRegno = activityElement.regno;
    if (!currentRegno === "UNASSIGNED") {
        for (let i = 0; i < currentRegno.length; i++) {
            const word = currentRegno.slice(0, i + 1);
            activityElement.keywords.delete(word);
        }
    }
    assignFlightElementToResource(activityElement, resource);
    if (useAnimation) {
        activityElement.classList.toggle('animate');
    }
    if (useAnimation) {
        setTimeout(() => {
            activityElement.classList.toggle('animate');
        }, animationDuration * 1000);
    }
    if (resourceId === "unassigned") {
        numDrawnInUnassigned++;
        return;
    }
    if (currentResourceId === "unassigned") {
        numDrawnInUnassigned--;
    }
}

function replaceCurrentSolution(newSolution) {
    console.log('Replacing current solution with:', newSolution);
    const flightIds2ResourceIds = mapActivityIds2ResourceIds(newSolution);
    for (const flightId in flightIds2ResourceIds) {
        const flight = loadedActivities[flightId];
        let flightElement = getFlightElement(flight.id);
        if (isNullish(flightElement)) {
            flightElement = createFlightElement(flight, "unassigned");
            const unassignedResource = getResource("unassigned", loadedResources);
            assignFlightElementToResource(flightElement, unassignedResource);
            chart.appendChild(flightElement);
            console.info('Created new flight element due to not found on the gantt:', flightId);
        }
        const resourceId = flightIds2ResourceIds[flightId];
        const resource = getResource(resourceId, loadedResources);
        const currentResourceId = flightElement.dataset.resourceId;
        if (resourceId === currentResourceId) {
            continue;
        }
        assign(flightElement, resource);
        if (resourceId === "unassigned" && numDrawnInUnassigned > numUnassignedThreshold) {
            setTimeout(() => {
                activityElement.remove();
            }
            , animationDuration * 1000);
        }
    };
    for (const rotationId in loadedRotations) {
        const rotation = loadedRotations[rotationId];
        let rotationElement = document.getElementById(`rotation-${rotationId}`);
        if (isNullish(rotationElement)) {
            console.log('Rotation element not found on the gantt:', rotationId);
            continue;
        }
        const firstActivity = rotation.first();
        const firstActivityElement = getFlightElement(firstActivity.id)
        if (isNullish(firstActivityElement)) {
            console.log("Could not find flight:", firstActivity.id)
        }
        const resourceId = firstActivityElement.dataset.resourceId;
        rotationElement.dataset.resourceId = resourceId;
        if (useAnimation) {
            rotationElement.classList.add('animate');
            setTimeout(() => {
                rotationElement.classList.remove('animate');
            }, animationDuration * 1000);
        }
        rotationElement.style.top = `${resource2TopPosition(resourceId)}px`;
    }
}

function drawHorizontalLines(count) {
    horizontalLines = [];
    for (let i = 0; i < count + 1; i++) {
        const horizontalLine = document.createElement('div');
        horizontalLine.className = 'horizontal-line';
        horizontalLine.style.top = `${i * resourceHeight}px`;
        chart.appendChild(horizontalLine);
        horizontalLines.push(horizontalLine);
    }
}

class Resource {
    constructor(inData) {
        assertRequiredFields(inData, ['id']);
        Object.assign(this, inData);
        this.regno = inData.regno || inData.custom_fields?.regno;
    }
    static default(inData = {}) {
        const data = { ...inData };
        return new Resource({
            id: data.id ?? "0",
            type: data.type ?? "A320",
            regno: data.regno ?? "AAAAA",
            last_known_station: data.last_known_station ?? "DEL",
        });
    }
    static fromData(data) {
        const resourcesData = JSON.parse(JSON.stringify(data));
        const resources = {};
        for (const [ix, resource] of resourcesData.entries()) {
            if (isNullish(resource.id)) {
                resource.id = ix;
            }
            resources[resource.id] = new Resource(resource);
        }
        return resources;
    }
}

class Chain {
    constructor(resourceId, activities = []) {
        this.resourceId = resourceId;
        this.activities = activities;
    }
    getFirstActivity() {
        return this.activities[0];
    }
    getLast() {
        return this.activities[this.activities.length - 1];
    }
    setChainDependentValues() {
        if (this.resourceId === "unassigned") {
            return;
        }
        for (let i = 0; i < this.activities.length - 1; i++) {
            const currentActivity = this.activities[i];
            const nextActivity = this.activities[i + 1];
            currentActivity.nextStart = nextActivity.start;
            currentActivity.nextId = nextActivity.id;
            nextActivity.prevSibt = currentActivity.end;
            nextActivity.prevId = currentActivity.id;
            if (currentActivity.resourceId !== "unassigned") {
                if (currentActivity.end > nextActivity.start) {
                    console.warn('Overlapping activities:', currentActivity, nextActivity);
                }
            }
        }
    }
    addActivity(activity) {
        // Insert the activity into the chain, maintaining sorted order by start
        if (!activity) {
            console.trace("ACTIVITY TO ADD:", activity);
        }
        let index = this.activities.findIndex(listActivity => listActivity.start > activity.start);

        // If no such activity exists, push to the end
        if (index === -1) {
            this.activities.push(activity);
        } else {
            // Otherwise, insert at the correct position
            this.activities.splice(index, 0, activity);
        }
    }
}
function getTimeString(time) {
    let hours = time.getUTCHours();
    hours = String(hours).padStart(2, '0');
    let minutes = time.getUTCMinutes();
    minutes = String(minutes).padStart(2, '0');
    return `${hours}:${minutes}`;
}
function createKeywordsForAllCharsAndSubChars(keywords) {
    const newKeywords = new Set(keywords); // Clone the original set

    for (const keyword of keywords) { // Loop through each word in the set
        for (let i = 0; i < keyword.length; i++) {
            const subKeyword = keyword.slice(0, i + 1); // Get prefix
            newKeywords.add(subKeyword); // Add prefix to set
        }
    }

    return newKeywords;
}
function assertRequiredFields(obj, requiredKeys) {
    for (const key of requiredKeys) {
        if (obj[key] === undefined || obj[key] === null) {
        throw new Error(`Missing required field: "${key}"`);
        }
    }
}
class Activity {
    constructor(inData) {
        assertRequiredFields(inData, ['id', 'start', 'end']);
        const data = { ...inData };
        this.data = data;
        this.id = data.id;
        this.start = new Date(data.start + "Z");
        this.end = new Date(data.end + "Z");
        this.rotationId = data.rotation_id;
        this.plannedActype = data.planned_actype;
        this.serviceType = data.service_type;
        this.seqnum = data.seqnum;
        this.fl_num = data.fl_num;
        this.adep = data.adep;
        this.ades = data.ades;
        this.duration = Math.floor((this.end - this.start) / (1000 * 60)); // In minutes
    };
    startTimeString() {
        return getTimeString(this.start);
    }
    endTimeString() {
        return getTimeString(this.end);
    }
    toKeywords() {
        return  new Set([
            `id-${this.id}`,
            this.startTimeString(),
            this.endTimeString(),
        ]);
    }
    static default(inData = {}) {
        const data = { ...inData };
        data.id = data.id ?? 0;
        data.start = data.start ?? "2025-01-01T00:00:00";
        data.end = data.end ?? "2025-01-01T01:00:00";
        return new Activity(data);
    }
};

class Maintenance extends Activity {
    constructor(inData) {
        assertRequiredFields(inData, ['id', 'start', 'end', 'station', 'aircraft_id']);
        const data = { ...inData };
        super(data);
        this.activityType = "maintenance"
        this.station = data.station;
        this.type = data.type || data.custom_fields?.type || "AOG";
        this.aircraftId = data.aircraft_id ?? data.ac;
    }
    static default(inData = {}) {
        const data = { ...inData };
        return new Maintenance({
            id: data.id ?? "0",
            ac: data.ac ?? "AAAAA",
            aircraft_id: data.aircraft_id ?? "AAAAA",
            type: data.type ?? "AOG",
            station: data.station ?? "ARN",
            start: data.start ?? "2025-01-01T00:00:00",
            end: data.end ?? "2025-01-01T01:00:00",
            regno: data.regno || data.customFields?.regno,
        });
    }
    toKeywords() {
        const activityKeywords = super.toKeywords();
        activityKeywords.add(String(this.aircraftId).toLowerCase());
        activityKeywords.add(this.type.toLowerCase());
        activityKeywords.add(this.station.toLowerCase());
        return activityKeywords;
    }
    static fromData(data) {
        if (!data) {
            return {};
        }
        const maintenancesData = JSON.parse(JSON.stringify(data));
        const maintenances = {};
        for (const [ix, maintenance] of maintenancesData.entries()) {
            if (isNullish(maintenance.id)) {
                console.log('Assigning id to maintenance:', ix);
                maintenance.id = ix;
            }
            maintenances[maintenance.id] = new Maintenance(maintenance);
        }
        return maintenances;
    }
}
class Flight extends Activity {
    constructor(inData) {
        assertRequiredFields(inData, [
            'id',
            'start',
            'end',
            'adep',
            'ades',
            'planned_actype',
        ]);
        const data = { ...inData };
        super(data);
        this.activityType = "flight";
        this.adep = data.adep;
        this.ades = data.ades;
        this.plannedActype = data.planned_actype;
        this.route = data.route;
        this.regno = data.regno;
        this.aircraftId = data.aircraft_id;
        this.fl_num = data.fl_num ?? data.custom_fields.fl_num;
        this.multilegId = data.multileg_id;
        this.customFields = data.custom_fields || {};
    }
    toKeywords() {
        const activityKeywords = super.toKeywords();
        activityKeywords.add(this.adep.toLowerCase());
        activityKeywords.add(this.ades.toLowerCase());
        activityKeywords.add(this.plannedActype.toLowerCase());
        Object.entries(this.customFields).forEach(([key, value]) => {
            if (key === "fl_num") {
                activityKeywords.add(value);
            }
        });
        return activityKeywords;
    }
    static default(inData) {
        const data = { ...inData };
        return new Flight({
            id: data.id ?? "0",
            fl_num: data.fl_num ?? "0",
            adep: data.adep ?? "DEL",
            ades: data.ades ?? "BOM",
            planned_actype: data.planned_actype ?? "A320",
            start: data.start ?? "2025-01-01T00:00:00",
            end: data.end ?? "2025-01-01T01:00:00",
            seqnum: data.seqnum,
            multileg_id: data.multileg_id,
        });
    }
    static fromData(data) {
        const activitiesData = JSON.parse(JSON.stringify(data));
        const activities = {};
        console.log('activitiesData', activitiesData);
        for (const [ix, activityData] of activitiesData.entries()) {
            if (isNullish(activityData.id)) {
                console.log('Assigning id to activityData:', ix);
                activityData.id = ix;
            }
            activities[activityData.id] = new Flight(activityData);
        }
        return activities;
    }
};
class Solution {
    constructor(outputId, chains, kpis = {}) {
        this.outputId = outputId;
        this.cost = cost;
        this.chains = chains;
        this.kpis = kpis;
    }
    unassignedChain() {
        return this.chains[this.chains.length - 1];
    }
    static from(outputId, solutionData, activities, resources) {
        const resourceIds = solutionData[0];
        const solutionCost = solutionData[1];
        const chains = [];
        for (const resourceId in resourceIds) {
            const resource = resources[resourceId];
            const chain = new Chain(resourceId);
            const activityIds = resourceIds[resourceId];
            for (const activityId of activityIds) {
                const activity = activities[activityId];
                chain.addActivity(activity);
            }
            if (resourceId !== "unassigned") {
                let maintenances = loadedResourceId2Maintenances[resource.id];
                if (maintenances) {
                    maintenances.forEach(maintenance => {
                        chain.addActivity(maintenance);
                    });
                }
            }
            chain.setChainDependentValues();
            chains.push(chain);
        };
        const solution = createSolution(outputId, solutionData, loadedResources, loadedActivities);
        return solution;
    }
}
function createKpiRow(key, value) {
    const row = document.createElement('tr');
    const cell1 = document.createElement('td');
    cell1.innerText = key;
    row.appendChild(cell1);

    const cellWithSemicolon = document.createElement('td');
    cellWithSemicolon.innerText = ":";
    row.appendChild(cellWithSemicolon)

    const cell2 = document.createElement('td');
    cell2.innerText = value;
    if (typeof value === "number") {
        cell2.classList.add('number');
    }
    row.appendChild(cell2);
    return row;
}

function replaceKpis(kpis) {
    console.log("replaceKpis", kpis);
    const tbody = kpiTableElement.querySelector('tbody');
    tbody.innerHTML = '';
    for (const [key, value] of Object.entries(kpis)) {
        const row = createKpiRow(key, value);
        tbody.appendChild(row);
    }
}
let selectedSolutionIdForReport;
let selectedReportOptScenarioId;
let selectedOptRunForReport;
function solutionId2RunDirectory(solutionId) {
    const parts = solutionId.split('/');
    parts.pop();
    return parts.join('/');
}
function solutionId2FileName(solutionId) {
    const parts = solutionId.split('/');
    return parts.pop();
}
function generateReportUrl(reportType, format, solutionId) {
    const runDirectory = solutionId2RunDirectory(solutionId);
    const fileName = solutionId2FileName(solutionId);
    const url = `/opt/directories/${runDirectory}/${fileName}/reports/?&report=${reportType}_${format}`;
    console.log("Generated report URL:", url);
    return url;
}
function updateReportAnchors(solutionId) {
    const reportAnchorElements = reportMenuElement.querySelectorAll('a');
    reportAnchorElements.forEach(anchor => {
        const reportType = anchor.dataset.reportType;
        const format = anchor.dataset.format;
        anchor.href = generateReportUrl(reportType, format, solutionId);
    });
}
reportIconElement.addEventListener('click', async () => {
    console.log("Clicked report icon for solutionId:", loadedSolutionId);
    reportMenuElement.classList.toggle("show");
    if (!loadedSolutionId) {
        return;
    }
    updateReportAnchors(loadedSolutionId);
});
kpisIconElement.addEventListener('click', async (event) => {
    console.log("Clicked KPIs for solutionId:", loadedSolutionId);
    kpiMenuElement.classList.toggle("show");
    if (!loadedSolutionId) {
        return;
    }
    const solutionData = await fetchSolution(loadedSolutionId);
    replaceKpis(solutionData.kpis);
});

function createOutputFileLabel(outputFile, name = null) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'solution';
    input.value = outputFile.id;
    input.checked = autoCheckSolutions;
    const label = document.createElement('label');
    label.appendChild(input);
    label.appendChild(document.createTextNode(name ?? outputFile.id));
    return label;
}
function createOutputFileLabel2(filename, name = null) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'solution';
    input.value = filename;
    input.checked = autoCheckSolutions;
    const label = document.createElement('label');
    label.appendChild(input);
    label.appendChild(document.createTextNode(name ?? filename));
    return label;
}
function createSolutionDiv(directory, solutionId) {
    const div = document.createElement('div');
    div.classList.add('solution-menu');
    const filename = solutionId.split('/').pop();
    div.appendChild(createOutputFileLabel2(solutionId, filename));

    div.dataset.directory = directory;
    div.dataset.solutionId = solutionId;
    div.addEventListener('click', async (event) => {
        // Ensure only clicks directly on the div, not on children
        if (event.target !== event.currentTarget) return;

        // Check for Ctrl (Windows/Linux) or Meta (Cmd on macOS)
        if (event.ctrlKey || event.metaKey) {
            const div = event.currentTarget;
            div.classList.toggle('selected');
            const solutionId = div.dataset.solutionId;
            if (div.classList.contains('selected')) {
                selectedSolutionIds.push(solutionId);
            } else {
                let indexToRemove = selectedSolutionIds.findIndex(id => id === solutionId);
                if (indexToRemove !== -1) {
                    selectedSolutionIds.splice(indexToRemove, 1);
                }
            }
            setMarkedSolutionsInStorage();
            return;
        }

        // Regular click behavior
        stopRunning();
        stopLive();
        const directory = event.currentTarget.dataset.directory;
        const solutionId = event.currentTarget.dataset.solutionId;

        console.log("Clicked on solutionId:", solutionId);

        if (loadedDirectory !== directory) {
            await load(directory);
        }

        const solutionData = await fetchSolution(solutionId);
        const meta = await fetchRunSummary(directory);
        if (meta) {
            console.log("UPDATING GRAPHS with run summary meta:", meta);
            updateGraphs(meta);
        }
        const solution = createSolution(solutionId, solutionData, loadedResources, loadedActivities);

        replaceKpis(solutionData.kpis);
        generateTimeRuler();
        drawSolution(solution);
        setActiveSolutionInMenu(solutionId);
        setLoadedSolutionId(solutionId);
        updateReportAnchors(solutionId);
        if (liveModeIsOn) {
            await startLive();
        }
    });

    return div;
}
function updateSolutionsFieldset(outputFiles, selectOutputId = null) {
    console.log('Updating generations fieldset:', outputFiles);
    generationsFieldsetElement.innerHTML = `
        <legend>Solutions</legend>
    `;
    for (const [ix, outputFile] of outputFiles.entries()) {
        const div = createOutputFileDiv(outputFile, ix);
        if (selectOutputId && outputFile.id === selectOutputId) {
            div.classList.add('active');
        }
        generationsFieldsetElement.appendChild(div);
    }
}
function addSolutions2Fieldset(solutionIds) {
    for (const solutionId of solutionIds) {
        const div = createSolutionDiv(selectedDirectory, solutionId);
        generationsFieldsetElement.appendChild(div);
    }
}
function updateSolutionsFieldset2(solutionIds, selectSolutionId = null) {
    console.log('Updating generations fieldset:', solutionIds);
    generationsFieldsetElement.innerHTML = `
        <legend>Solutions</legend>
    `;
    for (const [ix, solutionId] of solutionIds.entries()) {
        const div = createSolutionDiv(selectedDirectory, solutionId);
        if (selectSolutionId && solutionId === selectSolutionId) {
            div.classList.add('active');
        }
        generationsFieldsetElement.appendChild(div);
    }
}
function createSolution(outputId, data, resources, activities) {
    const chainData = data.chains;
    const kpis = data.kpis;
    const chains = [];
    console.log("Chain data:", chainData);
    for (const [resourceId, activityIds] of Object.entries(chainData)) {
        const resource = getResource(resourceId, resources);
        const chain = new Chain(resourceId);
        for (const activityId of activityIds) {
            const activity = activities[activityId];
            chain.addActivity(activity);
        }
        if (resourceId !== "unassigned") {
            let maintenances = loadedResourceId2Maintenances[resource.id];
            if (maintenances) {
                maintenances.forEach(maintenance => {
                    chain.addActivity(maintenance);
                });
            }
        }
        chain.setChainDependentValues();
        chains.push(chain);
    };
    console.log("chains created:", chains);
    const solution = new Solution(
        outputId,
        chains,
        kpis,
    );
    return solution;
}
function idMap(items) {
    const map = {};
    for (const item of items) {
        map[item.id] = item;
    }
    return map;
}
function setSelectedOutputId(outputId) {
    selectedOutputId = outputId;
    localStorage.setItem('selectedOutputId', selectedOutputId);
    console.log("selectedOutputId set to:", selectedOutputId);
}
function setSelectedOptScenarioId(optScenarioId) {
    selectedOptScenarioId = optScenarioId;
    localStorage.setItem('selectedOptScenarioId', selectedOptScenarioId);
    console.log("selectedOptScenarioId set to:", selectedOptScenarioId);
}
async function loadOptScenariosInMenu(id) {
    console.log('Loading outputs in menu, id:', id);
    const optScenarios = await fetchOptScenarios();
    optScenarioSelectElement.innerHTML = '';
    optScenarios.sort((a, b) => a.name.localeCompare(b.name));
    for (const scenario of optScenarios) {
        const option = document.createElement('option');
        if (scenario.id == id) {
            option.selected = true;
            setSelectedOptScenarioId(id);
        }
        option.value = scenario.id;
        option.textContent = scenario.id + " " + scenario.name;
        optScenarioSelectElement.appendChild(option);
    }
}
async function loadSolutionsInMenu(dir, selectsolutionId = null) {
    console.log('Loading solutions in menu, dir:', dir);
    loadedSolutionIds.clear();
    const solutionIds = await fetchSolutions(dir);
    solutionIds.sort((a, b) => {
        const [, genA] = a.match(/step(\d+)(?:_sol\d+)?\.json/);
        const [, genB] = b.match(/step(\d+)(?:_sol\d+)?\.json/);
        const gA = Number(genA);
        const gB = Number(genB);
        if (gA !== gB) {
            return gA - gB;
        }
        return Number(solA) - Number(solB);
    });
    console.log('Fetched solution IDs:', solutionIds);
    updateSolutionsFieldset2(solutionIds, selectsolutionId);
    if (selectsolutionId) {
        setSelectedSolutionId(selectsolutionId);
    }
    let meta = await fetchRunSummary(dir);
    if (!meta) {
        console.log("No run summary found for scenario:", dir, ". Maybe no runs yet?");
        let meta = await fetchMeta3(dir);
        if (!meta) {
            console.log("No meta3 or run summary found for scenario:", dir, ". Maybe no runs yet?");
            return;
        }
        console.log("Fetched meta3 for scenario:", dir, meta);
    }
    loadedMeta = { ...meta };
    for (const id of solutionIds) {
        loadedSolutionIds.add(id);
    }
    updateGraphs(meta);
    console.log("Loaded solutions in menu:", solutionIds);
};
async function fetchSolution(solutionId) {
    const data = await fetchGet(`/opt/directories/${solutionId}`);
    return data;
}
async function loadDirectoriesInMenu(dir) {
    console.log('Loading directories in menu, dir:', dir);
    const directories = await fetchDirectories();
    console.log('Fetched directories:', directories);
    optScenarioSelectElement.innerHTML = '';
    directories.sort((a, b) => b.localeCompare(a));
    for (const directory of directories) {
        const option = document.createElement('option');
        if (directory == dir) {
            option.selected = true;
            setSelectedDirectory(dir);
        }
        option.value = directory;
        option.textContent = directory;
        optScenarioSelectElement.appendChild(option);
    }
}
async function fetchSolutions(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/solutions/`);
    return data['solutions'];
}
async function fetchInput(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/input.json`);
    return data;
}
async function fetchUserInput(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/user_input.json`);
    return data;
}
async function fetchInputBuilder(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/input_builder.json`);
    return data;
}
async function fetchRunSummary(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/run_summary.json`);
    return data;
}
async function fetchDirectories() {
    const data = await fetchGet('/opt/directories');
    return data['run_directories'];
}
async function fetchGet(url) {
    try {
        console.log('Fetching URL:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log('Fetched successfully on URL:', url);
        return data;
    } catch (error) {
        console.error(`Error fetching data from ${url}:`, error);
    }
}
let selectedDirectory = localStorage.getItem('selectedDirectory') || null;
function setSelectedDirectory(dir) {
    selectedDirectory = dir;
    localStorage.setItem('selectedDirectory', selectedDirectory);
    console.log("selectedDirectory set to:", selectedDirectory);
}
function createAircraftElement(resource) {
    const aircraftElement = document.createElement('div');
    aircraftElement.className = 'aircraft';
    aircraftElement.id = `aircraft-${resource.id}`;
    if (resource.id === "unassigned") {
        aircraftElement.textContent = "UNASSIGNED";
    } else {
        aircraftElement.innerHTML = `
            <div>${resource.id}-${resource.type}-${resource.regno}-${resource.last_known_station}</div>
        `;
    }
    aircraftElement.title = JSON.stringify(resource, null, 2);
    return aircraftElement;
}
function getId(elem) {
    const words = elem.id.split("-");
    if (!words) {
        console.error("Could not find id in", elem.id);
    }
    return words[words.length - 1];
}
function getFlightId(elem) {
    return getId(elem);
}
function getRotationId(elem) {
    return getId(elem);
}
function getMaintId(elem) {
    return getId(elem);
}
function getFlightElemId(id) {
    return `flight-${id}`;
}
function getMaintElemId(id) {
    return `maintenance-${id}`;
}
function getRotationElemId(id) {
    return `rotation-${id}`;
}
function getFlightElement(id) {
    return document.getElementById(getFlightElemId(id));
}
function getRotationElement(id) {
    return document.getElementById(getRotationElemId(id));
}
function getMaintenanceElement(id) {
    return document.getElementById(getMaintElemId(id));
}

function grayAllActivities() {
    for (const activityElem of chart.querySelectorAll('.activity')) {
        activityElem.classList.add("gray");
    }
}
function grayAllRotations() {
    for (const rotationElem of chart.querySelectorAll('.rotation')) {
        rotationElem.classList.add("gray");
    }
}
function unGrayAllRotations() {
    for (const rotationElem of chart.querySelectorAll('.rotation')) {
        rotationElem.classList.remove("gray");
    }
}
function unGrayAllActivities() {
    for (const activityElem of chart.querySelectorAll('.activity')) {
        activityElem.classList.remove("gray");
    }
}
function grayIds(activityElemIds) {
    for (const activityElemId of activityElemIds) {
        const activityElem = document.getElementById(activityElemId);
        if (activityElem) {
            activityElem.classList.add("gray");
        } else {
            console.warn("Element not found for gray:", activityElemId);
        }
    }
}
function unGrayIds(activityElemIds) {
    for (const elemId of activityElemIds) {
        const elem = document.getElementById(elemId);
        if (elem) {
            elem.classList.remove("gray");
        } else {
            console.warn("Element not found for ungray:", elemId);
        }
    }
}
let rotationHoverTriggered = false;
let rotationHoverTimeout = null;
const rotationHoverDelay = 2000;
function createRotationElement(rotation) {
    const rotationElement = document.createElement('div');
    rotationElement.id = `rotation-${rotation.id}`;
    rotationElement.className = 'rotation';
    rotationElement.dataset.start = rotation.start();
    rotationElement.dataset.end = rotation.end();
    rotationElement.dataset.rotationId = rotation.id;
    rotationElement.addEventListener("mouseenter", (event) => {
        rotationElement.title = JSON.stringify({
            "rotationId": rotation.id,
            "start": rotation.start(),
            "end": rotation.end(),
            "scheduledRegno": rotation.first().regno,
            "first.route": rotation.first().route,
            "last.route": rotation.last().route,
            "activityIds": rotation.activityIds(),
        }, null, 2);
        if (isSearching) {
            console.log("isSearching is true, skipping mouseenter");
            return;
        }
        clearTimeout(rotationHoverTimeout);
        rotationHoverTimeout = setTimeout(() => {
            rotationHoverTriggered = true;
            grayAllActivities();
            grayAllRotations();
            const rotationId = getRotationId(event.target);
            event.target.classList.remove("gray");
            const rotation = loadedRotations[rotationId];
            const activityIds = rotation.activityIds();
            unGrayIds(activityIds.map(id => getFlightElemId(id)))
            for (const activityId of activityIds) {
                const elem = getFlightElement(activityId);
                if (elem) {
                    elem.classList.add("floating-shadow");
                } else {
                    console.warn("Element not found:", getFlightElemId(activityId));
                }
            }
        }, rotationHoverDelay);
    });
    rotationElement.addEventListener("mouseleave", (event) => {
        rotationElement.title = "";
        if (isSearching) {
            console.log("isSearching is true, skipping mouseleave");
            return;
        }
        if (!rotationHoverTriggered) {
            clearTimeout(rotationHoverTimeout);
            return;
        }
        rotationHoverTriggered = false;
        unGrayAllActivities();
        unGrayAllRotations();
        const rotationId = getRotationId(event.target);
        const rotation = loadedRotations[rotationId];
        const activityIds = rotation.activityIds();
        for (const elemId of activityIds.map(id => getFlightElemId(id))) {
            const elem = document.getElementById(elemId);
            if (elem) {
                elem.classList.remove("floating-shadow");
            }
        }
    });
    return rotationElement;
}
function drawResources() {
    aircraftColumn.innerHTML = '';
    currentActivitiesMap = {};
    for (const [index, resourceId] of sortedIndex2ResourceIds) {
        const resource = getResource(resourceId, loadedResources);
        const aircraftElement = createAircraftElement(resource);
        aircraftColumn.appendChild(aircraftElement);
    }
    const unassignedResource = getResource("unassigned", loadedResources);
    const unassignedAircraftElement = createAircraftElement(unassignedResource);
    aircraftColumn.appendChild(unassignedAircraftElement);
}
async function drawSolutionId(solutionId) {
    console.log('Drawing solutionId:', solutionId);
    const solutionData = await fetchSolution(solutionId);
    const solution = createSolution(solutionId, solutionData, loadedResources, loadedActivities);
    drawSolution(solution);
}
function drawSolution(solution) {
    console.log('Drawing solution:', solution);
    clearTimeouts(); // Clear any existing timeouts
    clearStationLabels();
    chart.innerHTML = '';
    const numResources = Object.keys(loadedResources).length + 1;
    drawHorizontalLines(numResources);
    drawVerticalLines();
    drawResources()
    numDrawnInUnassigned = 0;
    for (const chain of solution.chains) {
        const resourceId = chain.resourceId;
        let resource = getResource(resourceId, loadedResources);

        for (const activity of chain.activities) {
            if (!(activity instanceof Flight)) {
                continue;
            }
            if (resourceId === "unassigned" && numDrawnInUnassigned > numUnassignedThreshold) {
                continue;
            }

            const flightElement = createFlightElement(activity);
            assignFlightElementToResource(flightElement, resource);
            chart.appendChild(flightElement);
            if (resourceId === "unassigned") {
                numDrawnInUnassigned++;
            }
        }
        maintenances = loadedResourceId2Maintenances[resource.id] || [];
        const filteredMaintenances = maintenances.filter(maint => {
            const start = new Date(maint.start + "Z");
            const end = new Date(maint.end + "Z");

            // Check if the maintenance overlaps with the period
            return (start <= dataPeriodEnd && end >= dataPeriodStart);
        });
        for (const maint of filteredMaintenances) {
            //if (periodTouching(new Date(maint.start), new Date(maint.end), dataPeriodStart, dataPeriodEnd))
            //{
                const maintElement = createMaintenanceElement(maint);
                assignMaintenanceElementToResource(maintElement, resource);
                chart.appendChild(maintElement);
            //}
        }
    }
    const flightIds2ResourceIds = mapActivityIds2ResourceIds(solution);
    for (const rotationId in loadedRotations) {
        const rotation = loadedRotations[rotationId];
        const firstFlight = rotation.first();
        let resourceId = flightIds2ResourceIds[firstFlight.id];
        const resource = getResource(resourceId, loadedResources);
        if (isNullish(resourceId)) {
            // console.log("Rotation ", rotationId, "not found in solution for flightId", firstFlight.id);
            continue;
        }
        const rotationElement = createRotationElement(rotation);
        rotationElement.style.top = `${resource2TopPosition(resource.id)}px`;
        rotationElement.dataset.resourceId = resource.id;
        const width = duration2Width(rotation.duration());
        rotationElement.style.left = `${startTime2Position(rotation.start())}px`;
        rotationElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        rotationElement.style.height = `${height}px`;
        chart.appendChild(rotationElement);
    }
    createStationLabels(solution.chains);
    updateInfo(loadedOutputPath, null, solution);
}
async function fetchOutputFiles(outputIds) {
    const outputFiles = await Promise.all(
        outputIds.map(fetchOutputFile)
    );
    return outputFiles;
}
async function fetchOutputFileData(outputFile) {
    try {
        const url = outputFile.output_file_url;
        console.log("Fetching output file data from URL:", url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log('Fetched output file data:', data);
        return data;
    } catch (error) {
        console.error('Error fetching output file data:', error);
    }
}
async function fetchOptScenarios() {
    try {
        const response = await fetch('/api/v1/opt/runs/');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log('Fetched optimization scenarios:', data);
        return data;
    } catch (error) {
        console.error('Error fetching optimization scenarios:', error);
    }
}
async function fetchOutputPaths() {
    try {
        const response = await fetch('http://localhost:8000/outputs');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        return data.outputs;
    } catch (error) {
        console.error('Error fetching output paths:', error);
    }
}

async function fetchOutput(outputPath) {
    try {
        const response = await fetch('http://localhost:8000' + outputPath + '/output.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching output data or parsing JSON file:', error);
    }
}
function outputPath2Url(outputPath) {
    const right = outputPath.split('/output/')[1]
    console.log("outputPath2Url:", outputPath, "right:", right);
    return 'http://localhost:8000' + outputPath;
}
async function fetchInputBuilder(runDirectory) {
    try {
        console.log("Fetching input builder for:", runDirectory);
        const response = await fetch('/outputs/' + runDirectory + '/');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log("Fetched input builder for:", runDirectory, data);
        return data;
    } catch (error) {
        console.error('Error fetching input builder or parsing JSON file:', error);
    }

}
async function fetchInputFileV1(optScenarioId) {
    try {
        console.log("Fetching input file v1 for:", optScenarioId);
        const response = await fetch('/opt/' + optScenarioId + '/input-file/');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log("Fetched input file for:", optScenarioId, data);
        return data;
    } catch (error) {
        console.error('Error fetching input file or parsing JSON file:', error);
    }

}
async function fetchUserInputFileV1(optScenarioId) {
    try {
        console.log("Fetching user input file v1 for:", optScenarioId);
        const response = await fetch('/opt/' + optScenarioId + '/user-input-file/');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log("Fetched user input file for:", optScenarioId, data);
        return data;
    } catch (error) {
        console.error('Error fetching user input file or parsing JSON file:', error);
    }

}
async function fetchMeta2(run_directory) {
    try {
        console.log("Fetching meta for:", run_directory);
        const response = await fetch('/opt/files/' + run_directory + '/run_summary.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        console.log("Fetched meta for:", run_directory, data);
        return data;
    } catch (error) {
        console.error('Error fetching activities or parsing JSON file:', error);
    }
}
async function fetchMeta3(dir) {
    const data = await fetchGet(`/opt/directories/${dir}/meta.json`);
    return data;
}
async function fetchMeta(outputPath) {
    try {
        console.log("Fetching meta for:", outputPath);
        const url = outputPath2Url(outputPath);
        console.log("Fetching meta from URL:", url + '/meta.json');
        const response = await fetch(url + '/meta.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        console.log("Fetched meta for:", outputPath, data);
        return data;
    } catch (error) {
        console.error('Error fetching activities or parsing JSON file:', error);
    }
}

async function fetchMaintenances2(run_directory) {
    try {
        const response = await fetch('/opt/files/' + run_directory + '/maintenances.json');
        if (response.status == 404) {
            return {};
        }
        if (!response.ok) {
            throw new Error('Unknow error when fetching maintenances');
        }
        const data = await response.json(); // Parse JSON data
        console.log("Fetched maintenances for:", run_directory, data);
        return data;
    } catch (error) {
        console.error('Error fetching maintenances or parsing JSON file:', error);
    }
}
async function fetchActivities2(run_directory) {
    try {
        const response = await fetch('/opt/files/' + run_directory + '/activities.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        console.log("Fetched activities for:", run_directory, data);
        return data;
    } catch (error) {
        console.error('Error fetching activities or parsing JSON file:', error);
    }
}
async function fetchActivities(outputPath) {
    try {
        const response = await fetch('http://localhost:8000' + outputPath + '/activities.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        return data;
    } catch (error) {
        console.error('Error fetching activities or parsing JSON file:', error);
    }
}
async function fetchResources2(run_directory) {
    try {
        const response = await fetch('/opt/files/' + run_directory + '/resources.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        return data;
    } catch (error) {
        console.error('Error fetching resources or parsing JSON file:', error);
    }

}
async function fetchResources(outputPath) {
    try {
        const response = await fetch('http://localhost:8000' + outputPath + '/resources.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json(); // Parse JSON data
        return data;
    } catch (error) {
        console.error('Error fetching resources or parsing JSON file:', error);
    }
}

const timeRulerElement = document.getElementById("time-ruler");
const scalableRectangle = document.getElementById("scalableRectangle");

function startTime2Position(datetime) {
    const minutes = Math.abs(datetime - dataPeriodStart) / (1000 * 60); // Difference in minutes
    const factor = minutes / (minutesInDataPeriod + 60 * 24);
    const timeRulerWidth = parseFloat(timeRulerElement.style.width);
    const left = timeRulerWidth * factor;
    return left;
}

function duration2Width(duration) {
    return Math.floor(duration / (60 * 24) * daySpacing);
}
function clearVerticalLines() {
    const verticalLines = document.querySelectorAll('.vertical-line');
    verticalLines.forEach(line => line.remove());
}
function drawVerticalLines() {
    clearVerticalLines();
    const numResources = Object.keys(loadedResources).length + 1;
    let tickElements = document.querySelectorAll('.tick');
    tickElements.forEach(tickElement => {
        // Create vertical line
        const verticalLine = document.createElement("div");
        verticalLine.className = "vertical-line";
        verticalLine.style.left = tickElement.style.left;
        verticalLine.style.height = `${numResources * resourceHeight}px`;
        chart.appendChild(verticalLine); // Append to the chart or container
    });
}

function generateTimeRuler() {
    console.log("Generating time ruler...");
    timeRulerElement.innerHTML = '';  // Clear existing ticks and labels
    const totalWidth = daysInDataPeriod * daySpacing;
    timeRulerElement.style.width = `${totalWidth}px`;
    chart.style.width = `${totalWidth}px`;

    const date = new Date(dataPeriodStart);

    for (let i = 0; i < daysInDataPeriod; i++) {
        const tickLeft = i * daySpacing;
        const month = date.toLocaleString('default', { month: 'short' }).slice(0, 3);
        const day = date.getDate();
        date.setDate(day + 1);

        if (daySpacing > 200) {
            createTick('large', tickLeft, `${month} ${day}`);

        } else {
            createTick('large', tickLeft, `${day}`);
        }

        let subTicks;
        if (daySpacing > 1900) subTicks = 96; // 15-minute ticks
        else if (daySpacing > 900) subTicks = 48; // 30-minute ticks
        else if (daySpacing > 450) subTicks = 24; // Hourly ticks
        else if (daySpacing > 200) subTicks = 4; // 6-hourly ticks
        else if (daySpacing > 100) subTicks = 2; // Midday tick

        if (subTicks) {
            for (let j = 1; j < subTicks; j++) {
                const smallTickLeft = tickLeft + (j * daySpacing / subTicks);
                const timeLabels = subTicks === 96 ? [String(j / 4).padStart(2, '0'), "15", "30", "45"][j % 4]
                                 : subTicks === 48 ? [String(j / 2).padStart(2, '0'), "30"][j % 2]
                                 : subTicks === 24 ? String(j).padStart(2, '0')
                                 : subTicks === 4 ? ["06", "12", "18"][j - 1]
                                 : "12";
                if (subTicks === 96) {
                    if (j % 4 === 0) createTick('small', smallTickLeft, timeLabels);
                    else if (j % 2 === 0) createTick('smaller', smallTickLeft, timeLabels);
                    else createTick('smallest', smallTickLeft, timeLabels);
                } else if (subTicks === 48) {
                    if (j % 2 === 0) createTick('small', smallTickLeft, timeLabels);
                    else createTick('smaller', smallTickLeft, timeLabels);
                } else {
                    createTick('small', smallTickLeft, timeLabels);
                }
            }
        }
    }
}

function createTick(size, left, label) {
    const tick = document.createElement("div");
    tick.className = `tick ${size}`;
    tick.style.left = `${left}px`;

    if (size === 'large') tick.setAttribute('data-date', label);
    else tick.setAttribute('data-time', label);

    timeRulerElement.appendChild(tick);
    return tick;
}

// Break points for scaling activities and maintenances
const y62 = 62;
const y50 = 50;
const y32 = 32;
const y41 = 41;
const y17 = 17;

// Break points for scaling activities and maintenances
const x110 = 110;
const x50 = 50;
const x30 = 30;

function createFlightContent(flight) {
    return `
        <div class="left">
            <div>${flight.adep}</div>
            <div>${flight.startTimeString()}</div>
        </div>
        <div class="center">
            <div>${flight.id}-${flight.fl_num}</div>
            <div>${flight.plannedActype}</div>
        </div>
        <div class="right">
            <div>${flight.ades}</div>
            <div>${flight.endTimeString()}</div>
        </div>
    `;
}

function updateFlightContent(element, width, height) {
    const leftDivs = element.querySelectorAll('.left > div');
    const centerDivs = element.querySelectorAll('.center > div');
    const rightDivs = element.querySelectorAll('.right > div');

    const elements = {
        startTime: leftDivs[1],
        adep: leftDivs[0],
        id: centerDivs[0],
        plannedActype: centerDivs[1],
        endTime: rightDivs[1],
        ades: rightDivs[0],
    };

    // Define layout & visibility rules
    const rules = [
        { width: x110, layout: { flexDirection: "row", justifyContent: "space-between" }, heights: [
            { min: y32, visibility: { startTime: 1, adep: 1, id: 1, plannedActype: 1, endTime: 1, ades: 1 } },
            { min: y17, visibility: { startTime: 1, adep: 0, id: 1, plannedActype: 0, endTime: 1, ades: 0 } },
            { min: 0, visibility: { startTime: 0, adep: 0, id: 0, plannedActype: 0, endTime: 0, ades: 0 } }
        ]},
        { width: x50, layout: { flexDirection: "column", justifyContent: "center" }, heights: [
            { min: y62, visibility: { startTime: 1, adep: 1, id: 1, plannedActype: 0, endTime: 1, ades: 1 } },
            { min: y50, visibility: { startTime: 1, adep: 1, id: 1, plannedActype: 0, endTime: 1, ades: 0 } },
            { min: y32, visibility: { startTime: 1, adep: 1, id: 1, plannedActype: 0, endTime: 0, ades: 0 } },
            { min: y17, visibility: { startTime: 0, adep: 0, id: 1, plannedActype: 0, endTime: 0, ades: 0 } },
            { min: 0, visibility: { startTime: 0, adep: 0, id: 0, plannedActype: 0, endTime: 0, ades: 0 } }
        ]},
        { width: x30, layout: { flexDirection: "column", justifyContent: "center" }, heights: [
            { min: y50, visibility: { startTime: 1, adep: 1, id: 0, plannedActype: 0, endTime: 1, ades: 1 } },
            { min: y32, visibility: { startTime: 1, adep: 1, id: 0, plannedActype: 0, endTime: 1, ades: 0 } },
            { min: y17, visibility: { startTime: 1, adep: 0, id: 0, plannedActype: 0, endTime: 0, ades: 0 } },
            { min: 0, visibility: { startTime: 0, adep: 0, id: 0, plannedActype: 0, endTime: 0, ades: 0 } }
        ]}
    ];

    // Apply the first matching rule
    for (const rule of rules) {
        if (width >= rule.width) {
            Object.assign(element.style, rule.layout);
            for (const heightRule of rule.heights) {
                if (height >= heightRule.min) {
                    setVisibility(elements, heightRule.visibility);
                    return;
                }
            }
        }
    }

    // Default case: Hide everything
    setVisibility(elements, { startTime: 0, adep: 0, id: 0, plannedActype: 0, endTime: 0, ades: 0 });
}

function scaleActivitiesAndMaintenances() {
    const flights = chart.querySelectorAll('.flight');
    flights.forEach(flightElement => {
        const flight = loadedActivities[getFlightId(flightElement)];
        flightElement.style.left = `${startTime2Position(flight.start)}px`;
        const resourceId = flightElement.dataset.resourceId;
        if (isNullish(resourceId)) {
            console.error("Could not find resource id for", flight.id)
        }
        const width = duration2Width(flight.duration);
        flightElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        flightElement.style.height = `${height}px`;
        flightElement.style.top = `${resource2TopPosition(resourceId)}px`;
        updateFlightContent(flightElement, width, height);
        if (flightElement.dataset.nextStart === "undefined") {
            return;
        }
        const nextStart = new Date(flightElement.dataset.nextStart);
        const gapDuration = nextStart - flight.end;
        const gapWidth = duration2Width(gapDuration / (1000 * 60));
        const gapHalfTime = new Date(flight.end.getTime() + gapDuration / 2);
        const stationLabel = document.getElementById(`station-label-${getFlightElemId(flight.id)}`);
        if (stationLabel) {
            if (gapWidth < 30) {
                stationLabel.style.display = "none";
            } else {
                stationLabel.style.display = "block";
                stationLabel.style.left = `${startTime2Position(gapHalfTime)}px`;
                stationLabel.style.top = `${resource2TopPosition(resourceId) + resourceHeight / 2}px`;
            }
        }
    });
    const maintenanceElements = chart.querySelectorAll('.maintenance');
    maintenanceElements.forEach(maintElement => {
        const maint = loadedMaintenances[getMaintId(maintElement)];
        console.log("Scaling maintenance:", maint);
        const resource = loadedResources[maint.aircraftId];
        console.log("Maintenance resource:", resource);
        maintElement.style.left = `${startTime2Position(maint.start)}px`;
        const width = duration2Width(maint.duration);
        maintElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        maintElement.style.height = `${height}px`;
        maintElement.style.top = `${resource2TopPosition(resource.id)}px`;
        updateMaintenanceContent(maintElement, width, height);
        if (maintElement.dataset.nextStart === "undefined") {
            return;
        }
        console.log(maintElement.dataset.nextStart);
        const nextStart = new Date(maintElement.dataset.nextStart);
        console.log("nextStart", nextStart);
        const gapDuration = nextStart - maint.end;
        const gapWidth = duration2Width(gapDuration / (1000 * 60));
        const gapHalfTime = new Date(maint.end.getTime() + gapDuration / 2);
        const stationLabel = document.getElementById(`station-label-${getMaintElemId(maint.id)}`);
        if (stationLabel) {
            if (gapWidth < 30) {
                stationLabel.style.display = "none";
            } else {
                stationLabel.style.display = "block";
                stationLabel.style.left = `${startTime2Position(gapHalfTime)}px`;
                stationLabel.style.top = `${resource2TopPosition(resource.id) + resourceHeight / 2}px`;
            }
        }
    });
    const rotationElements = chart.querySelectorAll('.rotation');
    rotationElements.forEach(rotationElement => {
        const id = getRotationId(rotationElement);
        const rotation = loadedRotations[id];
        rotationElement.style.left = `${startTime2Position(rotation.start())}px`;
        const width = duration2Width(rotation.duration());
        rotationElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        rotationElement.style.height = `${height}px`;
        const resourceId = rotationElement.dataset.resourceId;
        rotationElement.style.top = `${resource2TopPosition(resourceId)}px`;
    });

    document.documentElement.style.setProperty('--activity-height', `${resourceHeight}px`);
    horizontalLines.forEach((line, ix) => {
        line.style.top = `${ix * resourceHeight}px`;
    });
}
function zoomHorizontal(factor) {
    if (factor < 0) {
        setDaySpacing(Math.min(daySpacing - factor, maxZoomX));
        if (daySpacing < maxZoomX) {
            gantt.scrollLeft = gantt.scrollLeft - factor;
        }
    } else {
        setDaySpacing(Math.max(daySpacing - factor, minZoomX));
        if (daySpacing > minZoomX) {
            gantt.scrollLeft = gantt.scrollLeft - factor;
        }
    }
}
function setDaySpacing(value) {
    daySpacing = value;
    localStorage.setItem("daySpacing", daySpacing);
    generateTimeRuler();
    drawVerticalLines();
    scaleActivitiesAndMaintenances();
}

function setResourceHeight(value) {
    resourceHeight = value;
    localStorage.setItem("resourceHeight", resourceHeight);
    generateTimeRuler();
    drawVerticalLines();
    scaleActivitiesAndMaintenances();
}
gantt.addEventListener('scroll', () => {
    aircraftColumn.scrollTop = gantt.scrollTop;
    localStorage.setItem("scrollTop", gantt.scrollTop);
    localStorage.setItem("scrollLeft", gantt.scrollLeft);
});
window.addEventListener('keydown', (event) => {
    const modifier = event.metaKey || event.ctrlKey; // Mac: meta, Win/Linux: ctrl

    if (!modifier) return;

    switch (event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            zoomHorizontal(30);
            break;

        case 'ArrowRight':
            event.preventDefault();
            zoomHorizontal(-30);
            break;

        case 'ArrowUp':
            event.preventDefault();
            setResourceHeight(Math.max(resourceHeight - 10, minZoomY));
            console.log('Modifier + Up pressed');
            break;

        case 'ArrowDown':
            event.preventDefault();
            setResourceHeight(Math.min(resourceHeight + 10, maxZoomY));
            console.log('Modifier + Down pressed');
            break;
    }
});

gantt.addEventListener('click', () => {
    kpiMenuElement.classList.remove('show');
    reportMenuElement.classList.remove("show");
});
gantt.addEventListener('wheel', (event) => {
    const modifier = event.ctrlKey || event.metaKey; // Same logic as keyboard handler

    // ---------------------------
    // Modifier + Shift = vertical zoom
    // ---------------------------
    if (modifier && event.shiftKey) {
        event.preventDefault();

        const scrollFactorY = 0.5;
        const delta = event.deltaY !== 0
            ? event.deltaY
            : -event.wheelDeltaX; // wheelDeltaX flips direction on some mice

        if (delta < 0) {
            setResourceHeight(Math.min(resourceHeight + scrollFactorY, maxZoomY));
        } else if (delta > 0) {
            setResourceHeight(Math.max(resourceHeight - scrollFactorY, minZoomY));
        }
        return;
    }

    // ---------------------------
    // Modifier only = horizontal zoom
    // ---------------------------
    if (modifier) {
        event.preventDefault();

        if (event.deltaX !== 0) {
            // Trackpad horizontal movement
            const scrollFactorX = event.deltaX * 10;
            zoomHorizontal(scrollFactorX);
        } else {
            // Mouse wheel vertical scrolling → zoom horizontally
            zoomHorizontal(event.wheelDeltaY);
        }
    }
});


function updateInfo(outputPath, genKey = null, solution = null) {
    document.getElementById('output').textContent = `Output: ${outputPath}`;
    document.getElementById('generation').textContent = `Generation: ${genKey}` ?? 'Generation: ';
    let cost = "";
    let numUnassigned = "";
    if (solution != null) {
        cost = solution.kpis.cost;
        const unassignedChain = solution.unassignedChain();
        numUnassigned = unassignedChain.activities.length;
        document.getElementById('solution').textContent = `Solution: ${solution.ix}`;
    } else {
        document.getElementById('solution').textContent = `Solution: `;
    }
    const costElement = document.getElementById('cost');
    costElement.textContent = `Cost: ${cost}`;
    const unassignedElement = document.getElementById('unassigned');
    unassignedElement.textContent = `Unassigned: ${numUnassigned}`;
}

function pingServer() {
    fetch("http://localhost:8000/ping")
        .catch(error => {
            alert('Server is not running');
        });
}
pingServer();

function addTooltips() {
    const tooltipWrappers = document.querySelectorAll('.tooltip-wrapper');
    tooltipWrappers.forEach(tooltipWrapper => {
        let hooverTimeout;
        const tooltip = tooltipWrapper.querySelector('.tooltip');
        tooltipWrapper.addEventListener('mouseenter', (event) => {
            hooverTimeout = setTimeout(() => {
                tooltip.classList.add('visible');
            }, 2000);
        });
        tooltipWrapper.addEventListener('mouseleave', (event) => {
            clearTimeout(hooverTimeout);
            tooltip.classList.remove('visible');
        });
    });
};
addTooltips();

function getUniqueKeys(obj1, obj2) {
    const uniqueToObj1 = Object.keys(obj1)
        .filter(key => !(key in obj2))
        .reduce((acc, key) => {
            acc[key] = obj1[key];
            return acc;
        }, {});

    const uniqueToObj2 = Object.keys(obj2)
        .filter(key => !(key in obj1))
        .reduce((acc, key) => {
            acc[key] = obj2[key];
            return acc;
        }, {});

    return { ...uniqueToObj1, ...uniqueToObj2 };
}
function getUniqueSolutions(solutionIds, keys) {
    console.log('solutionIds:', solutionIds);
    console.log('keys:', keys);
    return solutionIds.filter(id => !keys.has(id));
}
async function live() {
    if (liveModeIsOn === false) {
        return;
    }
    console.log('Checking for new generations...');
    const meta = await fetchRunSummary(loadedDirectory);
    const selectedMeta = await fetchRunSummary(selectedDirectory);
    updateGraphs(selectedMeta);
    const solutionsFilenames = [ ...meta.solutions ];
    console.log("loadedSolutions:", loadedSolutionIds);
    console.log("solutionFilenames:", solutionsFilenames);
    const solutionIds = solutionsFilenames.map(filename => {
        return loadedDirectory + '/' + filename;
    });
    const newSolutionIds = getUniqueSolutions(solutionIds, loadedSolutionIds);
    if (newSolutionIds.length === 0) {
        console.log('No new solutions found.');
        return;
    }

    addSolutions2Fieldset(newSolutionIds);
    await runSolutions(newSolutionIds);
    newSolutionIds.map(id => {loadedSolutionIds.add(id)});
    console.log('Loaded solutions updated:', loadedSolutionIds);
}
function mapResourceId2Maintenances(maintenances) {
    const resourceId2Maintenances = {}
    for (const maintId of Object.keys(maintenances)) {
        const maintenance = maintenances[maintId];
        const aircraftId = maintenance.aircraftId;
        if (!(aircraftId in resourceId2Maintenances)) {
            resourceId2Maintenances[aircraftId] = [];
        }
        resourceId2Maintenances[aircraftId].push(maintenance);
    }
    return resourceId2Maintenances;
}
function mapRegnos2Resources(resources) {
    const regnos2resources = {}
    for (const resourceId in resources) {
        const resource = resources[resourceId];
        regnos2resources[resource.regno] = resource;
    }
    return regnos2resources;
}
class Rotation {
    constructor(id) {
        this.id = id;
        this.activities = [];
    }
    static default(inData = {}) {
        const data = { ...inData }
        return new Rotation(data.id ?? 0);
    }
    start() {
        return this.first().start;
    }
    end() {
        return this.last().end;
    }
    first() {
        return this.activities[0];
    }
    last() {
        return this.activities[this.activities.length - 1];
    }
    addActivity(activity) {
        this.activities.push(activity);
        this.sort((a, b) => {
            return a.start.getTime() - b.start.getTime()
        });
    }
    sort(compareFn) {
        this.activities.sort(compareFn);
    }
    length() {
        return this.activities.length;
    }
    duration() {
        return (this.end() - this.start()) / 60 / 1000; // Convert milliseconds to minutes
    }
    activityIds() {
        return this.activities.map(activity => activity.id);
    }
}
function loadRotations(activities) {
    console.log('Loading rotations from activities...');
    const rotations = {};
    for (const activity of Object.values(activities)) {
        if (activity.rotationId) {
            const rotationId = activity.rotationId;
            if (!(rotationId in rotations)) {
                rotations[rotationId] = new Rotation(rotationId);
            }
            rotations[rotationId].addActivity(activity);
        }
    }
    for (const rotationId in rotations) {
        const rotation = rotations[rotationId];
        rotation.sort((a, b) => a.start - b.start);
    }
    loadedRotations = rotations;
    console.log('Loaded rotations:', loadedRotations);
}
async function loadPeriod(start, end) {
    console.log('Loading period start', start, 'and end', end, '...');

    periodStart = new Date(start + "Z");
    const dataStart = new Date(start + "Z");
    dataStart.setUTCHours(0, 0, 0, 0);
    dataStart.setUTCDate(dataStart.getUTCDate() - 1);
    dataPeriodStart = dataStart;

    periodEnd = new Date(end + "Z");
    const dataEnd = new Date(end + "Z");
    dataEnd.setUTCHours(0, 0, 0, 0);
    dataEnd.setUTCDate(dataEnd.getDate() + 1);
    dataPeriodEnd = dataEnd;
    minutesInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60);
    console.log('dataPeriodStart:', dataPeriodStart);
    console.log('dataPeriodEnd:', dataPeriodEnd);
    console.log('minutesInDataPeriod:', minutesInDataPeriod);

    daysInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60 * 60 * 24) + 1;
    daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    console.log('daysInPeriod:', daysInPeriod);
    console.log('daysInDataPeriod:', daysInDataPeriod);
    month = dataPeriodStart.toLocaleString('default', { month: 'long' });
    month = month.slice(0, 3);
    console.log('month:', month);

}
async function loadInputMetaAndPeriod(meta) {
    console.log('Loaded meta:', meta);

    periodStart = new Date(meta.period_start + "Z");
    const dataStart = new Date(meta.period_start + "Z");
    dataStart.setUTCHours(0, 0, 0, 0);
    dataStart.setUTCDate(dataStart.getUTCDate() - 1);
    dataPeriodStart = dataStart;

    periodEnd = new Date(meta.period_end + "Z");
    const dataEnd = new Date(meta.period_end + "Z");
    dataEnd.setUTCHours(0, 0, 0, 0);
    dataEnd.setUTCDate(dataEnd.getDate() + 1);
    dataPeriodEnd = dataEnd;
    minutesInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60);
    console.log('dataPeriodStart:', dataPeriodStart);
    console.log('dataPeriodEnd:', dataPeriodEnd);
    console.log('minutesInDataPeriod:', minutesInDataPeriod);

    daysInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60 * 60 * 24) + 1;
    daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    console.log('daysInPeriod:', daysInPeriod);
    console.log('daysInDataPeriod:', daysInDataPeriod);
    month = dataPeriodStart.toLocaleString('default', { month: 'long' });
    month = month.slice(0, 3);
    console.log('month:', month);

}
async function loadMetaAndPeriods2(run_directory) {
    console.log('Loading meta and periods from', run_directory, '...');
    const meta = await fetchMeta2(run_directory);
    loadedMeta = meta;
    console.log('Loaded meta:', meta);
    loadInputMetaAndPeriod(meta);
}
async function loadMetaAndPeriods(outputPath) {
    console.log('Loading meta and periods from', outputPath, '...');
    const meta = await fetchMeta(outputPath);
    loadedMeta = meta;
    console.log('Loaded meta:', meta);

    periodStart = new Date(meta.period_start + "Z");
    const dataStart = new Date(meta.period_start + "Z");
    dataStart.setUTCHours(0, 0, 0, 0);
    dataStart.setUTCDate(dataStart.getUTCDate() - 1);
    dataPeriodStart = dataStart;

    periodEnd = new Date(meta.period_end + "Z");
    const dataEnd = new Date(meta.period_end + "Z");
    dataEnd.setUTCHours(0, 0, 0, 0);
    dataEnd.setUTCDate(dataEnd.getDate() + 1);
    dataPeriodEnd = dataEnd;
    minutesInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60);
    console.log('dataPeriodStart:', dataPeriodStart);
    console.log('dataPeriodEnd:', dataPeriodEnd);
    console.log('minutesInDataPeriod:', minutesInDataPeriod);

    daysInDataPeriod = (dataPeriodEnd - dataPeriodStart) / (1000 * 60 * 60 * 24) + 1;
    daysInPeriod = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
    console.log('daysInPeriod:', daysInPeriod);
    console.log('daysInDataPeriod:', daysInDataPeriod);
    month = dataPeriodStart.toLocaleString('default', { month: 'long' });
    month = month.slice(0, 3);
    console.log('month:', month);
}
function reverseMapping(map) {
  const reversed = new Map();

  for (const [key, value] of map.entries()) {
    reversed.set(value, key);
  }

  return reversed;
}
let loadedOutputPaths = null;
let loadedDirectories = null;
let loadedDirectory = localStorage.getItem('loadedDirectory') || null;
let loadedUserInput = null;
let loadedInput = null;
async function load(dir) {
    let input = await fetchInput(dir);
    if (!input) {
        console.log('No input file found in directory', dir);
        input = await fetchUserInput(dir);
        if (!input) {
            alert(`Could not find user input file in directory ${dir}`);
            return;
        }
        loadedUserInput = input;
        console.log('loadedUserInput:', loadedUserInput);
    }
    loadedInput = input;
    let runSummary = await fetchRunSummary(dir);
    if (!runSummary) {
        console.log('No run summary found in directory', dir);
        runSummary = await fetchMeta3(dir);
        if (!runSummary) {
            alert(`Could not find run summary in directory ${dir}`);
            return;
        }
    }
    loadedMeta = { ...runSummary };
    let pStart;
    let pEnd;
    if (!input.meta) {
        pStart = runSummary.period_start;
        pEnd = runSummary.period_end;
    } else {
        pStart = input.meta.period_start;
        pEnd = input.meta.period_end;
    }
    loadPeriod(pStart, pEnd);
    generateTimeRuler();
    loadedActivities = Flight.fromData(input.flights);
    console.log('loadedActivities:', loadedActivities);
    loadRotations(loadedActivities);
    loadedResources = Resource.fromData(input.aircrafts);
    console.log('loadedResources:', loadedResources);
    sortedResourceIds2Index = sortByKey(loadedResources, currentSortKey);
    console.log('sortedResourceIds2Index:', sortedResourceIds2Index);
    sortedIndex2ResourceIds = reverseMapping(sortedResourceIds2Index);
    console.log('sortedIndex2ResourceIds:', sortedIndex2ResourceIds);
    loadedRegnos2resources = mapRegnos2Resources(loadedResources);
    loadedMaintenances = Maintenance.fromData(input.maintenances);
    console.log('loadedMaintenances:', loadedMaintenances);
    loadedResourceId2Maintenances = mapResourceId2Maintenances(loadedMaintenances);
    loadedInput = input;
    console.log('loadedInput:', loadedInput);
    setLoadedDirectory(dir);
    updateGraphs(loadedMeta);
}
function setLoadedSolutionId(id) {
    loadedSolutionId = id;
    localStorage.setItem('loadedSolutionId', loadedSolutionId);
    console.log("loadedSolutionId set to", loadedSolutionId);
}
function setLoadedDirectory(directory) {
    loadedDirectory = directory;
    localStorage.setItem('loadedDirectory', loadedDirectory);
    console.log("loadedDirectory set to", loadedDirectory);
}
function findPeriodStartAndEndFromActivities(activities) {
    let minStart = null;
    let maxEnd = null;
    for (const activityId in activities) {
        const activity = activities[activityId];
        if (isNullish(minStart) || activity.start < minStart) {
            minStart = activity.start;
        }
        if (isNullish(maxEnd) || activity.end > maxEnd) {
            maxEnd = activity.end;
        }
    }
    return [minStart, maxEnd];
}
let selectedSolutionId = localStorage.getItem('selectedSolutionId') || null;
function setSelectedSolutionId(id) {
    selectedSolutionId = id;
    localStorage.setItem('selectedSolutionId', selectedSolutionId);
    console.log("selectedSolutionId set to", selectedSolutionId);
}
function setLoadedOptScenarioId(id) {
    loadedOptScenarioId = id;
    localStorage.setItem('loadedOptScenarioId', loadedOptScenarioId);
    console.log("loadedOptScenarioId set to", loadedOptScenarioId);
}
function setLoadedOutputPath(outputPath) {
    loadedOutputPath = outputPath;
    localStorage.setItem('loadedOutputPath', loadedOutputPath);
    console.log("loadedOutputPath set to", loadedOutputPath);
}
let currentOutputId = localStorage.getItem('currentOutputId') || null;
function setCurrentOutputId(outputId) {
    currentOutputId = outputId;
    localStorage.setItem('currentOutputId', currentOutputId);
    console.log("currentOutputId set to", currentOutputId);
}
function setLoadedOutputId(outputId) {
    loadedOutputId = outputId;
    localStorage.setItem('loadedOutputId', loadedOutputId);
    console.log("loadedOutputId set to", loadedOutputId);
}
function toSolutionFileNames(keys) {
    return keys.map(key => toSolutionFileName(key[0], key[1]));
}
function toSolutionFileName(genKey, solutionId) {
    return `${genKey}_sol${solutionId}.json`;
}
async function fetchOutputFile(outputId) {
    try {
        const response = await fetch('/opt/output-files/' + outputId + '/');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log('Fetched output file data:', data);
        return data;
    }
    catch (error) {
        console.error('Error fetching solution data or parsing JSON file:', error, 'outputId:', outputId);
    }
}
async function fetchSolutionFile(outputPath, solutionFileName) {
    try {
        const response = await fetch(`http://localhost:8000${outputPath}/${solutionFileName}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        return data;
    }
    catch (error) {
        console.error('Error fetching solution data or parsing JSON file:', error, 'outputPath:', outputPath, 'solutionFileName:', solutionFileName);
    }
}
async function fetchSolutionData(solutionId) {
    return fetchGet(`/opt/directories/${solutionId}`);
}
async function fetchSolutionsData(solutionIds) {
    const solutionsData = await Promise.all(
        solutionIds.map(async solutionId => {
            return {[solutionId]: await fetchSolution(solutionId)};
        })
    );
    return solutionsData
}
function setActiveOutputInMenu(outputId) {
    const divs = generationsFieldsetElement.querySelectorAll('div');
    divs.forEach(div => {
        const id = div.dataset.solutionId;
        if (outputId == id) {
            div.classList.add('active');
            return;
        } else {
            div.classList.remove('active');
        }
    });
}
function setActiveSolutionInMenu(solutionId) {
    const divs = generationsFieldsetElement.querySelectorAll('div');
    divs.forEach(div => {
        const id = div.dataset.solutionId;
        if (solutionId == id) {
            div.classList.add('active');
            return;
        } else {
            div.classList.remove('active');
        }
    });
}
async function initialLoad(dir, solutionId = null) {
    console.log('Initial load...');
    console.log('loading directory:', dir);
    await Promise.all([
        load(dir),
        loadDirectoriesInMenu(dir),
    ]);
    await loadSolutionsInMenu(dir, selectedSolutionId);
    loadSelectedSolutionIdsFromStorage();
    if (isNullish(solutionId)) {
        console.log('No solution ID provided');
        return;
    }
    setActiveSolutionInMenu(solutionId);
    console.log('SOLUTION_ID:', solutionId);
    const solutionData = await fetchSolution(solutionId);
    const solution = createSolution(solutionId, solutionData, loadedResources, loadedActivities);
    console.log('Initial solution:', solution);
    drawSolution(solution);
    updateInfo(loadedOutputPath, "chris", solution);
    gantt.scrollLeft = initScrollLeft;
    gantt.scrollTop = initScrollTop;
    aircraftColumn.scrollTop = gantt.scrollTop;
    if (liveModeIsOn) {
        startLive();
    }
    if (autoCheckSolutions) {
        runButtonElement.classList.add('active');
    }

    console.log('Initial load complete.');
}
if (loadedDirectory) {
    initialLoad(loadedDirectory, loadedSolutionId);
} else {
    loadDirectoriesInMenu();
}
////////////////////////////////////////////////////
// TESTS
function assertEqual(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((aval, index) => assertEqual(aval, b[index]));
    }
    return a === b;
}
function assertTrue(a) {
    return a === true;
}
function assertEqualSets(set, array) {
    return set.size === array.length && array.every(item => set.has(item));
}
function assertSetEquals(set, string) {
    const str = [...set].sort().join(',');
    string = string.split(',').sort().join(',');
    return str === string;
}

function runTests() {
    console.time("Running tests...");
    test_create_solution();
    test_extract_solution_keys();
    test_to_solution_file_name();
    test_create_default_activity();
    test_create_flight_and_element_with_multileg_id();
    test_create_flight_and_element_with_multileg_id_string();
    test_create_flight_and_element_with_multileg_id_null();
    test_create_flight_and_element_with_multileg_id_undefined();
    test_create_maintenance_element();
    testStringToKeywords();
    testMaintenanceKeywords();
    testFlightKeywords();
    test_create_rotation();
    test_rotation_sort();
    test_rotation_duration();
    test_create_flight_content();
    test_get_elem_ids();
    test_create_maintenance_content();
    console.timeEnd("Running tests...");
}

function test_create_solution() {
    let data = {
        "chains": {
            "0": [0],
            "unassigned": [1, 2, 3],
        },
        "kpis": {
            "cost": 1000,
        },
    };
    const resource = Resource.default();
    const activities = {
        0: Flight.default({ id: 0 }),
        1: Flight.default({ id: 1 }),
        2: Flight.default({ id: 2 }),
        3: Flight.default({ id: 3 }),
    };
    let solution = createSolution(data, "gen0", 0, { [resource.id]: resource }, activities);
    assertEqual(solution.kpis.cost, 1000) || (
        console.error(`Cost ${solution.kpis.cost} not equal to 1000`)
    );
    assertEqual(solution.chains.length, 2) || (
        console.error(`Chains length ${solution.chains.length} not equal to 2`)
    );
    assertEqual(solution.chains[0].activities.length, 1) || (
        console.error(`Chain 0 activities length ${solution.chains[0].activities.length} not equal to 1 ${solution.chains[0].ressourceId}`)
    );
    assertEqual(solution.chains[1].activities.length, 3) || (
        console.error(`Chain 1 activities length ${solution.chains[1].activities.length} not equal to 3`)
    );
    assertEqual(solution.chains[1].resourceId, "unassigned") || (
        console.error(`Chain 1 resource id ${solution.chains[1].resourceId} not equal to "unassigned"`)
    );
}

function test_extract_solution_keys() {
    const solutionFileNames = [
        "gen0_sol0.json",
        "gen0_sol1.json",
        "gen1_sol0.json",
        "gen1_sol1.json",
    ];
    const solutionKeys = extractSolutionKeys(solutionFileNames);
    const solutionKeysExpected = [
        ["gen0", 0],
        ["gen0", 1],
        ["gen1", 0],
        ["gen1", 1],
    ];
    assertEqual(solutionKeys, solutionKeysExpected) || (
        console.error(`Solution keys ${solutionKeys} not equal to [["gen0", 0], ["gen0", 1], ["gen1", 0], ["gen1", 1]]`)
    )
}

function test_to_solution_file_name() {
    const fileName = toSolutionFileName("gen0", 0);
    assertEqual(fileName, "gen0_sol0.json") || (
        console.error(`File name ${fileName} not equal to "gen0_sol0.json"`)
    );
}
function test_create_default_activity() {
    const activity = Activity.default({ id: 0 });
    assertEqual(activity.id, 0) || (
        console.error(`Activity id ${activity.id} not equal to 0`)
    );
}
function test_create_flight_and_element_with_multileg_id() {
    const flight = Flight.default({ id: 0, multileg_id: 0 });
    if (isNullish(minutesInDataPeriod)) {
        minutesInDataPeriod = 60 * 24 * 3;
    }
    assertEqual(flight.multilegId, 0) || (
        console.error(`flight.multilegId ${flight.multilegId} not equal to 0`)
    );
    const flightElement = createFlightElement(flight);
    assertEqual(flightElement.dataset.multilegId, "0") || (
        console.error(`flightElement.dataset.multilegId ${flightElement.dataset.multilegId} not equal to "0"`)
    );
    assertTrue(flightElement.classList.contains("multileg")) || (
        console.error(`flightElement.classList ${flightElement.classList} does not have class "multileg"`)
    );
}
function test_create_flight_and_element_with_multileg_id_string() {
    const flight = Flight.default({ id: 0, multileg_id: "0" });
    if (isNullish(minutesInDataPeriod)) {
        minutesInDataPeriod = 60 * 24 * 3;
    }
    assertEqual(flight.multilegId, "0") || (
        console.error(`flight.multilegId ${flight.multilegId} not equal to 0`)
    );
    const flightElement = createFlightElement(flight);
    assertEqual(flightElement.dataset.multilegId, "0") || (
        console.error(`flightElement.dataset.multilegId ${flightElement.dataset.multilegId} not equal to "0"`)
    );
    assertTrue(flightElement.classList.contains("multileg")) || (
        console.error(`flightElement.classList ${flightElement.classList} does not have class "multileg"`)
    );
}
function test_create_flight_and_element_with_multileg_id_null() {
    const flight = Flight.default({ id: 1, multileg_id: null });
    assertEqual(flight.multilegId, null) || (
        console.error(`flight.multilegId ${flight.multilegId} not equal to null`)
    );
    const flightElement = createFlightElement(flight, "unassigned");
    assertEqual(flightElement.dataset.multilegId, undefined) || (
        console.error(`flightElement.dataset.multilegId ${flightElement.dataset.multilegId} not equal to undefined`)
    );
    assertTrue(!flightElement.classList.contains("multileg")) || (
        console.error(`flightElement.classList ${flightElement.classList} has class "multileg"`)
    );
}
function test_create_flight_and_element_with_multileg_id_undefined() {
    const flight = Flight.default({ id: 2, multileg_id: undefined });
    assertEqual(flight.multilegId, undefined) || (
        console.error(`flight.multilegId ${flight.multilegId} not equal to undefined`)
    );
    const flightElement = createFlightElement(flight, "unassigned");
    assertEqual(flightElement.dataset.multilegId, undefined) || (
        console.error(`flightElement.dataset.multilegId ${flightElement.dataset.multilegId} not equal to undefined`)
    );
    assertTrue(!flightElement.classList.contains("multileg")) || (
        console.error(`flightElement.classList ${flightElement.classList} has class "multileg"`)
    );
}
function test_create_maintenance_element() {
    const maintenance = Maintenance.default({ id: 0 });
    const maintenanceElement = createMaintenanceElement(maintenance);
    assertEqual(maintenanceElement.id, "maintenance-0") || (
        console.error(`maintenanceElement.id ${maintenanceElement.id} not equal to "maintenance-0"`)
    );
    assertTrue(maintenanceElement.classList.contains("maintenance")) || (
        console.error(`maintenanceElement.classList ${maintenanceElement.classList} does not have class "maintenance"`)
    );
}
function testStringToKeywords() {
    let keywords = stringToKeywords(" ");
    assertSetEquals(keywords, "") || (
        console.error(`keywords ${[...keywords]} not equal to ""`)
    );
    keywords = stringToKeywords("maintenance");
    assertSetEquals(keywords, "maintenance") || (
        console.error(`keywords ${[...keywords]} not equal to "maintenance"`)
    );
    keywords = stringToKeywords("hello world");
    assertSetEquals(keywords, "hello,world") || (
        console.error(`keywords ${[...keywords]} not equal to "hello,world"`)
    );
    keywords = stringToKeywords("hello world ");
    assertSetEquals(keywords, "hello,world") || (
        console.error(`keywords ${[...keywords]} not equal to "hello,world"`)
    );
}
function testMaintenanceKeywords() {
    const maintenance = Maintenance.default({ id: 0 });
    const keywords = maintenance.toKeywords();
    const string = "id-0,00:00,01:00,aaaaa,aog,arn";
    assertSetEquals(keywords, string) || (
        console.error(`keywords ${[...keywords]} not equal to "${string}"`)
    );
}
function testFlightKeywords() {
    const flight = Flight.default({ id: 0 });
    const keywords = flight.toKeywords();
    const string = "id-0,00:00,01:00,del,bom,a320";
    assertSetEquals(keywords, string) || (
        console.error(`keywords ${[...keywords]} not equal to "${string}"`)
    );

}
function test_create_rotation() {
    const rotation = Rotation.default();
    assertEqual(rotation.id, 0) || (
        console.error(`Rotation id ${rotation.id} not equal to 0`)
    );
    assertEqual(rotation.length(), 0) || (
        console.error(`Rotation activities length ${rotation.length()} not equal to 0`)
    );
    const start1 = "2023-01-01T00:00:00"
    const end1 = "2023-01-01T01:00:00"
    const flight1 = Flight.default({
        id: 1,
        start: start1,
        end: end1,
    });
    rotation.addActivity(flight1);
    assertEqual(rotation.length(), 1) || (
        console.error(`Rotation activities length ${rotation.length()} not equal to 1`)
    );
    const _start1 = new Date(start1 + "Z");
    const _end1 = new Date(end1 + "Z");
    assertEqual(rotation.start().getTime(), _start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${_start1}`)
    );
    assertEqual(rotation.end().getTime(), _end1.getTime()) || (
        console.error(`Rotation start ${rotation.end()} not equal to ${_end1}`)
    );
    const start2 = "2023-01-01T02:00:00"
    const end2 = "2023-01-01T03:00:00"
    const flight2 = Flight.default({
        id: 2,
        start: start2,
        end: end2,
    })
    const _end2 = new Date(end2 + "Z");
    assertEqual(rotation.start().getTime(), _start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${_start1}`)
    );
    rotation.addActivity(flight2)
    assertEqual(rotation.end().getTime(), _end2.getTime()) || (
        console.error(`Rotation end ${rotation.end()} not equal to ${_end2}`)
    );
}
function test_rotation_sort() {
    const rotation = Rotation.default();
    const start1 = "2023-01-01T02:00:00"
    const end1 = "2023-01-01T03:00:00"
    const flight1 = Flight.default({
        id: 1,
        start: start1,
        end: end1,
    });
    rotation.addActivity(flight1);
    const _start1 = new Date(start1 + "Z");
    const _end1 = new Date(end1 + "Z");
    assertEqual(rotation.start().getTime(), _start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${_start1}`)
    );
    assertEqual(rotation.end().getTime(), _end1.getTime()) || (
        console.error(`Rotation start ${rotation.end()} not equal to ${_end1}`)
    );
    const start2 = "2023-01-01T00:00:00"
    const end2 = "2023-01-01T01:00:00"
    const flight2 = Flight.default({
        id: 2,
        start: start2,
        end: end2,
    })
    rotation.addActivity(flight2);
    const __start2 = new Date(start2 + "Z");
    assertEqual(rotation.start().getTime(), __start2.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${__start2}`)
    );
    rotation.addActivity(flight2)
    assertEqual(rotation.end().getTime(), _end1.getTime()) || (
        console.error(`Rotation end ${rotation.end()} not equal to ${_end1}`)
    );
}
function test_rotation_duration() {
    const rotation = Rotation.default();
    const start1 = "2023-01-01T00:00:00"
    const end1 = "2023-01-01T01:00:00"
    const flight1 = Flight.default({
        id: 1,
        start: start1,
        end: end1,
    });
    rotation.addActivity(flight1);
    const _start1 = new Date(start1 + "Z");
    const _end1 = new Date(end1 + "Z");
    const duration = (_end1 - _start1) / 60 / 1000; // Convert milliseconds to minutes
    assertEqual(rotation.duration(), duration) || (
        console.error(`Rotation duration ${rotation.duration()} not equal to ${duration}`)
    );
}
function test_create_flight_content() {
    const flight = Flight.default({
        id: 0,
        adep: "GOT",
        fl_num: "123",
        ades: "ARN",
        start: "2023-01-01T00:00:00",
        end: "2023-01-01T01:00:00",
        planned_actype: "777",
    });
    const expected = `
        <div class="left">
            <div>GOT</div>
            <div>00:00</div>
        </div>
        <div class="center">
            <div>0-123</div>
            <div>777</div>
        </div>
        <div class="right">
            <div>ARN</div>
            <div>01:00</div>
        </div>
    `;
    const actual = createFlightContent(flight);
    assertEqual(actual, expected) || (
        console.error(`Flight content ${actual} not equal to ${expected}`)
    );
}
function test_get_elem_ids() {
    const flight = Flight.default({ id: 0 });
    const flightExpected = "flight-0";
    const flightElemId = getFlightElemId(flight.id);
    assertEqual(flightElemId, flightExpected) || (
        console.error(`Flight elem id ${flightElemId} not equal to ${flightExpected}`)
    );
    const rotation = Rotation.default({ id: 0 })
    const rotationExpected = "rotation-0";
    const rotationElemId = getRotationElemId(rotation.id);
    assertEqual(rotationElemId, rotationExpected) || (
        console.error(`Rotation elem id ${rotationElemId} not equal to ${rotationExpected}`)
    );
    const maint = Maintenance.default({ id: 0 });
    const maintExpected = "maintenance-0";
    const maintElemId = getMaintElemId(maint.id);
    assertEqual(maintElemId, maintExpected) || (
        console.error(`Maintenance elem id ${maintElemId} not equal to ${maintExpected}`)
    );
}
function test_get_elem_ids() {
    const flightElem = document.createElement("div");
    flightElem.id = "flight-0"
    const flightExpected = "0";
    const flightId = getFlightId(flightElem);
    assertEqual(flightId, flightExpected) || (
        console.error(`Flight id ${flightId} not equal to ${flightExpected}`)
    );
    const rotationElem = document.createElement("div");
    rotationElem.id = "rotation-1"
    const rotationExpected = "1";
    const rotationId = getRotationId(rotationElem);
    assertEqual(rotationId, rotationExpected) || (
        console.error(`Rotation id ${rotationId} not equal to ${rotationExpected}`)
    );
    const maintElem = document.createElement("div");
    maintElem.id = "maintenance-2"
    const maintExpected = "2";
    const maintId = getMaintId(maintElem);
    assertEqual(maintId, maintExpected) || (
        console.error(`Maintenance id ${maintId} not equal to ${maintExpected}`)
    );
}
function test_create_maintenance_content() {
    const maint = Maintenance.default({
        start: "2023-01-01T00:00:00",
        end: "2023-01-01T01:00:00",
        type: "A-CHK",
        station: "GOT",
    })
    const expected = `
        <div class="left">
            <div>00:00</div>
        </div>
        <div class="center">
            <div>A-CHK</div>
            <div>GOT</div>
        </div>
        <div class="right">
            <div>01:00</div>
        </div>
    `;
    const actual = createMaintenanceContent(maint);
    assertEqual(actual, expected) || (
        console.error(`Flight content ${actual} not equal to ${expected}`)
    );
}
function test_sort_by_key() {
    const items = {
        a: { group: "A", value: 3 },
        b: { group: "B", value: 1 },
        c: { group: "A", value: 2 },
        d: { group: "B", value: 4 },
    };
    let sortedItems = sortByKey(items, "value");
    let sortedKeys = Object.keys(sortedItems);
    let expectedKeys = ["b", "c", "a", "d"];
    assertEqual(sortedKeys, expectedKeys) || (
        console.error(`Sorted keys ${sortedKeys} not equal to ${expectedKeys}`)
    );
    sortedItems = sortByKey(items, "group value");
    sortedKeys = Object.keys(sortedItems);
    expectedKeys = ["c", "a", "b", "d"];
    assertEqual(sortedKeys, expectedKeys) || (
        console.error(`Sorted keys ${sortedKeys} not equal to ${expectedKeys}`)
    );
}
function test_sort_by_key_nested() {
    const items = {
        a: { car: { name: "A", type: "sedan"}, price: 3 },
        b: { car: { name: "B", type: "suv"}, price: 1 },
        c: { car: { name: "C", type: "hatchback"}, price: 2 },
        d: { car: { name: "D", type: "convertible"}, price: 4 },
    };
    let sortedItems = sortByKey(items, "price");
    let sortedKeys = Object.keys(sortedItems);
    let expectedKeys = ["b", "c", "a", "d"];
    assertEqual(sortedKeys, expectedKeys) || (
        console.error(`Sorted keys ${sortedKeys} not equal to ${expectedKeys}`)
    );
    sortedItems = sortByKey(items, "name");
    sortedKeys = Object.keys(sortedItems);
    expectedKeys = ["a", "b", "c", "d"];
    assertEqual(sortedKeys, expectedKeys) || (
        console.error(`Sorted keys ${sortedKeys} not equal to ${expectedKeys}`)
    );
    sortedItems = sortByKey(items, "car.type");
    sortedKeys = Object.keys(sortedItems);
    expectedKeys = ["d", "c", "a", "b"];
    assertEqual(sortedKeys, expectedKeys) || (
        console.error(`Sorted keys ${sortedKeys} not equal to ${expectedKeys}`)
    );
}
setTimeout(runTests, 2000);
///////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', function() {
    Chart.defaults.color = 'white';
});