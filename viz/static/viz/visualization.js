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

// Load previous state from localStorage
const initScrollLeft = getFloatFromStorage('scrollLeft');
const initScrollTop = getFloatFromStorage('scrollTop');
let currentGenerationKey = getStringFromStorage('currentGenerationKey');
let currentSolutionId = getStringFromStorage('currentSolutionId');
let daySpacing = getFloatFromStorage('daySpacing', defaultDaySpacing);
let liveModeIsOn = getBoolFromStorage('liveModeIsOn', false);
let loadedOutputPath = getStringFromStorage('loadedOutputPath');
let resourceHeight = getFloatFromStorage('resourceHeight', defaultResourceHeight);
let loadedOptRunId = getIntFromStorage('loadedOptRunId');
let selectedOptRunId = getIntFromStorage('selectedOptRunId');

document.documentElement.style.setProperty('--activity-height', `${resourceHeight}px`);
//----------------------------------------------

const maxZoomX = 4000;
const minZoomX = 20;
const maxZoomY = 100;
const minZoomY = 11;

let loadedOutput = {};
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
let currentKpisSolutionFileName = null;
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
let loadedResources;
let loadedRegnos2resources; // E.g. {"AAAA": resource1}
let generation;
let loadedGenerations = {};
let genKey;
let loadedSolutions = [];
let loadedSolutionFileName = "";
let loadedMeta = {};
let menuMeta = {};
let currentActivitiesMap = {};
let menuOutputPath = loadedOutputPath;
let minutesInDataPeriod;
let timeoutIds = [];
let markedGenerationId;
let markedSolutions = [];
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
const numUnassignedThreshold = 40;
const finderElement = document.getElementById('finder');
const finderInputElement = finderElement.querySelector('input');
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

    if (event.shiftKey && event.key === "F") {
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
    if (value === "null" || value === null || value === "NaN") {
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
    return new Chart(canvas, config);
}
function createGraphCanvas(id) {
    const canvas = document.getElementById(id);
    // canvas.addEventListener('mouseenter', () => {
    //     clearTimeout(solutionMouseLeaveTimeout);
    //     solutionMouseEnterTimeout = setTimeout(() => {
    //         menuGraph.classList.add('active');
    //     }, solutionMouseEnterDelay);

    // });
    // canvas.addEventListener('mouseleave', () => {
    //     clearTimeout(solutionMouseEnterTimeout);
    //     solutionMouseLeaveTimeout = setTimeout(() => {
    //         menuGraph.classList.remove('active');
    //     }, solutionMouseLeaveDelay);
    // });
    return canvas
}
function renderStdDeviationGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('std-deviation-canvas');
    stdCanvas = createGraph(xValues, yValues, canvas, 'Standard deviation', 'blue');
}
function renderBestFitnessGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('best-fitness-canvas');
    bestFitnessCanvas = createGraph(xValues, yValues, canvas, 'Best fitness', 'red');
}
function renderMeanGraph(yValues) {
    const xValues = range(0, yValues.length);
    const canvas = createGraphCanvas('mean-canvas');
    meanCanvas = createGraph(xValues, yValues, canvas, 'Mean fitness', 'green');
}
function getIntFromStorage(key, defaultValue=0) {
    let value = localStorage.getItem(key);
    if (isNullish(value)) {
        return defaultValue;
    }
    return parseInt(value);
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
    await loadOptRunsInMenu(selectedOptRunId);
});

const menuGraph = document.getElementById('menu-graph');
const optRunSelectElement = document.getElementById('select-opt-run');
const runButtonElement = document.getElementById('run-button');
const selectAllElement = document.getElementById('select-all');
const solutionsFieldsetElement = document.getElementById('solutions-fieldset');
const progress = document.getElementById('progress');

const activityResourceSpacing = parseFloat(
    rootStyles.getPropertyValue('--activity-resource-spacing')
);
let horizontalLines = [];
let useAnimation = getBoolFromStorage('useAnimation', true);
const defaultDrawInterval = 3000;
let solutionDrawInterval = getFloatFromStorage('solutionDrawInterval', defaultDrawInterval);

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

const selectLiveElement = document.getElementById('select-live');
if (liveModeIsOn) {
    selectLiveElement.checked = true;
} else {
    selectLiveElement.checked = false;
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
    if (isRunning) {
        console.log('IsRunning === true, will not startLive');
        return;
    }
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
}

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

async function runGenerations(generations) {
    console.log('Running generations:', generations);
    const numSolutions = Object.values(generations).flat().length;
    const solutionFileNames = Object.values(generations).flat();
    const solutions = await fetchAndCreateSolutions(loadedOutputPath, solutionFileNames);

    let num = 1;
    setProgress(1, numSolutions);
    for (const solution of solutions) {
        timeoutIds.push(setTimeout((num, numSolutions, sol) => {
            setCurrentGenerationKey(sol.genKey);
            setCurrentSolutionId(sol.ix);
            replaceCurrentSolution(sol);
            updateInfo(loadedOutputPath, sol.genKey, sol);
            increaseProgress();
            console.log("num", num, "numSolutions", numSolutions);
            if (num === numSolutions) {
                console.log("Last solution drawn, creatingStationLabels...");
                console.log("solution", sol);
                createStationLabels(sol.chains);
            }
        }, solutionDrawInterval * num, num, numSolutions, solution));
        num++;
    }
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
solutionsFieldsetElement.addEventListener('change', (event) => {
    const solutionInputs = solutionsFieldsetElement.querySelectorAll('input[type="checkbox"]');
    const checkedSolutions = solutionsFieldsetElement.querySelectorAll('input[type="checkbox"]:checked');
    if (checkedSolutions.length === solutionInputs.length) {
        selectAllElement.checked = true;
    } else {
        selectAllElement.checked = false;
    }
    if (checkedSolutions.length > 0) {
        runButtonElement.classList.add('active');
    } else {
        runButtonElement.classList.remove('active');
    }
});
optRunSelectElement.addEventListener('mouseenter', async () => {
    await loadOptRunsInMenu(selectedOptRunId);
});
function loadOptRun(runId) {
    const optRun = optRunsInMenu[runId];
    setLoadedOptRunId(runId);
    console.log("optRun", optRun);
    if (optRun.output_files.length === 0) {
        console.log("No output files in optRun");
        return;
    }
}
function loadSolutionsInMenu(optRunId) {
    const optRun = optRunsInMenu[optRunId];
    console.log("optRun", optRun);
    if (optRun.output_files.length === 0) {
        console.log("No output files in optRun");
        return;
    }
    for (const div of solutionsFieldsetElement.querySelectorAll('div')) {
        div.remove();
    }
    for (const outputFile of optRun.output_files) {
        const div = document.createElement('div');
        div.classList.add('solution');
        const fileName = outputFile.file.split('/').pop();
        div.id = `solution-${outputFile.id}`;
        div.innerHTML = fileName;
        solutionsFieldsetElement.appendChild(div);
    }

}

optRunSelectElement.addEventListener('change', async (event) => {
    const optId = event.target.value;
    console.log("OptRunSelectElement changed value to:", optId);
    setSelectedOptRunId(optId);
    loadSolutionsInMenu(optId);
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
    return resourceId * resourceHeight + spacing;
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
    maintenanceElement.dataset.nextSobt = maint.nextSobt;
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
        const nextActivitySobt = activity.nextSobt;
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
    element.regno = resource.regno;
    element.style.top = `${resource2TopPosition(resource.id)}px`;
    element.keywords.add(getSubStringSet(resource.regno.toLowerCase()));
}
function createFlightElement(flight) {
    const flightElement = document.createElement('div');
    flightElement.id = getFlightElemId(flight.id);
    flightElement.dataset.activityType = flight.activityType;
    flightElement.dataset.nextSobt = flight.nextSobt;
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

    const keywords = flight.toKeywords();
    flightElement.keywords = createKeywordsForAllCharsAndSubChars(
        keywords
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

function getResource(resourceId, resources) {
    if (resourceId === "unassigned") {
        return unassignedResource;
    }
    const resource = resources[resourceId];
    if (!resource) {
        console.error('Resource not found:', resourceId, "returning unassignedResource");
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

function addGenerations2Fieldset(generations) {
    for (const genKey of Object.keys(generations)) {
        const fieldset = document.createElement('fieldset');
        fieldset.genKey = genKey
        fieldset.innerHTML = `
            <legend>${genKey}</legend>
        `;
        const solutionsData = generations[genKey];
        for (const solutionIx in solutionsData) {
            const div = createSolutionCheckboxDiv(genKey, solutionIx);
            fieldset.appendChild(div);
        }
        solutionsFieldsetElement.appendChild(fieldset);
    }

}
class Resource {
    constructor(inData) {
        const data = { ...inData };
        assertRequiredFields(data, ['id']);
        this.id = inData.id;
        this.regno = inData.regno;
        this.ac_type = inData.ac_type;
        this.last_known_station = inData.last_known_station;
    }
    static default(inData = {}) {
        const data = { ...inData };
        return new Resource({
            id: data.id ?? "0",
            ac_type: data.ac_type ?? "A320",
            regno: data.regno ?? "AAAAA",
            last_known_station: data.last_known_station ?? "DEL",
        });
    }
    static fromData(data) {
        const resources = {};
        for (const resourceId in data) {
            const resourceData = data[resourceId];
            resourceData.id = resourceId;
            resources[resourceId] = new Resource(resourceData);
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
            currentActivity.nextSobt = nextActivity.start;
            currentActivity.nextId = nextActivity.id;
            nextActivity.prevSibt = currentActivity.end;
            nextActivity.prevId = currentActivity.id;
            if (currentActivity.end > nextActivity.start) {
                console.warn('Overlapping activities:', currentActivity, nextActivity);
            }
        }
    }
    addActivity(activity) {
        // Insert the activity into the chain, maintaining sorted order by Sobt
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
function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0
    );
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
        assertRequiredFields(inData, ['id', 'sobt', 'sibt']);
        const data = { ...inData };
        this.data = data;
        this.id = data.id;
        this.start = new Date(data.sobt + "Z");
        this.end = new Date(data.sibt + "Z");
        this.rotation = data.rotation;
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
        data.sobt = data.sobt ?? "2025-01-01T00:00:00";
        data.sibt = data.sibt ?? "2025-01-01T01:00:00";
        return new Activity(data);
    }
};

class Maintenance extends Activity {
    constructor(inData) {
        assertRequiredFields(inData, ['id', 'sobt', 'sibt', 'type', 'station', 'ac']);
        const data = { ...inData };
        super(data);
        this.activityType = "maintenance"
        this.station = data.station;
        this.type = data.type;
        this.ac = data.ac;
    }
    static default(inData = {}) {
        const data = { ...inData };
        return new Maintenance({
            id: data.id ?? "0",
            ac: data.ac ?? "AAAAA",
            type: data.type ?? "AOG",
            station: data.station ?? "ARN",
            sobt: data.sobt ?? "2025-01-01T00:00:00",
            sibt: data.sibt ?? "2025-01-01T01:00:00",
        });
    }
    toKeywords() {
        const activityKeywords = super.toKeywords();
        activityKeywords.add(this.ac.toLowerCase());
        activityKeywords.add(this.type.toLowerCase());
        activityKeywords.add(this.station.toLowerCase());
        activityKeywords.add(this.ac.toLowerCase());
        return activityKeywords;
    }
    static fromData(maintenancesData) {
        if (!maintenancesData) {
            return {};
        }
        const maintenances = {};
        const maintenanceIds = Object.keys(maintenancesData);
        for (const maintenanceId in maintenanceIds) {
            const maintenanceData = maintenancesData[maintenanceId];
            maintenanceData.id = maintenanceId;
            console.log("maintenanceData", maintenanceData);
            maintenances[maintenanceId] = new Maintenance(maintenanceData);
        }
        return maintenances;
    }
}
class Flight extends Activity {
    constructor(inData) {
        assertRequiredFields(inData, [
            'id',
            'sobt',
            'sibt',
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
        this.multilegId = data.multileg_id;
    }
    toKeywords() {
        const activityKeywords = super.toKeywords();
        activityKeywords.add(this.fl_num.toString());
        activityKeywords.add(this.adep.toLowerCase());
        activityKeywords.add(this.ades.toLowerCase());
        activityKeywords.add(this.plannedActype.toLowerCase());
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
            sobt: data.sobt ?? "2025-01-01T00:00:00",
            sibt: data.sibt ?? "2025-01-01T01:00:00",
            seqnum: data.seqnum,
            multileg_id: data.multileg_id,
        });
    }
    static fromData(activitiesData) {
        const activities = {};
        const activityIds = Object.keys(activitiesData);
        for (const activityId in activityIds) {
            const activityData = activitiesData[activityId];
            activityData.id = activityId;
            activities[activityId] = new Flight(activityData);
        }
        return activities;
    }
};
class Solution {
    constructor(genKey, ix, chains, kpis = {}) {
        this.genKey = genKey;
        if (ix instanceof Array) {
            console.error("Solution index is an array:", ix);
            console.trace("Solution index is an array:");
        }
        this.ix = ix; // Solution index in generation
        this.cost = cost;
        this.chains = chains;
        this.kpis = kpis;
    }
    unassignedChain() {
        return this.chains[this.chains.length - 1];
    }
    static from(genKey, solutionIx, solutionData, activities, resources) {
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
                let maintenances = loadedRegnos2Maintenances[resource.regno];
                if (maintenances) {
                    maintenances.forEach(maintenance => {
                        chain.addActivity(maintenance);
                    });
                }
            }
            chain.setChainDependentValues();
            chains.push(chain);
        };
        const solution = createSolution(solutionData, genKey, solutionIx);
        return solution;
    }
}

function createKpiRow(key, value) {
    const row = document.createElement('tr');
    const cell1 = document.createElement('td');
    cell1.innerText = key;
    row.appendChild(cell1);

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
function setActiveSolutionElement(element) {
    activeSolutionElement?.classList.remove('active');
    activeSolutionElement = element;
    activeSolutionElement?.classList.add('active');
}
function createKpisIconDiv() {
    const div = document.createElement('div');
    div.classList.add('kpis-icon');
    div.addEventListener('click', async (event) => {
        event.preventDefault();
        const parentElement = div.parentElement;
        const genKey = parentElement.dataset.genKey;
        const solIx = parentElement.dataset.solIx;
        const solutionFileName = toSolutionFileName(genKey, solIx);
        if (kpiMenuElement.classList.contains("show")) {
            if (currentKpisSolutionFileName === menuOutputPath + solutionFileName) {
                kpiMenuElement.classList.remove("show");
            } else {
                kpiMenuElement.classList.add("show");
                currentKpisSolutionFileName = menuOutputPath + solutionFileName;
            }
        } else {
            kpiMenuElement.classList.add("show");
            currentKpisSolutionFileName = menuOutputPath + solutionFileName;
        }
        const kpis = await fetchKpis(menuOutputPath, solutionFileName);
        replaceKpis(kpis);
    });
    return div;
}
async function loadSolutions(outputPath, solutionKeys) {
    console.log("Loading solutions:", solutionKeys);
    loadedSolutions = await createSolutions(outputPath, solutionKeys);
    console.log("Loaded solutions:", loadedSolutions);
    return loadedSolutions;
}
function createSolution(data, genKey, solutionIx, resources, activities) {
    const chainData = data.chains;
    const kpis = data.kpis;
    const chains = [];
    for (const resourceId in chainData) {
        const resource = getResource(resourceId, resources);
        const chain = new Chain(resourceId);
        const activityIds = chainData[resourceId];
        for (const activityId of activityIds) {
            const activity = activities[activityId];
            chain.addActivity(activity);
        }
        if (resourceId !== "unassigned") {
            let maintenances = loadedRegnos2Maintenances[resource.regno];
            if (maintenances) {
                maintenances.forEach(maintenance => {
                    chain.addActivity(maintenance);
                });
            }
        }
        chain.setChainDependentValues();
        chains.push(chain);
    };
    const solution = new Solution(
        genKey,
        solutionIx,
        chains,
        kpis,
    );
    return solution;
}
async function createSolutions(outputPath, solutionKeys) {
    // solutionKeys: Array[(genKey, solutionIx)]
    const solutions = await Promise.all(
        solutionKeys.map(async ([genKey, solutionIxs]) => {
            const solutions = []
            solutionIxs.forEach(async (solutionIx) => {
                const solutionData = await fetchSolutionData(outputPath, genKey, solutionIx);
                const solution = createSolution(solutionData, genKey, solutionIx, loadedResources, loadedActivities);
                solutions.push(solution);

            })
            return solutions;
        }
    ));
    return solutions;
}
function setSelectedOptRunId(id) {
    console.log("Setting selectedOptRunId:", id);
    selectedOptRunId = id;
    localStorage.setItem('selectedOptRunId', id);
}
let optRunsInMenu;
async function loadOptRunsInMenu(selectValue = "") {
    console.log("Loading opt runs in menu and selecting:", selectValue);

    const fetchedOptRuns = await fetchOptRuns();
    if (!fetchedOptRuns) {
        console.error("No opt runs found");
        return;
    }

    fetchedOptRuns.sort((a, b) =>
        (a.run_directory || '').localeCompare(b.run_directory || '')
    );

    // Clear and rebuild the select
    optRunSelectElement.innerHTML = '';
    const optRuns = {};

    for (const optRun of fetchedOptRuns) {
        const option = document.createElement('option');
        option.value = optRun.id;
        option.textContent = optRun.id + ' ' + optRun.run_directory;
        if (optRun.run_directory === selectValue) {
            option.selected = true;
            setSelectedOptRunId(optRun.id);
        }
        optRunSelectElement.appendChild(option);
        optRuns[optRun.id] = optRun;
    }
    optRunsInMenu = optRuns;
    if (selectValue) {
        menuOutputPath = selectValue;
        optRunSelectElement.value = selectValue;
        loadSolutionsInMenu(selectValue);
    }
    console.log('selectValue:', selectValue);
}

function createAircraftElement(resource) {
    const aircraftElement = document.createElement('div');
    aircraftElement.className = 'aircraft';
    aircraftElement.id = `aircraft-${resource.id}`;
    if (resource.id === "unassigned") {
        aircraftElement.textContent = "UNASSIGNED";
    } else {
        aircraftElement.innerHTML = `
            <div>${resource.id}-${resource.ac_type}-${resource.regno}-${resource.last_known_station}</div>
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
function drawSolution(solution) {
    console.log('Drawing solution:', solution);
    clearTimeouts(); // Clear any existing timeouts
    clearStationLabels();
    chart.innerHTML = '';
    const numResources = Object.keys(loadedResources).length + 1;
    drawHorizontalLines(numResources);
    drawVerticalLines();
    aircraftColumn.innerHTML = '';
    currentActivitiesMap = {};

    numDrawnInUnassigned = 0;
    for (const chain of solution.chains) {
        const resourceId = chain.resourceId;
        let resource = getResource(resourceId, loadedResources);

        const aircraftElement = createAircraftElement(resource);
        aircraftColumn.appendChild(aircraftElement);
        chain.activities.forEach(activity => {
            if (!(activity instanceof Flight)) {
                return;
            }
            if (resourceId === "unassigned" && numDrawnInUnassigned > numUnassignedThreshold) {
                return;
            }

            const flightElement = createFlightElement(activity);
            assignFlightElementToResource(flightElement, resource);
            chart.appendChild(flightElement);
            if (resourceId === "unassigned") {
                numDrawnInUnassigned++;
            }
        })
        const regno = resource.regno;
        if (regno in loadedRegnos2Maintenances) {
            const maintenances = loadedRegnos2Maintenances[regno];
            for (const maint of maintenances) {
                const maintElement = createMaintenanceElement(maint);
                assignMaintenanceElementToResource(maintElement, resource);
                chart.appendChild(maintElement);
            };
        }
    }
    const flightIds2ResourceIds = mapActivityIds2ResourceIds(solution);
    for (const rotationId in loadedRotations) {
        const rotation = loadedRotations[rotationId];
        const firstFlight = rotation.first();
        let resourceId = flightIds2ResourceIds[firstFlight.id];
        if (!resourceId) {
            // console.log("Rotation ", rotationId, "not found in solution for flightId", firstFlight.id);
            continue;
        }
        const rotationElement = createRotationElement(rotation);
        rotationElement.style.top = `${resource2TopPosition(resourceId)}px`;
        rotationElement.dataset.resourceId = resourceId;
        const width = duration2Width(rotation.duration());
        rotationElement.style.left = `${startTime2Position(rotation.start())}px`;
        rotationElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        rotationElement.style.height = `${height}px`;
        chart.appendChild(rotationElement);
    }
    createStationLabels(solution.chains);
    updateInfo(loadedOutputPath, genKey, solution);
}
async function get(url) {
    let startedTimer = false;
    try {
        console.time("GET");
        startedTimer = true;

        console.log("Fetching url:", url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.DJANGO.csrfToken,
            },
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        return response;
    } catch (error) {
        console.error('Error fetching file:', error);
        throw error;
    } finally {
        if (startedTimer) {
            console.timeEnd("GET");
        }
    }
}
async function fetchOptRuns() {
    console.time("fetchOptRuns");
    const response = await get(window.DJANGO.optRunsUrl);
    if (response.ok) {
        const data = await response.json();
        console.timeEnd("fetchOptRuns");
        return data;
    }
    console.error('Error fetching opt runs:', response.statusText);
}
async function fetchMeta(outputPath) {
    try {
        console.log("Fetching meta for:", outputPath);
        const response = await fetch('http://localhost:8000' + outputPath + '/meta.json');
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

async function fetchMaintenances(outputPath) {
    try {
        const response = await fetch('http://localhost:8000' + outputPath + '/maintenances.json');
        if (response.status == 404) {
            return {};
        }
        if (!response.ok) {
            throw new Error('Unknow error when fetching maintenances');
        }
        const data = await response.json(); // Parse JSON data
        return data;
    } catch (error) {
        console.error('Error fetching maintenances or parsing JSON file:', error);
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
        if (!resourceId) {
            console.error("Could not find resource id for", flight.id)
        }
        const width = duration2Width(flight.duration);
        flightElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        flightElement.style.height = `${height}px`;
        flightElement.style.top = `${resource2TopPosition(resourceId)}px`;
        updateFlightContent(flightElement, width, height);
        if (flightElement.dataset.nextSobt === "undefined") {
            return;
        }
        const nextSobt = new Date(flightElement.dataset.nextSobt);
        const gapDuration = nextSobt - flight.end;
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
        const maint = maintenances[getMaintId(maintElement)];
        const resource = loadedRegnos2resources[maint.ac];
        maintElement.style.left = `${startTime2Position(maint.start)}px`;
        const width = duration2Width(maint.duration);
        maintElement.style.width = `${width}px`;
        const height = resourceHeight - activityResourceSpacing;
        maintElement.style.height = `${height}px`;
        maintElement.style.top = `${resource2TopPosition(resource.id)}px`;
        updateMaintenanceContent(maintElement, width, height);
        if (maintElement.dataset.nextSobt === "undefined") {
            return;
        }
        console.log(maintElement.dataset.nextSobt);
        const nextSobt = new Date(maintElement.dataset.nextSobt);
        console.log("nextSobt", nextSobt);
        const gapDuration = nextSobt - maint.end;
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
if (gantt) {
    gantt.addEventListener('scroll', () => {
        aircraftColumn.scrollTop = gantt.scrollTop;
        localStorage.setItem("scrollTop", gantt.scrollTop);
        localStorage.setItem("scrollLeft", gantt.scrollLeft);
    });
    gantt.addEventListener('wheel', (event) => {
        // Check if Ctrl key (Windows/Linux) or Command key (Mac) is pressed
        if (event.ctrlKey && event.shiftKey || event.metaKey && event.shiftKey ) {
            event.preventDefault();  // Prevent default scroll behavior
            let scrollFactorY = 0.5;  // Slow down the scrolling effect
            if (event.deltaY < 0) {
                setResourceHeight(Math.min(resourceHeight + scrollFactorY, maxZoomY));
            } else if (event.deltaY > 0) {
                setResourceHeight(Math.max(resourceHeight - scrollFactorY, minZoomY));
            } else if (event.wheelDeltaX > 0) {
                // When shift is pressed, wheelDeltaX changes when scrolling up/down with mouse
                setResourceHeight(Math.min(resourceHeight - scrollFactorY, maxZoomY));
            } else if (event.wheelDeltaX < 0) {
                // When shift is pressed, wheelDeltaX changes when scrolling up/down with mouse
                setResourceHeight(Math.max(resourceHeight + scrollFactorY, minZoomY));
            }
        } else if (event.ctrlKey || event.metaKey) {
            event.preventDefault();  // Prevent default scroll behavior
            if (event.deltaX !== 0) {
                // Touch pad left/right
                const scrollFactorX = event.deltaX * 10 ; // Slow down the scrolling effect
                zoomHorizontal(scrollFactorX);
            } else {
                // Mouse wheel up/down
                zoomHorizontal(event.wheelDeltaY);
            }
        }
    });

}
window.addEventListener('keydown', (event) => {
    // Check if Command (on Mac) or Meta key is held
    const isMacCommand = event.metaKey;

    if (isMacCommand && event.key === 'ArrowLeft') {
        event.preventDefault();
        zoomHorizontal(30);
    }

    if (isMacCommand && event.key === 'ArrowRight') {
      event.preventDefault();
      zoomHorizontal(-30);
    }

    if (isMacCommand && event.key === 'ArrowUp') {
        event.preventDefault();
        setResourceHeight(Math.max(resourceHeight - 10, minZoomY));
        console.log('Command + Up pressed');
    }
    if (isMacCommand && event.key === 'ArrowDown') {
        event.preventDefault();
        setResourceHeight(Math.min(resourceHeight + 10, maxZoomY));
        console.log('Command + Down pressed');
    }

  });

  function goBack() {
    // Do your action here
  }

  function goForward() {
    zoomHorizontal(-30);
    console.log('Command + Right pressed');
    // Do your action here
  }

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
function getUniqueGenerations(generations, loadedGenerations) {
    const loadedGenerationKeys = Object.keys(loadedGenerations);
    return Object.fromEntries(
        Object.entries(generations).filter(([key, value]) => !loadedGenerationKeys.includes(key))
    );
}
async function live() {
    if (liveModeIsOn === false) {
        return;
    }
    console.log('Checking for new generations...');
    const meta = await fetchMeta(loadedOutputPath);
    menuMeta = await fetchMeta(menuOutputPath);
    updateGraphs(menuMeta);
    const loadedGenerations = { ...loadedMeta.generations };
    const generations = { ...meta.generations };
    console.log("loadedGenerations:", loadedGenerations);
    console.log("generations:", generations);
    const newGenerations = getUniqueGenerations(generations, loadedGenerations);
    if (Object.keys(newGenerations).length > 0) {
        console.log('New generations found:', newGenerations);
        addGenerations2Fieldset(newGenerations);
        await runGenerations(newGenerations);
        loadedMeta = meta;
    }
}
async function fetchAndCreateResources(outputPath) {
    const resourcesData = await fetchResources(outputPath);
    return Resource.fromData(resourcesData);
}
function mapRegnos2Resources(resources) {
    const regnos2resources = {}
    for (const resourceId in resources) {
        const resource = resources[resourceId];
        regnos2resources[resource.regno] = resource;
    }
    return regnos2resources;
}
async function loadResources(outputPath) {
    console.log('Loading resources from', outputPath, '...');
    loadedResources = await fetchAndCreateResources(outputPath);
    loadedRegnos2resources = mapRegnos2Resources(loadedResources);
    console.log('Loaded resources:', loadedResources);
    return loadedResources;
}
async function loadActivities(outputPath) {
    console.log('Loading activities from', outputPath, '...');
    loadedActivities = await fetchAndCreateActivities(outputPath);
    console.log('Loaded Activities:', loadedActivities);
    return loadedActivities;
}
async function fetchAndCreateActivities(outputPath) {
    const activitiesData = await fetchActivities(outputPath);
    return Flight.fromData(activitiesData);
}
async function fetchAndCreateMaintenances(outputPath) {
    const maintenancesData = await fetchMaintenances(outputPath);
    return Maintenance.fromData(maintenancesData);
}
async function loadMaintenances(outputPath) {
    console.log('Loading maintenances from', outputPath, '...');
    maintenances = await fetchAndCreateMaintenances(outputPath);
    loadedRegnos2Maintenances = {}
    for (const maintId in maintenances) {
        const maintenance = maintenances[maintId];
        const regno = maintenance.ac;
        if (!(regno in loadedRegnos2Maintenances)) {
            loadedRegnos2Maintenances[regno] = [];
        }
        loadedRegnos2Maintenances[regno].push(maintenance);
    }
    for (const maintId in maintenances) {
        const maintenance = maintenances[maintId];
        const regno = maintenance.ac;
        const resource = loadedRegnos2resources[regno];
        maintenance.resourceId = resource.id;
    }
    console.log('Loaded maintenances:', maintenances);
    return maintenances;
}
async function loadOutput(outputPath) {
    console.log('Loading output from', outputPath, '...');
    loadedOutput = await fetchOutput(outputPath);
    console.log('Loaded output:', loadedOutput);
    return loadedOutput;
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
    for (const activityId in activities) {
        const activity = activities[activityId];
        if (activity.rotation) {
            const rotationId = activity.rotation;
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
async function load(outputPath) {
    await Promise.all([
        loadResources(outputPath),
        loadMetaAndPeriods(outputPath),
    ]);
    await Promise.all([
        loadMaintenances(outputPath),
        loadActivities(outputPath),
    ]);
    loadRotations(loadedActivities),
    clearTimeouts();
    setLoadedOutputPath(outputPath);
}
function setLoadedOptRunId(id) {
    console.log("Setting LoadedOptRunId to:", id);
    loadedOptRunId = id;
    localStorage.setItem('loadedOptRunId', loadedOptRunId);
}
function setLoadedOutputPath(outputPath) {
    loadedOutputPath = outputPath;
    localStorage.setItem('loadedOutputPath', loadedOutputPath);
}
function setCurrentGenerationKey(genKey) {
    currentGenerationKey = genKey;
    localStorage.setItem('currentGenerationKey', currentGenerationKey);
}
function setCurrentSolutionId(solutionId) {
    currentSolutionId = solutionId;
    localStorage.setItem('currentSolutionId', currentSolutionId);
}
function toSolutionFileNames(keys) {
    return keys.map(key => toSolutionFileName(key[0], key[1]));
}
function toSolutionFileName(genKey, solutionId) {
    return `${genKey}_sol${solutionId}.json`;
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
async function fetchSolutionData(outputPath, genKey, solutionId) {
    const fileName = toSolutionFileName(genKey, solutionId);
    return fetchSolutionFile(outputPath, fileName);
}
async function fetchAndCreateSolutions(outputPath, solutionFileNames) {
    const solutions = await Promise.all(
        solutionFileNames.map(async solutionFileName => {
            return fetchAndCreateSolution(outputPath, solutionFileName);
        })
    );
    return solutions;
}
async function fetchKpis(outputPath, solutionFileName) {
    const solutionData = await fetchSolutionFile(outputPath, solutionFileName);
    return solutionData.kpis;
}
async function fetchAndCreateSolution(outputPath, solutionFileName) {
    console.log('Fetching solution:', outputPath + "/" + solutionFileName);
    const solutionData = await fetchSolutionFile(outputPath, solutionFileName);
    const [genKey, solIx] = extractSolutionKey(solutionFileName);
    console.log("extractSolutionKey:", genKey, solIx);
    const solution = createSolution(solutionData, genKey, solIx, loadedResources, loadedActivities);
    return solution;
}
function markSolutionInMenu(genKey, solutionId) {
    const fieldsets = solutionsFieldsetElement.querySelectorAll('fieldset');
    fieldsets.forEach(fieldset => {
        const divs = fieldset.querySelectorAll('div');
        for (const div of divs) {
            const key = div.dataset.genKey;
            const solIx = div.dataset.solIx;
            if (genKey === key && solutionId == solIx) {
                setActiveSolutionElement(div);
                return;
            }
        }
    });
}
async function initialLoad() {
    console.log('Initial load...');
    console.log('loadedOutputPath:', loadedOutputPath);
    console.log('currentGenerationKey:', currentGenerationKey);
    console.log('currentSolutionId:', currentSolutionId);
    await Promise.all([
        load(loadedOutputPath),
        loadOptRunsInMenu(loadedOptRunId),
        // loadOutputsInMenu(loadedOutputPath),
    ]);
    generateTimeRuler();
    if (currentGenerationKey === "undefined" ) {
        return;
    }
    markSolutionInMenu(currentGenerationKey, currentSolutionId);
    console.log('loadedMeta:', loadedMeta);
    if (loadedMeta.std_deviation) {
        renderGraphs(loadedMeta);
    }
    const currentSolutionFileName = toSolutionFileName(currentGenerationKey, currentSolutionId);
    const solution = await fetchAndCreateSolution(loadedOutputPath, currentSolutionFileName);
    console.log('Initial solution:', solution);
    drawSolution(solution);
    updateInfo(loadedOutputPath, currentGenerationKey, solution);
    gantt.scrollLeft = initScrollLeft;
    gantt.scrollTop = initScrollTop;
    aircraftColumn.scrollTop = gantt.scrollTop;
    if (liveModeIsOn) {
        startLive();
    }
    console.log('Initial load complete.');
}
console.log('Loaded output path:', loadedOutputPath);
if (loadedOutputPath) {
    initialLoad();
} else {
    loadOptRunsInMenu(selectedOptRunId);
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
    test_get_elem_ids2();
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
    const string = "id-0,0,del,bom,a320,00:00,01:00";
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
    const sobt1 = "2023-01-01T00:00:00"
    const sibt1 = "2023-01-01T01:00:00"
    const flight1 = Flight.default({
        id: 1,
        sobt: sobt1,
        sibt: sibt1,
    });
    rotation.addActivity(flight1);
    assertEqual(rotation.length(), 1) || (
        console.error(`Rotation activities length ${rotation.length()} not equal to 1`)
    );
    const start1 = new Date(sobt1 + "Z");
    const end1 = new Date(sibt1 + "Z");
    assertEqual(rotation.start().getTime(), start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${start1}`)
    );
    assertEqual(rotation.end().getTime(), end1.getTime()) || (
        console.error(`Rotation start ${rotation.end()} not equal to ${end1}`)
    );
    const sobt2 = "2023-01-01T02:00:00"
    const sibt2 = "2023-01-01T03:00:00"
    const flight2 = Flight.default({
        id: 2,
        sobt: sobt2,
        sibt: sibt2,
    })
    const end2 = new Date(sibt2 + "Z");
    assertEqual(rotation.start().getTime(), start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${start1}`)
    );
    rotation.addActivity(flight2)
    assertEqual(rotation.end().getTime(), end2.getTime()) || (
        console.error(`Rotation end ${rotation.end()} not equal to ${end2}`)
    );
}
function test_rotation_sort() {
    const rotation = Rotation.default();
    const sobt1 = "2023-01-01T02:00:00"
    const sibt1 = "2023-01-01T03:00:00"
    const flight1 = Flight.default({
        id: 1,
        sobt: sobt1,
        sibt: sibt1,
    });
    rotation.addActivity(flight1);
    const start1 = new Date(sobt1 + "Z");
    const end1 = new Date(sibt1 + "Z");
    assertEqual(rotation.start().getTime(), start1.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${start1}`)
    );
    assertEqual(rotation.end().getTime(), end1.getTime()) || (
        console.error(`Rotation start ${rotation.end()} not equal to ${end1}`)
    );
    const sobt2 = "2023-01-01T00:00:00"
    const sibt2 = "2023-01-01T01:00:00"
    const flight2 = Flight.default({
        id: 2,
        sobt: sobt2,
        sibt: sibt2,
    })
    rotation.addActivity(flight2);
    const start2 = new Date(sobt2 + "Z");
    assertEqual(rotation.start().getTime(), start2.getTime()) || (
        console.error(`Rotation start ${rotation.start()} not equal to ${start2}`)
    );
    rotation.addActivity(flight2)
    assertEqual(rotation.end().getTime(), end1.getTime()) || (
        console.error(`Rotation end ${rotation.end()} not equal to ${end1}`)
    );
}
function test_rotation_duration() {
    const rotation = Rotation.default();
    const sobt1 = "2023-01-01T00:00:00"
    const sibt1 = "2023-01-01T01:00:00"
    const flight1 = Flight.default({
        id: 1,
        sobt: sobt1,
        sibt: sibt1,
    });
    rotation.addActivity(flight1);
    const start1 = new Date(sobt1 + "Z");
    const end1 = new Date(sibt1 + "Z");
    const duration = (end1 - start1) / 60 / 1000; // Convert milliseconds to minutes
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
        sobt: "2023-01-01T00:00:00",
        sibt: "2023-01-01T01:00:00",
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
function test_get_elem_ids2() {
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
        sobt: "2023-01-01T00:00:00",
        sibt: "2023-01-01T01:00:00",
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
// setTimeout(runTests, 2000);
///////////////////////////////////////////////////