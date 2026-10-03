import { describe, it, expect } from 'vitest';
import { getAreaTags, buildAreaReport } from '../src/areas.js';

const DAY = '2026-10-02';
const BEFORE = '2026-10-01';
const tags = [
  { id: 'home', title: 'Area: Home' },
  { id: 'health', title: 'area : Health' },
  { id: 'bob', title: 'Bob' },
  { id: 'context', title: '@home' },
];
const task = (id, changes = {}) => ({
  id, title: id, projectId: 'project', tagIds: ['home'],
  timeSpentOnDay: { [DAY]: 60000 }, isDone: false, ...changes,
});
const group = (report, id) => report.groups.find((item) => item.id === id);
const expectReconciled = (report) => {
  expect(report.groups.reduce((sum, item) => sum + item.timeMs, 0)).toBe(report.totalTimeMs);
  expect(report.groups.reduce((sum, item) => sum + item.taskCount, 0)).toBe(report.trackedTaskCount);
  expect(report.entries.reduce((sum, item) => sum + item.timeMs, 0)).toBe(report.totalTimeMs);
  for (const item of report.groups) {
    expect(Object.values(item.dailyData).reduce((sum, value) => sum + value, 0)).toBe(item.timeMs);
  }
};

describe('Area tag identities', () => {
  it('detects a case-insensitive prefix and trims labels without matching empty or incidental names', () => {
    expect(getAreaTags([
      ...tags, { id: 'spaced', title: '  AREA  :  Garden  ' },
      { id: 'empty', title: 'Area:   ' }, { id: 'incidental', title: 'Work Area: Home' },
    ])).toEqual([
      { id: 'home', title: 'Area: Home', label: 'Home' },
      { id: 'health', title: 'area : Health', label: 'Health' },
      { id: 'spaced', title: 'AREA  :  Garden', label: 'Garden' },
    ]);
  });

  it('keeps distinct native IDs with the same label and gives later duplicate IDs precedence', () => {
    const renamed = [...tags, { id: 'home2', title: 'Area: Home' }, { id: 'home', title: 'Area: House' }];
    const report = buildAreaReport([task('a'), task('b', { tagIds: ['home2'] })], renamed, [DAY]);
    expect(group(report, 'area:home').label).toBe('House');
    expect(group(report, 'area:home2').label).toBe('Home');
    expectReconciled(report);
  });

  it('allows explicit native tags and never falls back to autodetection for empty or missing selections', () => {
    const report = buildAreaReport([task('a', { tagIds: ['bob', 'home'] })], tags, [DAY], { selectedAreaTagIds: ['bob', 'bob'] });
    expect(report.areaTags).toEqual([{ id: 'bob', title: 'Bob', label: 'Bob' }]);
    expect(group(report, 'area:bob').timeMs).toBe(60000);
    for (const selectedAreaTagIds of [[], ['deleted']]) {
      const empty = buildAreaReport([task('a')], tags, [DAY], { selectedAreaTagIds });
      expect(empty.areaTags).toEqual([]);
      expect(empty.unassignedTaskCount).toBe(1);
      expect(empty.groups).toHaveLength(2);
    }
  });
});

describe('exclusive Area time reports', () => {
  it('counts parent rollups once, ignores child classification and excludes orphan subtasks', () => {
    const report = buildAreaReport([
      task('parent', { subTaskIds: ['child1', 'child2'], timeSpentOnDay: { [DAY]: 180000 } }),
      task('child1', { parentId: 'parent', tagIds: ['health'], timeSpentOnDay: { [DAY]: 60000 } }),
      task('child2', { parentId: 'parent', timeSpentOnDay: { [DAY]: 120000 } }),
      task('orphan', { parentId: 'missing' }),
    ], tags, [DAY]);
    expect(report.totalTimeMs).toBe(180000);
    expect(report.trackedTaskCount).toBe(1);
    expect(group(report, 'area:home').timeMs).toBe(180000);
    expect(group(report, 'area:health').timeMs).toBe(0);
    expectReconciled(report);
  });

  it('deduplicates archived and active representations by task ID with later values winning', () => {
    const report = buildAreaReport([
      task('same', { tagIds: ['health'], timeSpentOnDay: { [DAY]: 120000 } }),
      task('same', { tagIds: ['home'], timeSpentOnDay: { [DAY]: 300000 } }),
    ], tags, [DAY, DAY]);
    expect(report.totalTimeMs).toBe(300000);
    expect(report.trackedTaskCount).toBe(1);
    expect(group(report, 'area:health').taskCount).toBe(0);
    expectReconciled(report);
  });

  it('does not multiply time for owner/context tags or duplicate Area tag IDs', () => {
    const report = buildAreaReport([task('a', { tagIds: ['home', 'bob', 'context', 'home'] })], tags, [DAY]);
    expect(report.totalTimeMs).toBe(60000);
    expect(report.entries[0].areaIds).toEqual(['home']);
    expect(report.conflictTaskCount).toBe(0);
    expectReconciled(report);
  });

  it('allocates multiple distinct Areas once to conflicts and missing Areas once to unassigned', () => {
    const report = buildAreaReport([
      task('conflict', { tagIds: ['home', 'health', 'home'] }),
      task('unassigned', { tagIds: ['bob', 'deleted'] }),
    ], tags, [DAY]);
    expect(report.totalTimeMs).toBe(120000);
    expect(report.conflictTaskCount).toBe(1);
    expect(report.unassignedTaskCount).toBe(1);
    expect(group(report, 'conflict').timeMs).toBe(60000);
    expect(group(report, 'unassigned').timeMs).toBe(60000);
    expect(group(report, 'area:home').timeMs).toBe(0);
    expectReconciled(report);
  });

  it('avoids group ID collisions with Area tag names and IDs', () => {
    const report = buildAreaReport([task('a', { tagIds: ['conflict'] }), task('b', { tagIds: [] })], [
      { id: 'conflict', title: 'Area: Unassigned' }, { id: 'unassigned', title: 'Area: Multiple Areas' },
    ], [DAY]);
    expect(group(report, 'area:conflict').timeMs).toBe(60000);
    expect(group(report, 'unassigned').timeMs).toBe(60000);
    expect(report.groups).toHaveLength(4);
    expectReconciled(report);
  });

  it('reports only dated positive activity in range and never fabricates dates from lifetime totals', () => {
    const report = buildAreaReport([
      task('outside', { timeSpentOnDay: { [BEFORE]: 60000 } }),
      task('zero', { timeSpentOnDay: { [DAY]: 0 } }),
      task('legacy', { timeSpentOnDay: undefined, timeSpent: 1000000, isDone: true, doneOn: Date.now() }),
    ], tags, [DAY]);
    expect(report.totalTimeMs).toBe(0);
    expect(report.entries).toEqual([]);
    expect(report.groups.map((item) => item.taskCount)).toEqual([0, 0, 0, 0]);
    expectReconciled(report);
  });

  it('sanitizes invalid values and applies the minimum to each recorded day independently', () => {
    const dates = [DAY, BEFORE, '2026-09-30', '2026-09-29', '2026-09-28', '2026-09-27', '2026-09-26'];
    const report = buildAreaReport([task('a', { timeSpentOnDay: {
      [DAY]: 60000, [BEFORE]: 59999, '2026-09-30': -1,
      '2026-09-29': NaN, '2026-09-28': Infinity, '2026-09-27': '70000', '2026-09-26': null,
    } })], tags, dates, { minEntryMs: 60000 });
    expect(report.totalTimeMs).toBe(60000);
    expect(group(report, 'area:home').dailyData).toEqual(Object.fromEntries(dates.map((day) => [day, day === DAY ? 60000 : 0])));
    expectReconciled(report);
  });

  it('keeps native day maps authoritative and ignores unsupported session fields', () => {
    const input = [
      task('dated', { timeSpentOnDay: { [DAY]: 60000 }, currentSessionTime: 30000 }),
      task('undated', { timeSpentOnDay: {}, currentSessionTime: 30000 }),
    ];
    const report = buildAreaReport(input, tags, [DAY], { includeRunningTimer: true, today: DAY });
    expect(report.totalTimeMs).toBe(60000);
    expect(report.entries.map(entry => entry.taskId)).toEqual(['dated']);
    expectReconciled(report);
  });

  it('preserves supplied logical date keys and leaves all inputs unchanged', () => {
    const inputTasks = [task('a', { timeSpentOnDay: { [BEFORE]: 90000, [DAY]: 60000 } })];
    const inputTags = tags.map((tag) => ({ ...tag }));
    const range = [BEFORE, DAY];
    const options = { selectedAreaTagIds: ['home'], minEntryMs: 0 };
    const before = JSON.stringify({ inputTasks, inputTags, range, options });
    Object.freeze(inputTasks[0].timeSpentOnDay);
    Object.freeze(inputTasks[0].tagIds);
    Object.freeze(inputTasks[0]);
    Object.freeze(inputTasks);
    Object.freeze(inputTags);
    Object.freeze(range);
    Object.freeze(options.selectedAreaTagIds);
    Object.freeze(options);
    const report = buildAreaReport(inputTasks, inputTags, range, options);
    expect(group(report, 'area:home').dailyData).toEqual({ [BEFORE]: 90000, [DAY]: 60000 });
    expect(JSON.stringify({ inputTasks, inputTags, range, options })).toBe(before);
    expectReconciled(report);
  });
});
