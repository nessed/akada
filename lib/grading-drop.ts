import type { Assessment, DropRule } from '@/lib/data';

/**
 * "Ignore the lowest 2 quizzes", the way the scheme editor says it.
 *
 * A rule is stored as `{ group, keep }` and the pieces it covers carry the
 * group, which is the right shape for the maths and an awkward one to type. The
 * editor works in drops instead: a draft is a group and how many of its pieces
 * go, and `applyDrafts` turns the drafts back into stored rules on save.
 */
export interface DropDraft {
  group: string;
  drop: number;
}

/** Groups made in the editor start with this, and are named when saved. */
export const NEW_GROUP = 'new-';

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The most a group of this size can drop: at least one piece always counts. */
export function maxDrop(size: number): number {
  return Math.max(1, size - 1);
}

/** "Quiz 3" and "Quiz 4" share a stem; "Midterm" has its own. */
export function stemOf(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s#:.\-–]*\d+\s*$/, '')
    .replace(/s$/, '');
}

/** Drafts for the rules a course already has, e.g. from a proposal Claude read off an outline. */
export function draftsFrom(rows: Assessment[], dropRules: DropRule[]): DropDraft[] {
  return dropRules.flatMap((rule) => {
    const size = rows.filter((row) => row.group === rule.group).length;
    if (size < 2) return [];
    return [{ group: rule.group, drop: clamp(size - rule.keep, 1, maxDrop(size)) }];
  });
}

/**
 * The pieces a new rule most likely means: ungrouped ones that share a stem
 * ("Quiz 1" to "Quiz 7"), the biggest family first. Nothing when no two do.
 */
export function suggestMembers(rows: Assessment[]): string[] {
  const families = new Map<string, string[]>();
  for (const row of rows) {
    const stem = stemOf(row.label);
    if (!stem || row.group) continue;
    families.set(stem, [...(families.get(stem) ?? []), row.id]);
  }
  const best = [...families.values()].sort((a, b) => b.length - a.length)[0];
  return best && best.length >= 2 ? best : [];
}

/** A name for a group made in the editor, from what its pieces are called. */
function nameFor(members: Assessment[], taken: Set<string>): string {
  const base = stemOf(members[0]?.label ?? '') || 'dropped';
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base} ${n}`;
  return name;
}

/**
 * The pieces and rules to store. A draft over fewer than two pieces has
 * nothing to drop, so it is left out and its pieces go back to always counting.
 */
export function applyDrafts(rows: Assessment[], drafts: DropDraft[]) {
  const taken = new Set(rows.map((row) => row.group).filter((g): g is string => Boolean(g) && !g!.startsWith(NEW_GROUP)));
  const renamed = new Map<string, string>();
  const dropRules: DropRule[] = [];

  for (const draft of drafts) {
    const members = rows.filter((row) => row.group === draft.group);
    if (members.length < 2) continue;
    const group = draft.group.startsWith(NEW_GROUP) ? nameFor(members, taken) : draft.group;
    taken.add(group);
    renamed.set(draft.group, group);
    dropRules.push({ group, keep: members.length - clamp(draft.drop, 1, maxDrop(members.length)) });
  }

  const next: Assessment[] = rows.map((row) => {
    if (!row.group) return row;
    const group = renamed.get(row.group);
    if (group) return row.group === group ? row : { ...row, group };
    if (!row.group.startsWith(NEW_GROUP)) return row;
    const { group: _removed, ...rest } = row;
    void _removed;
    return rest;
  });
  return { rows: next, dropRules };
}

/** The rules as they would be stored right now, for a total that follows the draft. */
export function draftRules(rows: Assessment[], drafts: DropDraft[]): DropRule[] {
  return drafts.flatMap((draft) => {
    const size = rows.filter((row) => row.group === draft.group).length;
    return size < 2 ? [] : [{ group: draft.group, keep: size - clamp(draft.drop, 1, maxDrop(size)) }];
  });
}
