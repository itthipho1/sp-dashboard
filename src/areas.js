const AREA_PREFIX = /^Area\s*:\s*\S/i;

const UNASSIGNED_AREA_GROUP_ID = 'unassigned';
const CONFLICT_AREA_GROUP_ID = 'conflict';

const asArray = (value) => Array.isArray(value) ? value : [];

const validDuration = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const tagMapOf = (tags) => {
  const tagMap = new Map();
  for (const tag of asArray(tags)) {
    if (!tag || typeof tag.id !== 'string' || !tag.id.trim()) continue;
    tagMap.set(tag.id, tag);
  }
  return tagMap;
};

const areaTagOf = (tag) => {
  const title = typeof tag.title === 'string' ? tag.title.trim() : '';
  if (!title) return null;
  return {
    id: tag.id,
    title,
    label: AREA_PREFIX.test(title) ? title.slice(title.indexOf(':') + 1).trim() : title,
  };
};

/** Native tag IDs remain the identity even when labels are renamed or repeated. */
export function getAreaTags(tags) {
  const areaTags = [];
  for (const tag of tagMapOf(tags).values()) {
    const areaTag = areaTagOf(tag);
    if (areaTag && AREA_PREFIX.test(areaTag.title)) areaTags.push(areaTag);
  }
  return areaTags;
}

const getSelectedAreaTags = (tags, selectedAreaTagIds) => {
  if (selectedAreaTagIds === undefined) return getAreaTags(tags);
  const tagMap = tagMapOf(tags);
  const selected = [];
  const seen = new Set();
  for (const id of asArray(selectedAreaTagIds)) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    const tag = tagMap.get(id);
    const areaTag = tag && areaTagOf(tag);
    if (areaTag) selected.push(areaTag);
  }
  return selected;
};

const makeGroup = (id, label, kind, days) => ({
  id,
  label,
  kind,
  timeMs: 0,
  taskCount: 0,
  dailyData: Object.fromEntries(days.map((day) => [day, 0])),
  entries: [],
});

/**
 * Report current root-task Area assignments without changing native task data.
 * SP parents already contain child time: children (including orphans) never add
 * another contribution. A task with multiple Areas contributes once to Conflicts.
 * Day keys are consumed verbatim; missing history is never inferred from totals.
 */
export function buildAreaReport(tasks, tags, dateRange, options = {}) {
  const settings = options && typeof options === 'object' ? options : {};
  const areaTags = getSelectedAreaTags(tags, settings.selectedAreaTagIds);
  const areaIds = new Set(areaTags.map((tag) => tag.id));
  const days = [...new Set(asArray(dateRange).filter((day) => typeof day === 'string'))];
  const minimum = validDuration(settings.minEntryMs);

  const groups = areaTags.map((tag) => makeGroup(`area:${tag.id}`, tag.label, 'area', days));
  groups.push(
    makeGroup(UNASSIGNED_AREA_GROUP_ID, 'Unassigned', 'unassigned', days),
    makeGroup(CONFLICT_AREA_GROUP_ID, 'Conflicting areas', 'conflict', days),
  );
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  // Later entries win, matching Dashboard's archive-then-active merge.
  const taskMap = new Map();
  for (const task of asArray(tasks)) {
    if (task && typeof task.id === 'string' && task.id.trim()) taskMap.set(task.id, task);
  }

  const entries = [];
  let totalTimeMs = 0;
  let conflictTaskCount = 0;
  let unassignedTaskCount = 0;
  for (const task of taskMap.values()) {
    if (task.parentId) continue;

    const trackedOnDay = task.timeSpentOnDay && typeof task.timeSpentOnDay === 'object'
      && !Array.isArray(task.timeSpentOnDay) ? task.timeSpentOnDay : {};
    const daily = Object.fromEntries(days.map((day) => {
      const duration = Object.hasOwn(trackedOnDay, day) ? validDuration(trackedOnDay[day]) : 0;
      return [day, duration >= minimum ? duration : 0];
    }));
    const timeMs = days.reduce((sum, day) => sum + daily[day], 0);
    if (timeMs <= 0) continue;

    const taskAreaIds = [...new Set(asArray(task.tagIds).filter((id) => areaIds.has(id)))];
    const groupId = taskAreaIds.length === 1 ? `area:${taskAreaIds[0]}`
      : taskAreaIds.length > 1 ? CONFLICT_AREA_GROUP_ID : UNASSIGNED_AREA_GROUP_ID;
    const entry = {
      taskId: task.id,
      title: typeof task.title === 'string' && task.title.trim() ? task.title : 'Untitled Task',
      projectId: typeof task.projectId === 'string' ? task.projectId : null,
      isDone: task.isDone === true,
      timeMs,
      areaIds: taskAreaIds,
      groupId,
    };
    const group = groupMap.get(groupId);
    group.timeMs += timeMs;
    group.taskCount += 1;
    for (const day of days) group.dailyData[day] += daily[day];
    group.entries.push(entry);
    entries.push(entry);
    totalTimeMs += timeMs;
    if (groupId === CONFLICT_AREA_GROUP_ID) conflictTaskCount += 1;
    if (groupId === UNASSIGNED_AREA_GROUP_ID) unassignedTaskCount += 1;
  }

  return {
    areaTags,
    groups,
    totalTimeMs,
    trackedTaskCount: entries.length,
    conflictTaskCount,
    unassignedTaskCount,
    entries,
  };
}
