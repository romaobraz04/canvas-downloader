const SUPABASE_FUNCTION_URL = "https://oixhuaaktwwzhcboueqj.supabase.co/functions/v1/canvas-proxy";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pMsOLWD4Ak-2niQl-kBa5g_y_QLpcIs";
const SETTINGS_KEY = "canvas-downloader.settings.v2";
const TOKEN_KEY = "canvas-downloader.token";
const BLOCKS = ["BLOK1", "BLOK2", "BLOK3", "BLOK4", "BLOK5"];
const BLOCK_OPTIONS = [...BLOCKS, "Unknown_BLOK"];

const el = {
  token: document.querySelector("#tokenInput"), rememberToken: document.querySelector("#rememberToken"),
  toggleToken: document.querySelector("#toggleToken"), connect: document.querySelector("#connectButton"),
  connectionStatus: document.querySelector("#connectionStatus"), coursesSection: document.querySelector("#coursesSection"),
  courseList: document.querySelector("#courseList"), selectAll: document.querySelector("#selectAllButton"),
  clearAll: document.querySelector("#clearAllButton"), optionsSection: document.querySelector("#optionsSection"),
  updateOnly: document.querySelector("#updateOnly"), groupByBlocks: document.querySelector("#groupByBlocks"),
  blockPanel: document.querySelector("#blockPanel"), blockAssignments: document.querySelector("#blockAssignments"),
  skipBlocks: document.querySelector("#skipBlocks"), destinationSection: document.querySelector("#destinationSection"),
  chooseFolder: document.querySelector("#chooseFolderButton"), folderName: document.querySelector("#folderName"),
  browserWarning: document.querySelector("#browserWarning"), sync: document.querySelector("#syncButton"),
  progressPanel: document.querySelector("#progressPanel"), progressLabel: document.querySelector("#progressLabel"),
  progressStats: document.querySelector("#progressStats"), progressBar: document.querySelector("#progressBar"),
  activityLog: document.querySelector("#activityLog"),
};

let courses = [];
let directoryHandle = null;
let syncing = false;
const state = loadSettings();

function defaultSettings() {
  return { selectedCourses: null, updateOnly: true, groupByBlocks: false, blockAssignments: {}, skippedBlocks: [] };
}

function loadSettings() {
  try { return { ...defaultSettings(), ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") || {}) }; }
  catch { return defaultSettings(); }
}

function saveSettings() {
  state.updateOnly = el.updateOnly.checked;
  state.groupByBlocks = el.groupByBlocks.checked;
  state.selectedCourses = courses.filter((course) => course.selected).map(courseKey);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
  if (el.rememberToken.checked) localStorage.setItem(TOKEN_KEY, el.token.value.trim());
  else localStorage.removeItem(TOKEN_KEY);
}

function courseKey(course) { return String(course.course_code || course.sis_course_id || course.id); }
function courseLabel(course) { return course.name || course.course_code || `Course ${course.id}`; }
function safeName(value) {
  if (!value) return "untitled";
  return String(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "").replace(/\p{C}/gu, "").replace(/\p{So}/gu, "").trim().replace(/[. ]+$/g, "") || "untitled";
}
function guessBlock(course) {
  const key = courseKey(course);
  if (state.blockAssignments[key]) return state.blockAssignments[key];
  const match = `${course.name || ""} ${course.course_code || ""} ${course.sis_course_id || ""}`.toLowerCase().match(/blok\W*([1-5])/i);
  return match ? `BLOK${match[1]}` : "Unknown_BLOK";
}
function log(message) {
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (el.activityLog.textContent === "Ready.") el.activityLog.textContent = "";
  el.activityLog.textContent += `[${stamp}] ${message}\n`;
  el.activityLog.scrollTop = el.activityLog.scrollHeight;
}
function setConnected(connected) {
  el.connectionStatus.textContent = connected ? "Connected" : "Not connected";
  el.connectionStatus.classList.toggle("connected", connected);
}
function token() { return el.token.value.trim(); }

async function proxyRequest(payload, responseType = "json") {
  if (!token()) throw new Error("Paste your Canvas access token first.");
  const response = await fetch(SUPABASE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, "X-Canvas-Token": token() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let detail = "";
    try { const body = await response.json(); detail = body.error || body.message || ""; }
    catch { detail = await response.text(); }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (responseType === "response") return response;
  return response.json();
}

function canvasGet(path, params = {}) { return proxyRequest({ action: "api", path, params }); }
function downloadResponse(url) { return proxyRequest({ action: "file", url }, "response"); }

function renderCourses() {
  el.courseList.replaceChildren();
  for (const course of courses) {
    const row = document.createElement("label"); row.className = "course-row";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = course.selected;
    checkbox.addEventListener("change", () => { course.selected = checkbox.checked; renderBlockAssignments(); saveSettings(); });
    const main = document.createElement("span"); main.className = "course-main";
    const name = document.createElement("span"); name.className = "course-name"; name.textContent = courseLabel(course);
    const code = document.createElement("span"); code.className = "course-code"; code.textContent = courseKey(course);
    main.append(name, code);
    const select = createBlockSelect(course); select.classList.add("course-block-select"); select.classList.toggle("hidden", !el.groupByBlocks.checked);
    row.append(checkbox, main, select); el.courseList.append(row);
  }
  renderBlockAssignments();
}

function createBlockSelect(course) {
  const select = document.createElement("select"); select.setAttribute("aria-label", `Block for ${courseLabel(course)}`);
  for (const block of BLOCK_OPTIONS) { const option = document.createElement("option"); option.value = block; option.textContent = block; select.append(option); }
  const key = courseKey(course); select.value = guessBlock(course); state.blockAssignments[key] = select.value;
  select.addEventListener("change", () => {
    state.blockAssignments[key] = select.value;
    document.querySelectorAll(`[data-block-course="${CSS.escape(key)}"]`).forEach((other) => { other.value = select.value; });
    saveSettings();
  });
  select.dataset.blockCourse = key;
  return select;
}

function renderBlockAssignments() {
  el.blockAssignments.replaceChildren();
  for (const course of courses.filter((item) => item.selected)) {
    const row = document.createElement("div"); row.className = "block-assignment";
    const label = document.createElement("span"); label.className = "course-name"; label.textContent = `${courseLabel(course)} · ${courseKey(course)}`;
    row.append(label, createBlockSelect(course)); el.blockAssignments.append(row);
  }
  if (!el.blockAssignments.childElementCount) { const empty = document.createElement("p"); empty.className = "muted"; empty.textContent = "Select at least one course."; el.blockAssignments.append(empty); }
}

function renderSkipBlocks() {
  el.skipBlocks.replaceChildren();
  for (const block of BLOCKS) {
    const label = document.createElement("label"); label.className = "check-row";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = state.skippedBlocks.includes(block);
    checkbox.addEventListener("change", () => { const set = new Set(state.skippedBlocks); checkbox.checked ? set.add(block) : set.delete(block); state.skippedBlocks = [...set]; saveSettings(); });
    const text = document.createElement("span"); text.textContent = block; label.append(checkbox, text); el.skipBlocks.append(label);
  }
}

async function connect() {
  if (!token()) { log("A Canvas token is required."); el.token.focus(); return; }
  el.connect.disabled = true; el.connect.textContent = "Loading…"; setConnected(false);
  try {
    log("Loading active Canvas courses…");
    const result = await canvasGet("/api/v1/courses", { enrollment_state: "active", per_page: 100 });
    const remembered = Array.isArray(state.selectedCourses) ? new Set(state.selectedCourses) : null;
    courses = result.filter((course) => course && course.id).sort((a, b) => courseLabel(a).localeCompare(courseLabel(b))).map((course) => ({ ...course, selected: remembered ? remembered.has(courseKey(course)) : true }));
    renderCourses(); renderSkipBlocks();
    el.coursesSection.classList.remove("hidden"); el.optionsSection.classList.remove("hidden"); el.destinationSection.classList.remove("hidden");
    setConnected(true); saveSettings(); log(`Loaded ${courses.length} active course${courses.length === 1 ? "" : "s"}.`);
  } catch (error) { log(`Connection failed: ${error.message}`); setConnected(false); }
  finally { el.connect.disabled = false; el.connect.textContent = "Load my courses"; }
}

async function chooseFolder() {
  if (!("showDirectoryPicker" in window)) return;
  try {
    directoryHandle = await window.showDirectoryPicker({ id: "canvas-downloader-root", mode: "readwrite", startIn: "downloads" });
    el.folderName.textContent = directoryHandle.name; el.sync.disabled = false; log(`Destination selected: ${directoryHandle.name}`);
  } catch (error) { if (error?.name !== "AbortError") log(`Could not select folder: ${error.message}`); }
}

async function ensurePermission(handle) {
  if (!handle) return false;
  const options = { mode: "readwrite" };
  if ((await handle.queryPermission?.(options)) === "granted") return true;
  return (await handle.requestPermission?.(options)) === "granted";
}
function getDirectory(parent, name) { return parent.getDirectoryHandle(safeName(name), { create: true }); }
async function fileExists(parent, name) {
  try { await parent.getFileHandle(name, { create: false }); return true; }
  catch (error) { if (error?.name === "NotFoundError") return false; throw error; }
}
async function writeDownload(parent, name, response) {
  const fileHandle = await parent.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  if (!response.body) { await writable.abort(); throw new Error("The download response had no file data."); }
  await response.body.pipeTo(writable);
}
function selectedCoursesForSync() {
  return courses.filter((course) => course.selected && (!el.groupByBlocks.checked || !state.skippedBlocks.includes(guessBlock(course))));
}
function setProgress(label, done, total, stats) {
  el.progressPanel.classList.remove("hidden"); el.progressLabel.textContent = label; el.progressStats.textContent = stats || "";
  el.progressBar.style.width = `${Math.round((total > 0 ? Math.min(1, done / total) : 0) * 100)}%`;
}

async function sync() {
  if (syncing) return;
  if (!directoryHandle) { log("Choose a destination folder first."); return; }
  if (!(await ensurePermission(directoryHandle))) { log("Folder write permission was not granted."); return; }
  const selected = selectedCoursesForSync();
  if (!selected.length) { log("No courses are selected for sync."); return; }
  saveSettings(); syncing = true; el.sync.disabled = true; el.chooseFolder.disabled = true; el.connect.disabled = true;
  let downloaded = 0, skipped = 0, errors = 0, filesSeen = 0;
  try {
    log(`Starting sync for ${selected.length} course${selected.length === 1 ? "" : "s"}…`);
    for (let courseIndex = 0; courseIndex < selected.length; courseIndex += 1) {
      const course = selected[courseIndex]; const label = courseLabel(course);
      setProgress(`Course ${courseIndex + 1}/${selected.length}: ${label}`, courseIndex, selected.length, `${downloaded} downloaded · ${skipped} skipped · ${errors} errors`);
      try {
        let parent = directoryHandle;
        if (el.groupByBlocks.checked) parent = await getDirectory(parent, guessBlock(course));
        const courseDir = await getDirectory(parent, label);
        const modules = await canvasGet(`/api/v1/courses/${course.id}/modules`, { per_page: 100 });
        log(`${label}: ${modules.length} module${modules.length === 1 ? "" : "s"}.`);
        for (const module of modules) {
          const moduleDir = await getDirectory(courseDir, module.name || `Module_${module.id}`);
          const items = await canvasGet(`/api/v1/courses/${course.id}/modules/${module.id}/items`, { per_page: 100 });
          for (const item of items) {
            if (item.type !== "File" || !item.content_id) continue;
            filesSeen += 1;
            try {
              const info = await canvasGet(`/api/v1/files/${item.content_id}`);
              const filename = safeName(info.display_name || info.filename || `file_${item.content_id}`);
              if (el.updateOnly.checked && (await fileExists(moduleDir, filename))) { skipped += 1; log(`Skipped existing: ${label} / ${module.name || "Module"} / ${filename}`); continue; }
              const url = info.url || info.download_url;
              if (!url) throw new Error("Canvas did not provide a download URL.");
              const response = await downloadResponse(url); await writeDownload(moduleDir, filename, response);
              downloaded += 1; log(`Downloaded: ${label} / ${module.name || "Module"} / ${filename}`);
            } catch (error) { errors += 1; log(`File error in ${label}: ${error.message}`); }
          }
        }
      } catch (error) { errors += 1; log(`Course error (${label}): ${error.message}`); }
    }
    setProgress(errors ? "Sync finished with errors" : "Sync complete", selected.length, selected.length, `${downloaded} downloaded · ${skipped} skipped · ${errors} errors`);
    log(`Finished. ${filesSeen} file item${filesSeen === 1 ? "" : "s"} checked.`);
  } finally { syncing = false; el.sync.disabled = false; el.chooseFolder.disabled = false; el.connect.disabled = false; }
}

function init() {
  const rememberedToken = localStorage.getItem(TOKEN_KEY);
  if (rememberedToken) { el.token.value = rememberedToken; el.rememberToken.checked = true; }
  el.updateOnly.checked = state.updateOnly; el.groupByBlocks.checked = state.groupByBlocks; el.blockPanel.classList.toggle("hidden", !state.groupByBlocks);
  const supportsFileSystemAccess = "showDirectoryPicker" in window;
  el.browserWarning.classList.toggle("hidden", supportsFileSystemAccess); el.chooseFolder.disabled = !supportsFileSystemAccess;
  el.toggleToken.addEventListener("click", () => { const showing = el.token.type === "text"; el.token.type = showing ? "password" : "text"; el.toggleToken.textContent = showing ? "Show" : "Hide"; });
  el.rememberToken.addEventListener("change", saveSettings); el.connect.addEventListener("click", connect);
  el.selectAll.addEventListener("click", () => { courses.forEach((course) => { course.selected = true; }); renderCourses(); saveSettings(); });
  el.clearAll.addEventListener("click", () => { courses.forEach((course) => { course.selected = false; }); renderCourses(); saveSettings(); });
  el.updateOnly.addEventListener("change", saveSettings);
  el.groupByBlocks.addEventListener("change", () => { state.groupByBlocks = el.groupByBlocks.checked; el.blockPanel.classList.toggle("hidden", !el.groupByBlocks.checked); renderCourses(); saveSettings(); });
  el.chooseFolder.addEventListener("click", chooseFolder); el.sync.addEventListener("click", sync); window.addEventListener("beforeunload", saveSettings);
}

init();
