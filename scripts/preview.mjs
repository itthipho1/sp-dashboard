import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROJECT_ROOT } from './plugin-source.mjs';
import { assertPluginHtmlSize } from './build-plugin.mjs';

const port = Number(process.env.SP_AREAS_PREVIEW_PORT || '8766');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('SP_AREAS_PREVIEW_PORT must be an integer from 1 to 65535.');
}
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const minute = 60_000;
const tags = [
  { id: 'yard', title: 'Area: Yard' },
  { id: 'vehicle', title: 'Area: Vehicle' },
  { id: 'bob', title: 'Owner: Bob' },
];
const makeTask = (id, title, minutes, tagIds, extra = {}) => ({
  id, title, projectId: 'home', tagIds, parentId: null, subTaskIds: [],
  isDone: false, timeSpent: minutes * minute, timeEstimate: 60 * minute,
  timeSpentOnDay: { [date]: minutes * minute }, ...extra,
});
const tasks = [
  makeTask('yard-parent', 'Tidy the yard', 40, ['yard', 'bob'], { subTaskIds: ['yard-child'] }),
  makeTask('yard-child', 'Gather the clippings (already rolled into parent)', 10, ['vehicle'], { parentId: 'yard-parent' }),
  makeTask('vehicle-task', 'Clean the vehicle', 20, ['vehicle', 'bob']),
  makeTask('unassigned-task', 'Sort the mail', 10, ['bob']),
  makeTask('conflict-task', 'Choose an area for this task', 15, ['yard', 'vehicle', 'bob']),
];
const archived = [makeTask('yard-parent', 'Stale archive duplicate — active version wins', 900, ['vehicle'])];
const fixture = { tasks, archived, tags, projects: [{ id: 'home', title: 'Home' }] };
const mockScript = `<script>\n(() => {\nconst demo = ${JSON.stringify(fixture).replace(/<\//g, '<\\/')};\nwindow.PluginAPI = Object.freeze({\n  cfg: Object.freeze({ theme: 'light', platform: 'web', appVersion: '19.1.0-demo' }),\n  getTasks: async () => structuredClone(demo.tasks),\n  getArchivedTasks: async () => structuredClone(demo.archived),\n  getAllProjects: async () => structuredClone(demo.projects),\n  getAllTags: async () => structuredClone(demo.tags)\n});\n})();\n<\/script>\n`;
const openingMainScript = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i;
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

function previewPage() {
  // Read the packaged artifact on each request so rebuild + reload is sufficient.
  const html = readFileSync(resolve(PROJECT_ROOT, 'build/sp-dashboard/index.html'), 'utf8');
  assertPluginHtmlSize(html);
  if (!openingMainScript.test(html)) throw new Error('Preview cannot find the plugin main script.');
  const demoHtml = html.replace(openingMainScript, match => mockScript + match);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Areas Dashboard — disposable demo</title><style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#fafafa}#demo-banner{box-sizing:border-box;min-height:50px;padding:12px 18px;background:#fff0be;color:#332900;border-bottom:1px solid #d9c574}iframe{display:block;border:0;width:100%;height:calc(100% - 50px)}</style></head><body><div id="demo-banner"><strong>Disposable demo:</strong> synthetic tasks only. No connection to your Super Productivity data. Yard 40m · Vehicle 20m · Unassigned 10m · Conflicting areas 15m.</div><iframe title="Areas Dashboard demo" data-plugin-id="sp-areas-dashboard" sandbox="allow-scripts allow-same-origin" srcdoc="${escapeAttribute(demoHtml)}"></iframe></body></html>`;
}
// Fail at startup if the build is absent or incompatible instead of serving stale source.
previewPage();
const server = createServer((request, response) => {
  if (request.method !== 'GET' || !['/', '/index.html'].includes(request.url)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  let page;
  try {
    page = previewPage();
  } catch (error) {
    console.error('Preview build unavailable:', error.message);
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Plugin build unavailable. Run npm run build, then reload.');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(page);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Disposable Areas Dashboard preview: http://127.0.0.1:${port}/`);
});
