# Areas Dashboard for Super Productivity

An Areas-focused fork of [Anthony Hanel's Dashboard](https://github.com/ahanel13/sp-dashboard),
retaining its charts, settings, exports, and MIT license. First version:
`0.1.0-alpha.1`, targeting Super Productivity `19.1.0` or later. Clients,
AI planning, and Oura are outside this first version.

## Areas

- The **Areas** tab opens by default. Native tags named `Area: Yard`,
  `Area: Vehicle`, etc. are detected automatically. You can instead select
  existing tags in **Choose your area tags**.
- Put one Area on a **parent task** using Super Productivity's task editor.
  Its recorded time already includes its subtasks. Child-only tags do not split
  that parent's history.
- Other tags (owners, contexts, GTD status) do not add extra Area time.
- Untagged work appears in **Unassigned**; work with multiple Areas appears
  once in **Conflicting areas**. Select a card to inspect the tracked tasks.
- Area totals include the same date range, archived-task choice, project/tag
  exclusions, and minimum-entry threshold as the other Dashboard reports.
- **Share → Copy text summary**, including the CSV setting, exports exclusive
  Area totals. Image/print exports use the currently visible view.

This first version reads task data and can open a native task detail panel.
It does not edit tasks, create tags, change timers, or contact an external service.
Area time follows the task's **current** tags, not its historical assignments or
the person who ran a timer. Only daily time records are counted; lifetime totals
cannot reconstruct missing dates. Calendar presets retain upstream behavior;
non-midnight logical day boundaries can differ from native Today.

The fork has its own plugin ID (`sp-areas-dashboard`) and local settings key.
It does not migrate, clear, or share the original Dashboard's preferences.
Native Area tags follow your normal task sync; report preferences and manual tag
selection remain per-device. A disconnected host displays **unavailable**, never
sample tasks or a valid-looking empty report.

## Build and preview

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:8766/` for an isolated iframe preview with explicitly
synthetic tasks. The preview never connects to a real workspace. It shows
85 minutes: Yard 40, Vehicle 20, Unassigned 10, and conflicting work 15.
The build inlines the tested Areas module and minifies the HTML, then checks
Super Productivity 19.1.0's 100 KiB extracted-HTML limit. Runtime dependencies
are not included or requested by the plugin.

On Linux/macOS, `make build` creates `sp-areas-dashboard.zip`. On PowerShell,
after `npm run build`, use:

```powershell
Compress-Archive -LiteralPath build/sp-dashboard/index.html,build/sp-dashboard/plugin.js,build/sp-dashboard/manifest.json,build/sp-dashboard/icon.svg,build/sp-dashboard/LICENSE -DestinationPath build/sp-areas-dashboard.zip
```

Export a full workspace backup before a live trial. Load the resulting ZIP
through **Settings → Plugins** on each participating device. This alpha's local
unit and iframe checks do not establish live-host or two-client acceptance.
Disable this plugin to return to native task views; the reporting plugin does
not modify your task data.

## Following upstream

Keep the original repository as the `upstream` remote, and merge its reviewed
updates into our fork. Areas arithmetic lives in `src/areas.js`, separately
tested and inlined at build time; reporting changes stay in the Areas view.
Use a separate branch for each change so upstream fixes remain easy to review.

## Original Dashboard features

A lightweight dashboard plugin for [Super Productivity](https://super-productivity.com) that visualizes time tracked, completed tasks, overdue items, and project breakdowns within a user-defined date range.

---

## Features

- Selectable date ranges: past week, current month, year, or custom range
- **Dashboard** — key metrics (time tracked, tasks completed, overdue, late), daily trend bar chart, and project/tag breakdown pie chart
- **Detailed List** — sortable table of every time entry with project, task, duration, and status
- **By Project / Tag** — drill into any project or tag for dedicated stats, a daily trend chart, and a filtered task list
- Live updates whenever task data changes in Super Productivity
- Adapts to light and dark themes automatically
- **Settings** — a gear in the tab bar opens six panels of configuration (below)

---

## Settings

Changes apply immediately; there is no Save. Everything is stored in one browser entry you can
export, import, or reset from Settings › Advanced.

| Section | What you can change |
| --- | --- |
| **General** | Start of week, date format, time format (`3h 45m` / `3.75h` / `225m`), working days, hide non-working days from charts |
| **Defaults** | What each control shows on open — remember the last value, or pin a fixed one: period, opening tab, chart metrics, table sort, project/tag split |
| **Data & Filtering** | Include archived tasks, exclude projects or tags, list subtasks as rows, minimum entry length, how undated tasks count toward overdue, hide empty projects/tags |
| **Appearance** | Theme override, chart palette (incl. colourblind-safe), bar-chart grouping, "Other" grouping for small pie slices, density, which stat cards show, rows per page |
| **Goals** | Daily time target and daily task target (dashed line on the bar chart), weekly time target (progress bar on the Total Time card) |
| **Advanced** | Auto-refresh interval, debug logging, export filename pattern, text-summary format (Slack / Markdown / CSV), export / import / reset |

Two of these are worth knowing about even if you change nothing else: **Include archived tasks** is
the biggest speed-up available on a vault with a long history, and everything under **Data &
Filtering** changes what the numbers mean, not just how they look.

---

## Preview

![Dashboard View](assets/dashboard.png)
*Dashboard with key metrics and charts.*

![Detailed List View](assets/detailed_list.png)
*Detailed list of individual time entries and task statuses.*

![By Project / Tag View](assets/drilldown.png)
*Drill-down view showing stats, daily trend, and tasks for a selected project or tag.*

---

## Installation

1. Build this Areas Dashboard fork and create its ZIP using the commands above.
   The PowerShell command creates `build/sp-areas-dashboard.zip`; `make build`
   creates `sp-areas-dashboard.zip` in the repository root.
2. Export a full workspace backup before a live trial.
3. Open Super Productivity and go to **Settings → Plugins**.
4. Import the Areas Dashboard ZIP on each participating device.
5. Enable **Areas Dashboard** and open it from the sidebar.

These instructions use a local alpha build; no released download is assumed.

---

## Issues & Feedback

File Areas Dashboard bugs or feature requests in [this fork's issue tracker](https://github.com/itthipho1/sp-dashboard/issues).
Include the plugin and Super Productivity versions, screenshots, and reproduction steps.

---

## License

MIT © 2026 Douglas Cooper, Anthony Hanel — see [LICENSE](LICENSE) for full text.
