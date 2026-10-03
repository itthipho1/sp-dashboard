// Host bridge for the Areas Dashboard iframe; no task writes or network calls.
const PLUGIN_ID = 'sp-areas-dashboard';
let refreshTimer = null;

function isOwnPluginWindow(win) {
  try { return !!win && win.frameElement?.getAttribute('data-plugin-id') === PLUGIN_ID; }
  catch (e) { return false; }
}

function handleDownload(event) {
  const data = event.data;
  if (!data || data.type !== 'SP_DASHBOARD_DOWNLOAD' || !(data.blob instanceof Blob)) return;
  if (!isOwnPluginWindow(event.source)) return;
  const url = URL.createObjectURL(data.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = String(data.filename || 'areas-dashboard.png').replace(/[^a-zA-Z0-9._-]/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function refreshVisibleFrame() {
  refreshTimer = null;
  document.querySelectorAll(`iframe[data-plugin-id="${PLUGIN_ID}"]`).forEach(frame => {
    frame.contentWindow?.postMessage({ type: 'SP_STATE_CHANGED' }, '*');
  });
}

PluginAPI.onReady(() => {
  window.addEventListener('message', handleDownload);
  PluginAPI.registerHook(PluginAPI.Hooks.ACTION, () => {
    if (!refreshTimer) refreshTimer = setTimeout(refreshVisibleFrame, 250);
  });
});

PluginAPI.onUnload(() => {
  window.removeEventListener('message', handleDownload);
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
});
