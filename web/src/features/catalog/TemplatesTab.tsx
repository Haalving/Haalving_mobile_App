'use client';

import { useState } from 'react';

import { Empty, IconTile, Notice, Num, Sheet, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { TemplateEditor, TemplateStatusPill } from './TemplateEditor';
import { useSaveTemplate, type CatalogData, type PlanTemplate } from './queries';

/**
 * Templates — one pillar, one level, one category, fourteen days.
 *
 * Ported from console-catalog.js:908-1035.
 *
 * "n OF 14 DAYS WRITTEN" IS AN HONEST READING, not a progress bar. A blank day
 * is legitimate — Fitness runs on alternate days and its rest days carry nothing
 * at all — so the seed stores every day PRESENT with an empty `slots` rather than
 * omitting it. The difference between a rest day and an unwritten one is a
 * distinction the author actually made, and dropping the empty days would erase
 * it.
 *
 * A DRAFT IS ASSIGNABLE ONLY ONCE THE CHAIN HAS PUBLISHED IT, and a published
 * template is frozen: the server refuses to delete one until it is unpublished,
 * because a client's live plan may already be built from it.
 */

const PILLAR_CLASS: Record<string, string> = {
  fitness: 'p-fitness',
  culture: 'p-culture',
  yoga: 'p-yoga',
  wellness: 'p-wellness',
  motivation: 'p-motivation',
};

/**
 * The shelf label, in the order a coach says it out loud.
 *
 * The category is printed with CONFIGURATION'S OWN NAME rather than the stored
 * key: the key is 'sedentary' and the shelf is "Sedentary", and a rename in
 * Configuration has to reach every place the word appears or two screens end up
 * calling one shelf two things.
 */
function Shelf({
  t,
  libName,
  trackName,
}: {
  t: PlanTemplate;
  libName: (k: string) => string;
  trackName: (k: string) => string;
}) {
  return (
    <span className={`tshelf ${PILLAR_CLASS[t.pillar] ?? ''}`}>
      <span className="tsp">{libName(t.pillar)}</span>
      <span className="tsl">
        L<span className="num">{t.level}</span>
      </span>
      <span className="tst">{trackName(t.track)}</span>
    </span>
  );
}

function dayCounts(t: PlanTemplate): { written: number; total: number } {
  const days = t.days ?? {};
  const nums = Object.keys(days);
  const written = nums.filter((d) => (days[d]?.slots ?? []).length > 0).length;
  return { written, total: nums.length };
}

function FilterRow({
  label,
  opts,
  current,
  onPick,
}: {
  label: string;
  opts: Array<{ v: string; t: React.ReactNode }>;
  current: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="tfil" role="group" aria-label={label}>
      {opts.map((o) => {
        const on = current === o.v;
        return (
          <button
            type="button"
            key={o.v || 'all'}
            className={on ? 'on' : ''}
            {...(on ? { 'aria-current': 'true' as const } : {})}
            onClick={() => onPick(o.v)}
          >
            {o.t}
          </button>
        );
      })}
    </div>
  );
}

export function TemplatesTab({ data }: { data: CatalogData }) {
  const save = useSaveTemplate();
  const toast = useToast();

  const [pillar, setPillar] = useState('');
  const [level, setLevel] = useState('');
  const [track, setTrack] = useState('');

  const [open, setOpen] = useState<PlanTemplate | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', pillar: 'fitness', level: '1', track: 'sedentary', notes: '' });

  const libName = (k: string) => data.libraries.find((l) => l.key === k)?.name ?? k;
  const trackName = (k: string) => data.categories.find((c) => c.key === k)?.name ?? k;
  const canAuthor = data.canEditAny || data.libraries.some((l) => l.canEdit);

  const shown = data.templates.filter(
    (t) =>
      (!pillar || t.pillar === pillar) &&
      (!level || String(t.level) === level) &&
      (!track || t.track === track),
  );

  /* seven rungs, from the programme shape the rest of the console reads */
  const LEVELS = [1, 2, 3, 4, 5, 6, 7];

  const submit = () => {
    const name = draft.name.trim();
    if (!name) {
      toast('Give the template a name first.');
      return;
    }
    save.mutate(
      {
        body: {
          name,
          pillar: draft.pillar,
          level: Number(draft.level) || 1,
          track: draft.track,
          notes: draft.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setAdding(false);
          toast(`Added — ${name}`);
        },
        onError: (e) => toast((e as Error).message),
      },
    );
  };

  /* clicking a template REPLACES the list with the full-page editor, the way the
     demo's #/catalog/templates/:id route does — not a modal over the list.
     The editor is handed the row AS THE CATALOG NOW READS IT rather than the one
     clicked: a signature given in Approvals re-reads this page, and the pill and
     the lock have to move with it while the editor is still open. */
  if (open) {
    return (
      <TemplateEditor
        key={open.id}
        template={data.templates.find((t) => t.id === open.id) ?? open}
        data={data}
        onClose={() => setOpen(null)}
        onOpenTemplate={(t) => setOpen(t)}
      />
    );
  }

  return (
    <>
      <div className="h1-row">
        <div>
          <div className="sec-title" style={{ margin: 0 }}>
            Templates
          </div>
          <p className="sub" style={{ margin: 'var(--s1) 0 0' }}>
            One pillar, one level, one category — <Num>14</Num> days built from the libraries beside
            this tab. A draft is assignable only once the approval chain has published it.
          </p>
        </div>
        {canAuthor ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setDraft({ name: '', pillar: 'fitness', level: '1', track: 'sedentary', notes: '' });
              setAdding(true);
            }}
          >
            <Icon name="plus" />
            New template
          </button>
        ) : null}
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)', marginBottom: 'var(--s3)' }}
      >
        <FilterRow
          label="Pillar"
          current={pillar}
          onPick={setPillar}
          opts={[
            { v: '', t: 'All pillars' },
            ...data.libraries.map((l) => ({ v: l.key, t: l.name })),
          ]}
        />
        <FilterRow
          label="Level"
          current={level}
          onPick={setLevel}
          opts={[
            { v: '', t: 'All levels' },
            ...LEVELS.map((n) => ({
              v: String(n),
              t: (
                <>
                  L<span className="num">{n}</span>
                </>
              ),
            })),
          ]}
        />
        <FilterRow
          label="Category"
          current={track}
          onPick={setTrack}
          opts={[
            { v: '', t: 'All categories' },
            ...data.categories.map((c) => ({ v: c.key, t: c.name })),
          ]}
        />
      </div>

      <div className="list">
        {shown.length ? (
          shown.map((t) => {
            const { written, total } = dayCounts(t);
            return (
              <button type="button" className="trow click" key={t.id} onClick={() => setOpen(t)}>
                <IconTile name="bookmark" />
                <span className="grow">
                  <b>{t.name}</b>
                  <small>{t.notes ?? ''}</small>
                  <small className="audit">
                    By {t.createdBy?.name ?? 'an author since removed'} · <Num>{written}</Num> of{' '}
                    <Num>{total}</Num> days written
                  </small>
                </span>
                <Shelf t={t} libName={libName} trackName={trackName} />
                <TemplateStatusPill t={t} />
              </button>
            );
          })
        ) : (
          <Empty
            icon="bookmark"
            sentence={
              data.templates.length
                ? 'No template on that shelf yet. Clear a filter, or start one here.'
                : 'No templates yet. Start one and fill its days in.'
            }
          />
        )}
      </div>

      {/* ------------------------------------------------------------- new -- */}
      <Sheet open={adding} onClose={() => setAdding(false)} label="New template">
        <div className="h1">New template</div>
        <p className="sub">
          A template belongs to exactly one pillar, one level and one category. Its days are filled
          in afterwards.
        </p>

        <label className="field-label" htmlFor="tp-name">
          Name
        </label>
        <input
          className="input"
          id="tp-name"
          value={draft.name}
          placeholder="e.g. Foundations — L1 Sedentary"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />

        <label className="field-label" htmlFor="tp-pillar">
          Pillar
        </label>
        <select
          className="input"
          id="tp-pillar"
          value={draft.pillar}
          onChange={(e) => setDraft((d) => ({ ...d, pillar: e.target.value }))}
        >
          {data.libraries.map((l) => (
            <option key={l.key} value={l.key}>
              {l.name}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="tp-level">
          Level
        </label>
        <select
          className="input"
          id="tp-level"
          value={draft.level}
          onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value }))}
        >
          {LEVELS.map((n) => (
            <option key={n} value={String(n)}>
              L{n}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="tp-track">
          Category
        </label>
        <select
          className="input"
          id="tp-track"
          value={draft.track}
          onChange={(e) => setDraft((d) => ({ ...d, track: e.target.value }))}
        >
          {data.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="tp-notes">
          Description
        </label>
        <textarea
          className="input"
          id="tp-notes"
          rows={3}
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />

        <Notice>
          A level the programme does not have is refused — Configuration owns how many rungs there
          are.
        </Notice>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
          <button type="button" className="btn" disabled={save.isPending} onClick={submit}>
            Create template
          </button>
        </div>
      </Sheet>
    </>
  );
}
