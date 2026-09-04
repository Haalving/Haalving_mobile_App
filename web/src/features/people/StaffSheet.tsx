'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEPTS,
  DERIVED_TAGS,
  LEVEL_KEYS,
  LEVELS,
  STAFF_ROLE_KEYS,
  availWindows,
  fmtTime,
  roleTitle,
  type Weekday,
} from '@haalving/shared';

import { Audit, Notice, SecTitle, Sheet, useToast } from '@/components/ui';
import { Icon } from '@/components/icons/Icon';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/can';
import {
  useCreateStaff,
  useUpdateStaff,
  type Availability,
  type StaffRecord,
} from '@/features/people/queries';

/**
 * Add an employee, or edit one — `staffFieldsHtml` (console-people.js:583).
 *
 * ONE FIELD SET SERVES BOTH SHEETS, in the demo's order, so the form somebody
 * learns creating a seat is the form they meet editing one. What the port adds
 * is the half the demo never needed: the demo has no login, so it has no work
 * email, no starting password and no phone. Those sit together after the grid.
 *
 * THE SHEET NEVER CLOSES ON A FAILURE. It used to: a create that came back
 * `net::ERR_CONNECTION_REFUSED` ran the same `onClose()` a success did, so the
 * sheet folded away, the list did not change, and the person reported "adding an
 * employee is not working" — which was true, and the console had said nothing.
 * `onClose()` is now called from exactly one place: the success callback. Every
 * other outcome paints a sentence at the top of a sheet that is still open, with
 * the fields still filled in.
 *
 * A ROLE CHANGE IS NOT PART OF THIS FORM. It rewrites what a person can see and
 * travels its own route with its own reason, so the select is locked once the
 * seat exists rather than dropped — the grid keeps the demo's shape either way.
 */

/* the demo's own slug: every non-alphanumeric goes, no separators kept */
function slug(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A typed tag may not borrow a derived name.
 *
 * Case-insensitive both ways, and duplicates collapse. Storing "On leave" would
 * produce a tag that never clears and a chip that keeps matching after the leave
 * ended — the board would print a label the record itself contradicts.
 */
function readTags(raw: string): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const piece of raw.split(',')) {
    const t = piece.trim();
    if (!t) continue;
    const low = t.toLowerCase();
    if (DERIVED_TAGS.some((d) => d.toLowerCase() === low)) {
      dropped.push(t);
      continue;
    }
    if (kept.some((k) => k.toLowerCase() === low)) continue;
    kept.push(t);
  }
  return { kept, dropped };
}

/** The tail the save toast adds when something was refused. */
function droppedNote(dropped: string[]): string {
  if (!dropped.length) return '';
  return ` ${dropped.join(', ')} left off — the record works ${
    dropped.length === 1 ? 'that' : 'those'
  } out already.`;
}

const WEEK: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/**
 * `Mon–Fri 6 am–10 am and 5 pm–9 pm · Sat 6 am–10 am · Sun off`.
 *
 * Consecutive days carrying the SAME shift collapse into one span, which is how
 * a person describes their own week — seven lines saying the same thing is a
 * table, not a sentence.
 */
function AvailSummary({ avail }: { avail: Availability | undefined }) {
  const parts = useMemo(() => {
    const user = { id: 'sum', name: 'sum', avail };
    const shiftOf = (d: Weekday) => {
      const w = availWindows(user, d);
      return w.length ? w.map(([a, b]) => `${fmtTime(a)}–${fmtTime(b)}`).join(' and ') : null;
    };
    const out: Array<{ label: string; shift: string | null }> = [];
    let i = 0;
    while (i < WEEK.length) {
      const r = shiftOf(WEEK[i] as Weekday);
      let j = i;
      while (j + 1 < WEEK.length && shiftOf(WEEK[j + 1] as Weekday) === r) j++;
      const label =
        i === j
          ? DAY_NAMES[WEEK[i] as Weekday]
          : `${DAY_NAMES[WEEK[i] as Weekday]}–${DAY_NAMES[WEEK[j] as Weekday]}`;
      out.push({ label, shift: r });
      i = j + 1;
    }
    return out;
  }, [avail]);

  if (!avail || !parts.some((p) => p.shift)) return <>Not set yet</>;

  return (
    <>
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 ? ' · ' : ''}
          {p.label} {p.shift ? <span className="num">{p.shift}</span> : 'off'}
        </span>
      ))}
    </>
  );
}

export function StaffSheet({
  member,
  onClose,
}: {
  /** null creates; a record edits. */
  member: StaffRecord | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const canManage = useCan('managePeople');

  const create = useCreateStaff();
  const update = useUpdateStaff();

  /* the demo's own field-id prefixes, so a label and its input stay paired */
  const p = member ? 'es' : 'ae';

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState(member?.name ?? '');
  const [role, setRole] = useState(member?.role ?? 'fitness');
  const [dept, setDept] = useState(member?.dept ?? '');
  const [level, setLevel] = useState(member?.level ?? 2);
  const [joinedAt, setJoinedAt] = useState((member?.joinedAt ?? '').slice(0, 10) || todayISO());
  const [emName, setEmName] = useState(member?.emergency?.name ?? '');
  const [emPhone, setEmPhone] = useState(member?.emergency?.phone ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [subtitle, setSubtitle] = useState(member?.subtitle ?? '');
  const [tagsText, setTagsText] = useState((member?.typedTags ?? []).join(', '));
  const [memo, setMemo] = useState(member?.memo ?? '');
  const [cvName, setCvName] = useState(member?.cvName ?? '');

  /*
   * BRING THE REFUSAL TO THE PERSON WHO CAUSED IT.
   *
   * This sheet is taller than the viewport, so the submit button sits at the
   * bottom while the notice renders at the top. A save refused for a missing
   * work email printed a perfectly clear sentence two screens above the button
   * that had just been pressed — from the chair it read as a dead button, which
   * is the single worst thing a form can do.
   */
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  /**
   * Everything that is not a success.
   *
   * A 400 carries a sentence per field and those go under the fields. Anything
   * else — and a network failure is the common one — gets a sentence a person
   * can act on, because `Failed to fetch` is not one. In neither case does the
   * sheet close.
   */
  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.details) setFieldErrors(err.details);
      setError(err.message);
      return;
    }
    /* fetch() rejects with a bare TypeError when the request never reached a
       server at all: wrong API URL, API not running, CORS, offline */
    const unreachable = err instanceof TypeError;
    setError(
      unreachable
        ? `The API could not be reached, so ${
            member ? 'this record is unchanged' : 'nobody was added'
          }. Check the API is running and try again — nothing was lost from this form.`
        : `That did not save${
            err instanceof Error && err.message ? ` — ${err.message}` : '.'
          } Nothing was changed; try again.`,
    );
  };

  const busy = create.isPending || update.isPending;

  const submit = () => {
    setError(null);
    setFieldErrors({});

    const missing: Record<string, string> = {};
    if (!name.trim()) missing.name = 'Give the employee a name first.';
    /* the schema wants a name AND a number on an emergency contact, so half of
       one is a 400 the person cannot read — say it here instead */
    if ((emName.trim() && !emPhone.trim()) || (!emName.trim() && emPhone.trim())) {
      missing.emergency = 'An emergency contact needs both a name and a number.';
    }
    if (!member) {
      if (!email.trim()) missing.email = 'A console account needs an email to sign in with';
      if (password.trim().length < 10) {
        missing.password = 'At least 10 characters — this is how they sign in.';
      }
    }
    if (Object.keys(missing).length) {
      setFieldErrors(missing);
      setError('Some fields need another look.');
      return;
    }

    const { kept, dropped } = readTags(tagsText);
    const emergency = emName.trim() && emPhone.trim()
      ? { name: emName.trim(), phone: emPhone.trim() }
      : null;
    /* the date input hands back '' when it is cleared, and the schema wants
       YYYY-MM-DD — sending the empty string is a 400 nobody caused on purpose */
    const doj = /^\d{4}-\d{2}-\d{2}$/.test(joinedAt) ? { joinedAt } : {};

    if (member) {
      update.mutate(
        {
          id: member.id,
          input: {
            name: name.trim(),
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            subtitle: subtitle.trim() || null,
            dept: (dept || null) as never,
            level,
            ...doj,
            emergency,
            tags: kept,
            memo: memo.trim() || null,
            cvName: cvName.trim() || null,
          },
        },
        {
          onSuccess: () => {
            toast(`${name.trim()} — record updated.${droppedNote(dropped)}`);
            onClose();
          },
          onError: fail,
        },
      );
      return;
    }

    create.mutate(
      {
        name: name.trim(),
        role: role as never,
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        /* the TRIMMED value, because that is the one the length check above
           measured — storing a password with invisible trailing spaces means a
           first sign-in that fails for a reason nobody can see */
        password: password.trim(),
        ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
        dept: (dept || null) as never,
        level,
        ...doj,
        emergency,
        tags: kept,
        memo: memo.trim() || null,
        cvName: cvName.trim() || null,
        tz: 'Asia/Kolkata',
        status: 'active',
      },
      {
        onSuccess: () => {
          toast(
            `${name.trim()} added — in the staff list, capacity and every assignment picker now.${droppedNote(dropped)}`,
          );
          onClose();
        },
        onError: fail,
      },
    );
  };

  /*
   * "Attach CV" ATTACHES NOTHING, and says so.
   *
   * There is no object store in this deployment — `R2_*` are empty in
   * `backend/src/config/env.ts` — so `updateUserSchema.cvKey` stays null and only
   * `cvName` is stored. The button stamps the filename a human recognises, which
   * is exactly what the demo does; the toast refuses to imply a file was saved,
   * because a record that claims to hold a CV it does not hold is worse than one
   * that holds none.
   */
  const attach = () => {
    setCvName(`${slug(name) || 'coach'}-cv.pdf`);
    toast('Filename recorded; the file itself is not uploaded yet.');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      variant="tall"
      label={member ? `Edit ${member.name}` : 'Add employee'}
    >
      <div className="h1">{member ? `Edit ${member.name}` : 'Add employee'}</div>

      <div ref={errorRef}>{error ? <Notice kind="bad">{error}</Notice> : null}</div>

      {!canManage ? (
        /* a disabled button with no reason beside it is indistinguishable from
           a broken one */
        <Notice>Only a seat with Manage people may change the team.</Notice>
      ) : null}

      <label className="field-label" htmlFor={`${p}-name`}>
        Name <span className="req">*</span>
      </label>
      <input
        className="input"
        id={`${p}-name`}
        placeholder="Full name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {fieldErrors.name ? <p className="field-err">{fieldErrors.name}</p> : null}

      <div className="grid2">
        <div>
          <label className="field-label" htmlFor={`${p}-role`}>
            Role
          </label>
          <select
            className="input"
            id={`${p}-role`}
            value={role}
            disabled={!!member}
            onChange={(e) => setRole(e.target.value)}
          >
            {STAFF_ROLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {roleTitle(k)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`${p}-dept`}>
            Department
          </label>
          <select
            className="input"
            id={`${p}-dept`}
            value={dept}
            onChange={(e) => setDept(e.target.value)}
          >
            <option value="">No department</option>
            {Object.entries(DEPTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          {fieldErrors.dept ? <p className="field-err">{fieldErrors.dept}</p> : null}
        </div>
        <div>
          <label className="field-label" htmlFor={`${p}-level`}>
            Level
          </label>
          <select
            className="input"
            id={`${p}-level`}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          >
            {LEVEL_KEYS.map((n) => (
              <option key={n} value={n}>
                {LEVELS[n]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor={`${p}-doj`}>
            Date of joining
          </label>
          <input
            className="input"
            type="date"
            id={`${p}-doj`}
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
          />
          {fieldErrors.joinedAt ? <p className="field-err">{fieldErrors.joinedAt}</p> : null}
        </div>
        <div>
          <label className="field-label" htmlFor={`${p}-ename`}>
            Emergency contact
          </label>
          <input
            className="input"
            id={`${p}-ename`}
            placeholder="Name"
            value={emName}
            onChange={(e) => setEmName(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor={`${p}-ephone`}>
            Emergency phone
          </label>
          <input
            className="input"
            id={`${p}-ephone`}
            placeholder="+91 …"
            value={emPhone}
            onChange={(e) => setEmPhone(e.target.value)}
          />
        </div>
      </div>
      {fieldErrors.emergency ? <p className="field-err">{fieldErrors.emergency}</p> : null}

      {/* THE HALF THE DEMO HAS NO EQUIVALENT FOR. The demo has no login, so it
          has no work email, no starting password and no phone; the port's seats
          sign in, and a seat created without an address cannot. */}
      <label className="field-label" htmlFor={`${p}-email`}>
        Work email {member ? null : <span className="req">*</span>}
      </label>
      <input
        className="input"
        type="email"
        id={`${p}-email`}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {fieldErrors.email ? <p className="field-err">{fieldErrors.email}</p> : null}

      {!member ? (
        <>
          <label className="field-label" htmlFor={`${p}-pw`}>
            Starting password <span className="req">*</span>
          </label>
          <input
            className="input"
            type="password"
            id={`${p}-pw`}
            placeholder="At least 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {/* the server accepts a seat without one, and that seat cannot sign in
              — which reads as a broken account rather than an unfinished one */}
          <Audit>They sign in with this; you can change it later.</Audit>
          {fieldErrors.password ? <p className="field-err">{fieldErrors.password}</p> : null}
        </>
      ) : null}

      <label className="field-label" htmlFor={`${p}-phone`}>
        Phone
      </label>
      <input
        className="input"
        id={`${p}-phone`}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      {fieldErrors.phone ? <p className="field-err">{fieldErrors.phone}</p> : null}

      <label className="field-label" htmlFor={`${p}-sub`}>
        Subtitle (optional)
      </label>
      <input
        className="input"
        id={`${p}-sub`}
        placeholder="e.g. East pod"
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
      />

      <label className="field-label" htmlFor={`${p}-tags`}>
        Tags
      </label>
      <input
        className="input"
        id={`${p}-tags`}
        placeholder="Probation, First aid certified"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />
      <Audit>
        Comma-separated. {DERIVED_TAGS.join(', ')} are worked out from the record itself, so typing
        one here is left off.
      </Audit>

      <label className="field-label" htmlFor={`${p}-memo`}>
        Memo
      </label>
      <textarea
        className="input"
        id={`${p}-memo`}
        rows={2}
        placeholder="One line the team should know"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <label className="field-label" htmlFor={`${p}-cv`}>
        CV on file
      </label>
      <div className="row">
        <input
          className="input grow"
          id={`${p}-cv`}
          placeholder="filename.pdf"
          value={cvName}
          onChange={(e) => setCvName(e.target.value)}
        />
        <button type="button" className="btn sm ghost" style={{ flex: 'none' }} onClick={attach}>
          <Icon name="clip" /> Attach CV
        </button>
      </div>

      {member ? (
        <>
          <SecTitle>Availability</SecTitle>
          <p className="sub" style={{ margin: 0 }}>
            <AvailSummary avail={member.avail} />
          </p>
          <Audit>
            Availability is the coach&rsquo;s own week — edited in Time &amp; Cover, read-only here.
          </Audit>
        </>
      ) : (
        <Audit>
          A role change afterwards travels on its own, with a reason — it rewrites what this person
          can see.
        </Audit>
      )}

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--s3)' }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={busy || !canManage} onClick={submit}>
          {member ? 'Save changes' : 'Add employee'}
        </button>
      </div>
    </Sheet>
  );
}
