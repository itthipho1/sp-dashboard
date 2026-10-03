import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM, VirtualConsole } from 'jsdom';
import { buildHtml, inlineAreasCore } from '../scripts/plugin-source.mjs';
import { assertInlineHandlerGlobals, assertPluginHtmlSize, buildPlugin, MAX_PLUGIN_HTML_BYTES } from '../scripts/build-plugin.mjs';

const minute = 60_000;
const day = (() => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
})();
const tags = [
  { id: 'yard', title: 'Area: Yard' },
  { id: 'vehicle', title: 'Area: Vehicle' },
  { id: 'owner', title: 'Owner: Bob' },
];
const task = (id, title, minutes, tagIds, extra = {}) => ({
  id, title, projectId: 'home', tagIds, parentId: null, subTaskIds: [],
  isDone: false, timeSpent: minutes * minute,
  timeSpentOnDay: { [day]: minutes * minute }, ...extra,
});
const tasks = [
  task('yard-parent', 'Yard parent', 40, ['yard', 'owner'], { subTaskIds: ['yard-child'] }),
  task('yard-child', 'Rolled-up child', 10, ['vehicle'], { parentId: 'yard-parent' }),
  task('vehicle-task', 'Vehicle task', 20, ['vehicle', 'owner']),
  task('unassigned-task', 'Unassigned task', 10, ['owner']),
  task('conflict-task', 'Conflicting task', 15, ['yard', 'vehicle', 'owner']),
];
const projects = [{ id: 'home', title: 'Home' }];
const archived = [task('yard-parent', 'Stale archive duplicate', 900, ['vehicle'])];
const publicSource = 'export function getAreaTags() { return []; }\nexport function buildAreaReport() { return {}; }';
const doms = [];

function createView({ api = true, storedSettings, hostError = false, html = buildHtml() } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8766/', runScripts: 'outside-only', virtualConsole,
  });
  doms.push(dom);
  const win = dom.window;
  const mock = {
    cfg: { theme: 'light', platform: 'web' },
    getTasks: vi.fn(async () => structuredClone(tasks)),
    getArchivedTasks: vi.fn(async () => structuredClone(archived)),
    getAllProjects: vi.fn(async () => structuredClone(projects)),
    getAllTags: vi.fn(async () => structuredClone(tags)),
  };
  if (hostError) mock.getTasks.mockRejectedValue(new Error('Host is offline'));
  if (api) win.PluginAPI = mock;
  if (storedSettings) win.localStorage.setItem(storedSettings.key, storedSettings.value);
  const main = [...win.document.querySelectorAll('script')]
    .find(script => !script.src && script.textContent.includes('processData'));
  expect(main, 'actual built plugin script').toBeDefined();
  win.eval(main.textContent);
  return { win, mock, errors, document: win.document };
}

async function load(view) {
  view.win.setSetting('periodMode', 'pin');
  view.win.setSetting('periodPinned', 'today');
  view.win.applyDefaultSelections();
  await view.win.pullDataFromSP();
  // Bootstrap and explicit refresh can coalesce; let the queued follow-up settle.
  await new Promise(resolve => view.win.setTimeout(resolve, 0));
  return view;
}

afterEach(() => {
  while (doms.length) doms.pop().window.close();
  vi.restoreAllMocks();
});

describe('portable Areas source build', () => {
  it('inlines exactly the tested module with no remaining export syntax', () => {
    const built = buildHtml();
    expect(built).not.toContain('/* AREAS_CORE */');
    expect(built).toContain('const AreaReports = (() => {');
    expect(built).toContain('return { getAreaTags, buildAreaReport };');
  });

  it('rejects missing or duplicate injection markers', () => {
    expect(() => inlineAreasCore('<script></script>', publicSource)).toThrow(/exactly one/);
    expect(() => inlineAreasCore('<script>/* AREAS_CORE *//* AREAS_CORE */</script>', publicSource)).toThrow(/exactly one/);
    expect(() => inlineAreasCore('<div>/* AREAS_CORE */</div>', publicSource)).toThrow(/inline script/);
  });

  it('rejects imports, unexpected exports and export lists', () => {
    const html = '<script>/* AREAS_CORE */</script>';
    expect(() => inlineAreasCore(html, 'import x from "x";\n' + publicSource)).toThrow(/dependency-free/);
    expect(() => inlineAreasCore(html, publicSource + '\nexport function surprise() {}')).toThrow(/Unexpected Areas export/);
    expect(() => inlineAreasCore(html, 'function getAreaTags() {} function buildAreaReport() {} export { getAreaTags, buildAreaReport };')).toThrow(/declaration exports/);
    expect(() => inlineAreasCore(html, 'export default function getAreaTags() {}')).toThrow(/named declaration exports/);
  });

  it('guards the host limit in UTF-8 bytes, including non-ASCII content', () => {
    expect(assertPluginHtmlSize('x'.repeat(MAX_PLUGIN_HTML_BYTES))).toBe(MAX_PLUGIN_HTML_BYTES);
    expect(() => assertPluginHtmlSize('x'.repeat(MAX_PLUGIN_HTML_BYTES) + 'x')).toThrow(/HTML|index.html/);
    expect(() => assertPluginHtmlSize('é'.repeat(MAX_PLUGIN_HTML_BYTES / 2 + 1))).toThrow(/UTF-8 bytes/);
  });

  it('requires new inline handler globals to be reserved during minification', () => {
    expect(() => assertInlineHandlerGlobals(buildHtml())).not.toThrow();
    expect(() => assertInlineHandlerGlobals('<select onchange="setDrillEntity(this.value)"></select>')).not.toThrow();
    expect(() => assertInlineHandlerGlobals('<button onclick="newGlobalHandler()"></button>')).toThrow(/newGlobalHandler.*INLINE_HANDLER_GLOBALS/);
    expect(() => assertInlineHandlerGlobals('<button onclick=newGlobalHandler()></button>')).toThrow(/must be quoted/);
  });

  it('ships minified HTML within the host limit with working Areas data and inline handlers', async () => {
    const packaged = await buildPlugin();
    expect(packaged.htmlBytes).toBeLessThanOrEqual(MAX_PLUGIN_HTML_BYTES);
    expect(packaged.htmlBytes).toBe(Buffer.byteLength(packaged.html, 'utf8'));
    const view = await load(createView({ html: packaged.html }));
    expect(view.win.latestAreaReport.totalTimeMs).toBe(85 * minute);
    expect(view.document.getElementById('areas-conflict').textContent).toBe('0h 15m');
    // Execute the shipped attribute in the same global realm as browser handlers.
    const dashboard = view.document.getElementById('tab-btn-dashboard');
    view.win.Function(dashboard.getAttribute('onclick')).call(dashboard);
    expect(view.win.getActiveViewNode().key).toBe('dashboard');
    const areas = view.document.getElementById('tab-btn-areas');
    view.win.Function(areas.getAttribute('onclick')).call(areas);
    expect(view.win.getActiveViewNode().key).toBe('areas');
    expect(view.win.buildTextSummary('areas')).toContain('Yard: 0h 40m');
    expect(view.errors).toEqual([]);
  });
});

describe('Areas view in the built plugin', () => {
  it('shows exclusive totals with conflict and unassigned work counted once', async () => {
    const view = await load(createView());
    expect(view.document.getElementById('view-areas').classList.contains('hidden')).toBe(false);
    expect(view.document.getElementById('areas-total').textContent).toBe('1h 25m');
    expect(view.document.getElementById('areas-unassigned').textContent).toBe('0h 10m');
    expect(view.document.getElementById('areas-conflict').textContent).toBe('0h 15m');
    const report = view.win.latestAreaReport;
    expect(report.totalTimeMs).toBe(85 * minute);
    expect(report.groups.reduce((sum, group) => sum + group.timeMs, 0)).toBe(report.totalTimeMs);
    expect(report.groups.find(group => group.id === 'area:yard').timeMs).toBe(40 * minute);
    expect(report.groups.find(group => group.id === 'area:vehicle').timeMs).toBe(20 * minute);
    expect(report.trackedTaskCount).toBe(4);
    expect(view.document.getElementById('areas-task-body').textContent).not.toContain('Rolled-up child');
    expect(view.document.getElementById('areas-task-body').textContent).not.toContain('Stale archive duplicate');
    expect(view.errors).toEqual([]);
  });

  it('drills into a conflict card and restores all tasks without native writes', async () => {
    const view = await load(createView());
    view.document.querySelector('[data-area-group-id="conflict"]').click();
    expect(view.document.querySelectorAll('#areas-task-body tr')).toHaveLength(1);
    expect(view.document.getElementById('areas-task-body').textContent).toContain('Conflicting task');
    view.document.getElementById('areas-show-all').click();
    expect(view.document.querySelectorAll('#areas-task-body tr')).toHaveLength(4);
    expect(Object.keys(view.mock)).toEqual(['cfg', 'getTasks', 'getArchivedTasks', 'getAllProjects', 'getAllTags']);
  });

  it('uses the current native tag IDs for manual selection and saves only local preferences', async () => {
    const view = await load(createView());
    const mode = view.document.getElementById('area-selection-mode');
    mode.value = 'manual';
    mode.dispatchEvent(new view.win.Event('change', { bubbles: true }));
    const vehicle = view.document.querySelector('[data-area-tag-id="vehicle"]');
    vehicle.checked = false;
    vehicle.dispatchEvent(new view.win.Event('change', { bubbles: true }));
    expect(view.win.getSetting('areaTagIds')).toEqual(['yard']);
    expect(view.win.latestAreaReport.groups.find(group => group.id === 'conflict').timeMs).toBe(0);
    expect(view.win.latestAreaReport.groups.find(group => group.id === 'area:yard').timeMs).toBe(55 * minute);
    expect(view.win.latestAreaReport.groups.find(group => group.id === 'unassigned').timeMs).toBe(30 * minute);
    const key = view.win.SETTINGS_KEY;
    const restored = await load(createView({ storedSettings: { key, value: view.win.localStorage.getItem(key) } }));
    expect(restored.win.getSetting('areaSelectionMode')).toBe('manual');
    expect(restored.win.getSetting('areaTagIds')).toEqual(['yard']);
    expect(restored.document.querySelector('[data-area-tag-id="yard"]').checked).toBe(true);
    expect(restored.document.querySelector('[data-area-tag-id="vehicle"]').checked).toBe(false);
  });

  it('retains selection through a tag rename and safely renders untrusted titles', async () => {
    const view = await load(createView());
    view.win.setSetting('areaSelectionMode', 'manual');
    view.win.setSetting('areaTagIds', ['yard']);
    const renamed = tags.map(tag => tag.id === 'yard' ? { ...tag, title: '<img src=x onerror=alert(1)> Yard' } : tag);
    view.win.processData(tasks, projects, renamed);
    expect(view.win.latestAreaReport.groups.find(group => group.id === 'area:yard').timeMs).toBe(55 * minute);
    expect(view.document.getElementById('areas-groups').textContent).toContain('<img src=x onerror=alert(1)> Yard');
    expect(view.document.querySelector('#areas-groups img')).toBeNull();
  });

  it('shares the Areas view and exports its exclusive totals', async () => {
    const view = await load(createView());
    view.win.switchTab('areas');
    expect(view.win.getActiveViewNode().key).toBe('areas');
    expect(view.win.getActiveViewNode().node).toBe(view.document.getElementById('view-areas'));
    const summary = view.win.buildTextSummary('areas');
    expect(summary).toContain('Time by Area');
    expect(summary).toContain('1h 25m');
    expect(summary).toContain('Yard: 0h 40m');
    expect(summary).toContain('Vehicle: 0h 20m');
    expect(summary).toContain('Unassigned: 0h 10m');
    expect(summary).toContain('15m');
    view.win.setSetting('summaryFormat', 'csv');
    expect(view.win.buildTextSummary('areas')).toContain('Yard');
  });

  it('shows an unavailable message without substituting fake tasks when the host API is absent', async () => {
    const view = await load(createView({ api: false }));
    expect(view.document.getElementById('areas-load-status').textContent).toMatch(/unavailable|open.*Super Productivity|not available/i);
    expect(view.document.getElementById('areas-task-body').textContent).not.toMatch(/Figma|Database|Mockups|Yard parent/);
    expect(view.win.latestAreaReport?.totalTimeMs || 0).toBe(0);
  });

  it('surfaces a host read error instead of presenting demo data as real work', async () => {
    const view = createView({ hostError: true });
    await load(view);
    expect(view.document.getElementById('areas-load-status').textContent).toMatch(/could not|failed|unavailable|error/i);
    expect(view.document.getElementById('areas-task-body').textContent).not.toMatch(/Figma|Database|Mockups|Yard parent/);
    expect(view.win.latestAreaReport?.totalTimeMs || 0).toBe(0);
  });
});
