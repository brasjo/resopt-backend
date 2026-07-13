// Layout constants
let BUCKET_SIZE_MINUTES = 60;
const HEADER_HEIGHT = 65;
const LABEL_WIDTH = 90;
const PANEL_WIDTH = 176;

// Camera / canvas state
let timeGridConfig = {};
let canvasMap = {};
let camera = { x: 0 };
let worldWidth = 0;
const rectangleMap = {};

// Display parameters
let pixelsPerMinute = 0; // set to 0 so startRender can detect "not yet initialised"
let rowHeight = 50;
let rows = 0;

// Activity data
const serviceTypeColors = {
  "F": "#a8dba8",
  "X": "#d0a8e8",
  "A": "#f5c28a",
  "H": "#f5a8a8",
  "P": "#a8d0f5",
  "J": "#a8dba8",
  "C": "#f5c28a",
  "G": "#d0a8e8",
};
const colors = [
  "#3498db", "#2ecc71", "#e67e22", "#9b59b6", "#e74c3c",
  "#1abc9c", "#f1c40f", "#34495e", "#d35400", "#7f8c8d"
];
let aircraftRowIndex = {};
const UNASSIGNED_ID = "unassigned";
let aircraftSortKey = "";
let activities = [];
let _savedState = null;

// Playback state
let PLAYBACK_INTERVAL_MS = 2000;
let ANIMATION_DURATION_MS = 700;
const assignmentQueue = [];
let playbackRunning = false;
let playbackWanted = false; // true while user has pressed Play (survives empty-queue pauses)
let playbackTimer = null;
let isAnimating = false;
let animationFrameId = null;

// Solution streaming state
let SOLUTION_FILES = [];
let currentDir = null;
let solutionBaseUrl = "/";
const QUEUE_TARGET = 5;
let _solList = [];
let _solFetchNext = 0;
let _solEnqueueNext = 0;
const _solFetched = new Map();
const _solFetching = new Set();
let _solGeneration = 0;
let _solCurrentPlayIdx = -1;
const _solItemStyles = {
  pending:  "background:transparent;color:#555;",
  fetching: "background:transparent;color:#555;",
  queued:   "background:transparent;color:#555;",
  playing:  "background:#d5f5e3;color:#1e8449;font-weight:bold;",
  played:   "background:transparent;color:#555;",
  error:    "background:#fdd;color:#e74c3c;",
};
let _liveSource = null;

const selectedSolutionIds = new Set();

// Interaction state
let hoveredActivityId = null;
let hoverTimeout = null;
let draggingActivityId = null;
let dragRowOffset = 0;
const HOVER_DELAY_MS = 300;
let ticking = false;
const MIN_PAUSE_MS = 200;
