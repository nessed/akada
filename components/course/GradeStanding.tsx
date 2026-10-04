'use client';

import { useMemo, useState } from 'react';
import type { Assessment, Course, DropRule, Task } from '@/lib/data';
import { gradeStanding } from '@/lib/derive';
import { updateCourseOptimistic } from '@/lib/data-hooks';
import { useClaudeSheet } from '@/components/claude/ClaudeSheet';
import { gradingPrompt } from '@/lib/grading-prompt';
import { useNotice } from '@/components/Notice';
import { ButtonSpinner } from '@/components/LoadingIndicator';
import ReorderList from '@/components/ReorderList';
import { daysBetween } from '@/lib/utils';
import {
  applyDrafts,
  draftRules,
  draftsFrom,
  maxDrop,
  NEW_GROUP,
  suggestMembers,
  type DropDraft,
} from '@/lib/grading-drop';

/**
 * Where the grade stands, and where it gets entered.
 *
 * The headline is two numbers rather than one: how much of the course has
 * actually been marked, and what was scored out of that. A single "86%" is a
 * lie by omission when only a quarter of the course has come back, and it is
 * the number every other planner shows.
 *
 * Reading and editing are the same panel. The old build put the standing on
 * the course page and the entry three screens away in settings, which meant
 * the moment you had a mark in your hand was never the moment you could type
 * it in. A piece that has not come back takes a dash, not a zero.
 *
 * There are two ways in. Typing it is one. The other is copying a prompt into
 * an LLM session with the Akada connector attached and letting it read the
 * outline, which lands here as a proposal: reviewed below with accept and
 * discard, and projecting nothing until it is accepted. `gradeStanding` reads
 * only the accepted scheme, so that guarantee is structural rather than a
 * thing this component remembers to honour.
 */
export default function GradeStanding({
  course,
  tasks,
  today,
}: {
  course: Course;
  tasks: Task[];
  today: string;
}) {
  const { notify } = useNotice();
  const claude = useClaudeSheet();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Assessment[]>(course.assessments ?? []);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState<'accept' | 'discard' | null>(null);

  const standing = useMemo(() => gradeStanding(course), [course]);
  // Out of what counts once drop rules apply, not the sum of every row: seven
  // 6% papers keeping five are 30% of the course, not 42.
  const [drafts, setDrafts] = useState<DropDraft[]>([]);
  const draftTotal = gradeStanding({
    assessments: rows,
    grading: { ...course.grading, dropRules: draftRules(rows, drafts) },
  }).total;
  const pending = course.grading?.pending ?? null;
  const carried = useMemo(
    () => (pending ? carryMarks(course.assessments ?? [], pending.assessments) : null),
    [course.assessments, pending],
  );

  function open() {
    // Nothing yet: the usual pieces of a course, weights left blank, so
    // typing a scheme in is filling five numbers rather than building rows.
    const start = course.assessments?.length
      ? course.assessments
      : USUAL_PIECES.map((label, index) => ({ ...blankRow(index), label }));
    setRows(start);
    setDrafts(draftsFrom(start, course.grading?.dropRules ?? []));
    setEditing(true);
  }

  /** A new rule, with the pieces that look like one family (Quiz 1 to Quiz 7) already picked. */
  function addDrop() {
    const group = `${NEW_GROUP}${Date.now().toString(36)}`;
    const members = new Set(suggestMembers(rows));
    setRows((current) => current.map((r) => (members.has(r.id) ? { ...r, group } : r)));
    setDrafts((current) => [...current, { group, drop: 1 }]);
  }

  function toggleMember(group: string, id: string) {
    setRows((current) =>
      current.map((r) => {
        if (r.id !== id) return r;
        if (r.group === group) {
          const { group: _gone, ...rest } = r;
          void _gone;
          return rest;
        }
        return r.group ? r : { ...r, group };
      }),
    );
  }

  function setDrop(group: string, drop: number) {
    setDrafts((current) => current.map((d) => (d.group === group ? { ...d, drop } : d)));
  }

  function removeDrop(group: string) {
    setRows((current) =>
      current.map((r) => {
        if (r.group !== group) return r;
        const { group: _gone, ...rest } = r;
        void _gone;
        return rest;
      }),
    );
    setDrafts((current) => current.filter((d) => d.group !== group));
  }

  function patch(id: string, next: Partial<Assessment>) {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  /**
   * The order the pieces were dragged into.
   *
   * An outline lists them the way the course runs — quiz, quiz, midterm,
   * final — and a scheme typed in over a term arrives in whatever order the
   * marks did. The list is stored as a list, so the order is simply what is
   * saved with it, and it is what every panel that reads the scheme shows.
   */
  function moveRow(orderedIds: string[]) {
    setRows((current) => {
      const byId = new Map(current.map((r) => [r.id, r]));
      const placed = orderedIds
        .map((id) => byId.get(id))
        .filter((r): r is Assessment => Boolean(r));
      const seen = new Set(orderedIds);
      return [...placed, ...current.filter((r) => !seen.has(r.id))];
    });
    return Promise.resolve();
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const kept = rows.filter((r) => r.label.trim() && r.weight > 0);
      const { rows: saved, dropRules } = applyDrafts(kept, drafts);
      await updateCourseOptimistic(course.id, {
        assessments: saved,
        grading: {
          basis: course.grading?.basis,
          dropRules,
          pending: course.grading?.pending ?? null,
        },
      });
      setEditing(false);
    } catch (error) {
      console.error('Failed to save grading:', error);
      notify('That grading did not save.');
    } finally {
      setSaving(false);
    }
  }

  /** Hand the outline to Claude, through the one sheet every Claude button uses. */
  function askClaude() {
    claude.ask({
      does: `Claude reads the ${course.code} outline and proposes how it is marked. Nothing counts until you accept it here.`,
      prompt: gradingPrompt({ courseId: course.id, courseCode: course.code }),
    });
  }

  /** Take the proposal as the real scheme, and clear it. */
  async function accept() {
    if (!pending || resolving) return;
    setResolving('accept');
    try {
      await updateCourseOptimistic(course.id, {
        assessments: carried?.rows ?? pending.assessments,
        grading: { basis: pending.basis, dropRules: pending.dropRules, pending: null },
      });
    } catch (error) {
      console.error('Failed to accept the grading scheme:', error);
      notify('That did not save. The scheme is still waiting.');
    } finally {
      setResolving(null);
    }
  }

  /** Drop the proposal. Whatever was already accepted is left alone. */
  async function discard() {
    if (!pending || resolving) return;
    setResolving('discard');
    try {
      await updateCourseOptimistic(course.id, {
        grading: {
          basis: course.grading?.basis,
          dropRules: course.grading?.dropRules ?? [],
          pending: null,
        },
      });
    } catch (error) {
      console.error('Failed to discard the grading scheme:', error);
      notify('That did not save. The scheme is still waiting.');
    } finally {
      setResolving(null);
    }
  }

  /** One piece of the scheme, whether it is sitting still or being carried. */
  const pieceRow = (row: Assessment, index: number) => (
    <div
      className={`flex items-center gap-1.5 py-2 ${
        index === rows.length - 1 ? '' : 'border-b border-line-soft'
      }`}
    >
      <input
        value={row.label}
        onChange={(e) => patch(row.id, { label: e.target.value })}
        placeholder="Midterm"
        aria-label="What this piece is"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ink outline-none placeholder:text-muted-soft"
      />
      <input
        value={row.weight || ''}
        onChange={(e) => patch(row.id, { weight: percent(e.target.value) })}
        inputMode="decimal"
        placeholder="0"
        aria-label={`${row.label || 'This piece'} is worth, as a percentage of the course`}
        className="w-[34px] min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[13px] text-muted outline-none"
      />
      <span aria-hidden className="font-mono text-[10.5px] text-muted-soft">%</span>
      {/* Score and out-of sit together so an empty score reads as
          "not back yet" rather than as a zero. */}
      <input
        value={row.score ?? ''}
        onChange={(e) =>
          patch(row.id, {
            score: e.target.value === '' ? null : number(e.target.value),
            outOf: row.outOf ?? 100,
          })
        }
        inputMode="decimal"
        placeholder="—"
        aria-label={`${row.label || 'This piece'}, what you scored`}
        className="ml-1.5 w-[36px] min-w-0 border-0 bg-transparent p-0 text-right font-mono text-[13px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted-soft"
      />
      <span aria-hidden className="font-mono text-[10.5px] text-muted-soft">/</span>
      <input
        value={row.outOf ?? ''}
        onChange={(e) =>
          patch(row.id, { outOf: e.target.value === '' ? null : number(e.target.value) || null })
        }
        inputMode="decimal"
        placeholder="100"
        aria-label={`${row.label || 'This piece'}, out of`}
        className="w-[30px] min-w-0 border-0 bg-transparent p-0 font-mono text-[13px] text-muted outline-none placeholder:text-muted-soft"
      />
      <button
        type="button"
        onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
        aria-label={`Remove ${row.label || 'this piece'}`}
        className="ml-0.5 grid h-7 w-6 touch:h-10 touch:w-9 shrink-0 place-items-center bg-transparent font-mono text-[14px] text-muted-soft transition-colors hover:text-warn"
      >
        ×
      </button>
    </div>
  );

  if (editing) {
    return (
      <section>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow m-0">How it is marked</p>
          <span
            className="tnum font-mono text-[11px]"
            style={{ color: draftTotal > 100 ? 'var(--warn)' : 'var(--muted)' }}
          >
            {round(draftTotal)}% of 100
          </span>
        </div>

        <div className="pt-1">
          {/* An outline reads in the order the course runs; a scheme typed
              in over a term arrives in the order the marks did. The grip sits
              in the margin, because every field on the row is already typed
              into. */}
          {rows.length > 1 ? (
            <ReorderList
              items={rows}
              getId={(row) => row.id}
              getLabel={(row) => row.label || 'This piece'}
              label="How the course is marked, in the order you arranged it"
              shape="row"
              carry="grip"
              className=""
              onReorder={moveRow}
              renderItem={pieceRow}
            />
          ) : (
            rows.map((row, index) => <div key={row.id}>{pieceRow(row, index)}</div>)
          )}
        </div>

        <button
          type="button"
          onClick={() => setRows((current) => [...current, blankRow(current.length)])}
          className="mt-2 bg-transparent p-0 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
        >
          + another piece…
        </button>

        {/* "My worst two quizzes don't count." Said the way a syllabus says
            it: pick the pieces, say how many go. Marks already in decide
            which ones, so nothing here is a choice about a particular quiz. */}
        {drafts.map((draft) => {
          const members = rows.filter((r) => r.group === draft.group);
          const drop = Math.min(draft.drop, maxDrop(members.length));
          return (
            <div key={draft.group} className="mt-4 border-t border-line-soft pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow m-0">Ignore the lowest</p>
                <button
                  type="button"
                  onClick={() => removeDrop(draft.group)}
                  className="bg-transparent p-0 font-serif text-[12px] italic text-muted transition-colors hover:text-ink"
                >
                  remove
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setDrop(draft.group, Math.max(1, drop - 1))}
                  disabled={drop <= 1}
                  aria-label="Ignore one fewer"
                  className="grid h-8 w-8 touch:h-10 touch:w-10 place-items-center rounded-[10px] border border-line-strong bg-transparent font-mono text-[15px] text-ink disabled:opacity-30"
                >
                  −
                </button>
                <span className="tnum w-5 text-center font-mono text-[17px] font-semibold">{drop}</span>
                <button
                  type="button"
                  onClick={() => setDrop(draft.group, Math.min(maxDrop(members.length), drop + 1))}
                  disabled={drop >= maxDrop(members.length)}
                  aria-label="Ignore one more"
                  className="grid h-8 w-8 touch:h-10 touch:w-10 place-items-center rounded-[10px] border border-line-strong bg-transparent font-mono text-[15px] text-ink disabled:opacity-30"
                >
                  +
                </button>
                <span className="font-serif text-[13px] italic text-muted">of these</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {rows
                  .filter((r) => r.label.trim() && (!r.group || r.group === draft.group))
                  .map((r) => {
                    const on = r.group === draft.group;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleMember(draft.group, r.id)}
                        className={`h-8 touch:h-10 rounded-[10px] border px-2.5 text-[12px] transition-colors ${
                          on
                            ? 'border-line-strong bg-bg-tint text-ink'
                            : 'border-line bg-transparent text-muted'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
              </div>
              <p className="m-0 mt-2 font-serif text-[12px] italic text-muted">
                {members.length < 2
                  ? 'Pick at least two pieces.'
                  : `Of the ${members.length}, the best ${members.length - drop} count.`}
              </p>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addDrop}
          className="mt-3 block bg-transparent p-0 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
        >
          + ignore the lowest scores…
        </button>

        {draftTotal > 100 && (
          <p className="m-0 mt-2.5 font-serif text-[12px] italic text-warn">
            That comes to more than 100%.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-10 flex-1 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-10 flex-1 rounded-[10px] bg-primary text-[13px] font-medium text-primary-contrast disabled:opacity-40"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <ButtonSpinner />
                Saving
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </section>
    );
  }

  // A proposal takes the panel until it is dealt with. It is the only thing
  // on this card that is asking a question, and leaving the standing above it
  // would invite reading the two as one scheme.
  if (pending) {
    return (
      <section>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow m-0">What was read off the outline</p>
          <span className="tnum font-mono text-[11px] text-muted">
            {round(
              gradeStanding({ assessments: pending.assessments, grading: { dropRules: pending.dropRules } })
                .total,
            )}
            % of 100
          </span>
        </div>

        <p className="m-0 pt-2.5 font-serif text-[13px] italic leading-[1.5] text-muted">
          Nothing is projected from this until you accept it.
          {pending.source && ` Read from ${pending.source}.`}
        </p>

        <div className="mt-2">
          {pending.assessments.map((row) => (
            <div
              key={row.id}
              className="flex items-baseline gap-2.5 border-b border-line-soft py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {row.label}
                {row.group && (
                  <span className="ml-1.5 font-serif text-[12px] italic text-muted">{row.group}</span>
                )}
              </span>
              <span className="tnum shrink-0 font-mono text-[11px] text-muted">{round(row.weight)}%</span>
            </div>
          ))}
        </div>

        <p className="m-0 mt-3 font-serif text-[13px] leading-[1.5] text-ink-soft">
          {basisSentence(pending.basis, course.code)}
        </p>
        {pending.dropRules.map((rule) => (
          <p key={rule.group} className="m-0 mt-1 font-serif text-[13px] leading-[1.5] text-ink-soft">
            {dropSentence(rule, pending.assessments)}
          </p>
        ))}

        {carried && carried.lost.length > 0 && (
          <p className="m-0 mt-3 font-serif text-[13px] italic leading-[1.5] text-warn">
            {carried.lost.length === 1
              ? `Your mark on ${carried.lost[0]} has no row here, so accepting clears it.`
              : `Your marks on ${carried.lost.join(', ')} have no row here, so accepting clears them.`}
          </p>
        )}

        {pending.note && (
          <p className="m-0 mt-3 border-t border-line-soft pt-2.5 font-serif text-[13px] italic leading-[1.5] text-muted">
            {pending.note}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={discard}
            disabled={resolving !== null}
            className="h-10 flex-1 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint disabled:opacity-40"
          >
            {resolving === 'discard' ? (
              <span className="flex items-center justify-center gap-2">
                <ButtonSpinner />
                Discarding
              </span>
            ) : (
              'Discard'
            )}
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={resolving !== null}
            className="h-10 flex-1 rounded-[10px] bg-primary text-[13px] font-medium text-primary-contrast disabled:opacity-40"
          >
            {resolving === 'accept' ? (
              <span className="flex items-center justify-center gap-2">
                <ButtonSpinner />
                Accepting
              </span>
            ) : (
              'Accept'
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={open}
          className="mt-3 w-full bg-transparent p-0 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
        >
          or type it in yourself
        </button>
      </section>
    );
  }

  if (standing.rows.length === 0) {
    return (
      <section>
        <p className="eyebrow m-0">Where the grade stands</p>
        <p className="m-0 mt-2.5 font-serif text-[15px] leading-[1.45] text-ink-soft">
          Akada does not know how {course.code} is marked yet.
        </p>
        {/* Two equal ways in. Typing it opens the editor on the usual pieces
            with the weights blank, which is thirty seconds with the outline
            open; the other hands the outline to Claude. */}
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            onClick={open}
            className="h-10 flex-1 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            Type it in
          </button>
          <button
            type="button"
            onClick={askClaude}
            className="h-10 flex-1 rounded-[10px] border border-line-strong text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
          >
            Ask Claude to read the outline
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow m-0">Where the grade stands</p>
        <button
          type="button"
          onClick={open}
          className="bg-transparent p-0 font-serif text-[12px] italic text-muted transition-colors hover:text-ink"
        >
          edit
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2.5">
        <p className="m-0 max-w-[18ch] font-serif text-[17px] leading-[1.25]">
          {round(standing.marked)}% marked
          {standing.percent !== null && `, and you are at ${round(standing.earned)} of it.`}
        </p>
        {standing.percent !== null && (
          <p className="m-0 flex-none font-mono text-[24px] font-semibold leading-[0.9] tabular-nums">
            {standing.percent}
            <span className="text-[12px] font-normal text-muted">%</span>
          </p>
        )}
      </div>

      <div className="mt-3">
        {standing.rows.map((row) => {
          const marked = row.score !== null && row.outOf;
          const ratio = marked ? (row.score as number) / (row.outOf as number) : null;
          // A piece a drop rule has excluded. It stays on the list, struck
          // through, because "the quiz I bombed is the one being dropped" is
          // the single most reassuring thing this panel can show.
          const isDropped = standing.dropped.includes(row.id);
          // The dated piece this row is waiting on, so an unmarked midterm can
          // say how far off it is rather than sitting blank.
          const upcoming = tasks.find(
            (t) =>
              !t.completed &&
              t.dueDate &&
              t.dueDate >= today &&
              t.title.toLowerCase() === row.label.toLowerCase(),
          );
          return (
            <div
              key={row.id}
              className="flex items-baseline gap-2.5 border-b border-line-soft py-2 last:border-b-0"
            >
              <span
                className="min-w-0 flex-1 truncate text-[13px]"
                style={{
                  color: marked && !isDropped ? undefined : 'var(--ink-soft)',
                  textDecoration: isDropped ? 'line-through' : undefined,
                }}
              >
                {row.label}
                {isDropped && (
                  <span className="ml-1.5 font-serif text-[12px] italic text-muted no-underline">
                    {marked ? 'dropped' : 'held out'}
                  </span>
                )}
                {upcoming && !isDropped && (
                  <span className="ml-1.5 font-serif italic text-warn">
                    in {daysBetween(today, upcoming.dueDate as string)}d
                  </span>
                )}
              </span>
              <span className="tnum shrink-0 font-mono text-[11px] text-muted">{round(row.weight)}%</span>
              <span className="w-[46px] flex-none text-right">
                {marked ? (
                  <span
                    className="tnum font-mono text-[12px] font-semibold"
                    style={{
                      color: isDropped
                        ? 'var(--muted)'
                        : (ratio as number) < 0.66
                          ? 'var(--warn)'
                          : undefined,
                    }}
                  >
                    {row.outOf === 100 ? row.score : `${row.score}/${row.outOf}`}
                  </span>
                ) : (
                  <span aria-label="Not marked yet" className="flex justify-end">
                    <i aria-hidden className="block h-[1.4px] w-[18px] bg-line-strong" />
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* A piece that has not come back cannot be ranked, so until enough have,
          the ones furthest out sit out and the marks already held all count.
          Struck through and called "dropped" read as a verdict on a paper that
          has not happened. */}
      {standing.rows.some(
        (row) => standing.dropped.includes(row.id) && (row.score === null || !row.outOf),
      ) && (
        <p className="m-0 mt-3 font-serif text-[13px] italic leading-[1.5] text-muted">
          The lowest scores are only dropped once enough have come back to say which.
          Until then, the ones still to come are held out.
        </p>
      )}

      {standing.unmarked > 0 && (
        <p className="m-0 mt-3 font-serif text-[13px] italic leading-[1.5] text-muted">
          {round(standing.unmarked)}% of {course.code} has not happened yet.
        </p>
      )}

      {standing.basis === 'relative' && (
        <p className="m-0 mt-1 font-serif text-[13px] italic leading-[1.5] text-muted">
          {course.code} is marked against the class, so this is a position
          rather than a grade.
        </p>
      )}
    </section>
  );
}

function basisSentence(basis: 'absolute' | 'relative', code: string): string {
  return basis === 'relative'
    ? `${code} is graded relatively, against the class.`
    : `${code} is graded absolutely, on a fixed scale.`;
}

function dropSentence(rule: DropRule, rows: Assessment[]): string {
  const size = rows.filter((row) => row.group === rule.group).length;
  return `Of the ${size} in ${rule.group}, the best ${rule.keep} count.`;
}

/**
 * A revised scheme keeps the marks already entered.
 *
 * A proposal arrives with every score blank, so accepting it as it stands
 * would wipe a term of marks the moment the outline changed. Each mark moves
 * to the proposed row with the same label, ignoring case and spacing, and a
 * mark with nowhere to go is named on the card before the accept rather than
 * quietly lost.
 */
function carryMarks(accepted: Assessment[], proposed: Assessment[]) {
  const key = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');
  const held = new Map(
    accepted.filter((row) => row.score !== null && row.outOf).map((row) => [key(row.label), row]),
  );
  const used = new Set<string>();
  const rows = proposed.map((row) => {
    const k = key(row.label);
    const was = held.get(k);
    // One mark lands on one row, even if the proposal repeats a label.
    if (!was || row.score !== null || used.has(k)) return row;
    used.add(k);
    return { ...row, score: was.score, outOf: was.outOf };
  });
  const lost = [...held.entries()].filter(([k]) => !used.has(k)).map(([, row]) => row.label);
  return { rows, lost };
}

/** What most courses are marked on, offered with the weights blank. */
const USUAL_PIECES = ['Quizzes', 'Assignments', 'Midterm', 'Final', 'Participation'];

function blankRow(index: number): Assessment {
  return {
    id: `a-${Date.now().toString(36)}-${index}`,
    label: '',
    weight: 0,
    score: null,
    outOf: 100,
  };
}

function number(value: string): number {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function percent(value: string): number {
  return Math.min(100, Math.max(0, number(value)));
}

function round(value: number): number {
  return Math.round(value);
}
