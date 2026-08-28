'use client';

import { useState } from 'react';
import { DEPTS, ROLES, STAFF_ROLE_KEYS, roleTitle } from '@haalving/shared';

import { Notice, Pill, SecTitle, Sheet, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/can';
import { AvailabilityEditor } from '@/features/people/AvailabilityEditor';
import {
  useCreateStaff,
  useUpdateAvailability,
  useUpdateCapacity,
  useUpdateStaff,
  type Availability,
  type StaffUser,
} from '@/features/people/queries';

/**
 * Create or edit a staff record.
 *
 * THREE THINGS TRAVEL SEPARATELY, because each is a different decision with a
 * different right behind it:
 *
 *  - the RECORD (name, contact, department) — ordinary editing, `managePeople`
 *  - AVAILABILITY — its own route, because the conflict engine refuses bookings
 *    against it and a half-saved week would refuse real sessions
 *  - CAPACITY — `allocate`, and going PAST a declared ceiling additionally needs
 *    `overrideCapacity` and a reason on the record
 *
 * A role change travels alone too and is not offered here: it rewrites what a
 * person can see, and must not ride along with a corrected phone number.
 */
export function StaffSheet({
  member,
  onClose,
}: {
  /** null creates; a record edits. */
  member: StaffUser | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const canManage = useCan('managePeople');
  const canAllocate = useCan('allocate');

  const create = useCreateStaff();
  const update = useUpdateStaff();
  const saveAvail = useUpdateAvailability();
  const saveCapacity = useUpdateCapacity();

  const [tab, setTab] = useState<'record' | 'hours' | 'capacity'>('record');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState(member?.name ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(member?.role ?? 'fitness');
  const [dept, setDept] = useState(member?.dept ?? '');
  const [level, setLevel] = useState(member?.level ?? 1);
  const [subtitle, setSubtitle] = useState(member?.subtitle ?? '');

  const [avail, setAvail] = useState<Availability>(member?.avail ?? {});
  const [declared, setDeclared] = useState(member?.capacity?.declared ?? 0);
  const [load, setLoad] = useState(member?.capacity?.load ?? 0);
  const [reason, setReason] = useState('');

  const isDeptRole = role in DEPTS || role === 'hod';
  const overCapacity = load > declared;

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      if (err.details) setFieldErrors(err.details);
      setError(err.message);
    } else {
      setError('Something went wrong. Try again.');
    }
  };

  const submitRecord = () => {
    setError(null);
    setFieldErrors({});

    if (member) {
      update.mutate(
        {
          id: member.id,
          input: {
            name,
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            subtitle: subtitle || null,
            dept: isDeptRole && dept ? (dept as never) : null,
            level,
          },
        },
        {
          onSuccess: () => {
            toast(`${name} updated.`);
            onClose();
          },
          onError: fail,
        },
      );
      return;
    }

    create.mutate(
      {
        name,
        role: role as never,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(password ? { password } : {}),
        ...(subtitle ? { subtitle } : {}),
        ...(isDeptRole && dept ? { dept: dept as never } : {}),
        level,
        tz: 'Asia/Kolkata',
        status: 'active',
      },
      {
        onSuccess: () => {
          toast(`${name} added to the team.`);
          onClose();
        },
        onError: fail,
      },
    );
  };

  const submitHours = () => {
    if (!member) return;
    setError(null);
    saveAvail.mutate(
      { id: member.id, avail },
      {
        onSuccess: () => toast(`${member.name}'s week saved.`),
        onError: fail,
      },
    );
  };

  const submitCapacity = () => {
    if (!member) return;
    setError(null);
    saveCapacity.mutate(
      {
        id: member.id,
        declared,
        load,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => toast(`${member.name}'s capacity saved.`),
        onError: fail,
      },
    );
  };

  const busy = create.isPending || update.isPending || saveAvail.isPending || saveCapacity.isPending;

  return (
    <Sheet open onClose={onClose} variant="tall" label={member ? `Edit ${member.name}` : 'Add someone'}>
      <div className="h1">{member ? member.name : 'Add someone'}</div>
      <p className="sub" style={{ margin: 0 }}>
        {member ? roleTitle(member.role) : 'A new seat on the team.'}
      </p>

      {member ? (
        <div className="tfil" role="tablist" aria-label="What to edit">
          <button type="button" className={tab === 'record' ? 'on' : ''} onClick={() => setTab('record')}>
            Record
          </button>
          <button type="button" className={tab === 'hours' ? 'on' : ''} onClick={() => setTab('hours')}>
            Working hours
          </button>
          {canAllocate ? (
            <button type="button" className={tab === 'capacity' ? 'on' : ''} onClick={() => setTab('capacity')}>
              Capacity
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <Notice kind="bad">{error}</Notice> : null}

      {tab === 'record' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)', marginTop: 'var(--s4)' }}>
          <div>
            <div className="field-label">Name</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            {fieldErrors.name ? <p className="sub">{fieldErrors.name}</p> : null}
          </div>

          {!member ? (
            <div>
              <div className="field-label">Role</div>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                {STAFF_ROLE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {ROLES[k].title}
                  </option>
                ))}
              </select>
              <p className="audit">
                A role change afterwards travels on its own, with a reason — it rewrites what this
                person can see.
              </p>
            </div>
          ) : null}

          {isDeptRole ? (
            <div>
              <div className="field-label">Department</div>
              <select className="input" value={dept} onChange={(e) => setDept(e.target.value)}>
                <option value="">— none —</option>
                {Object.entries(DEPTS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              {role === 'hod' ? (
                <p className="audit">
                  A Head of Department&rsquo;s whole scope is their bench, so this is required for
                  that role.
                </p>
              ) : null}
              {fieldErrors.dept ? <p className="sub">{fieldErrors.dept}</p> : null}
            </div>
          ) : null}

          <div>
            <div className="field-label">Work email</div>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {fieldErrors.email ? <p className="sub">{fieldErrors.email}</p> : null}
          </div>

          {!member ? (
            <div>
              <div className="field-label">Starting password</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
              {fieldErrors.password ? <p className="sub">{fieldErrors.password}</p> : null}
            </div>
          ) : null}

          <div>
            <div className="field-label">Phone</div>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {fieldErrors.phone ? <p className="sub">{fieldErrors.phone}</p> : null}
          </div>

          <div>
            <div className="field-label">Seniority</div>
            <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              <option value={1}>L1 — senior</option>
              <option value={2}>L2 — bench cover</option>
            </select>
          </div>

          <div>
            <div className="field-label">One line on them</div>
            <input
              className="input"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="e.g. Form first, load second — twelve injury-free years."
            />
          </div>

          <button type="button" className="btn block" disabled={busy || !canManage} onClick={submitRecord}>
            {member ? 'Save the record' : 'Add to the team'}
          </button>
        </div>
      ) : null}

      {tab === 'hours' && member ? (
        <div style={{ marginTop: 'var(--s4)' }}>
          <AvailabilityEditor value={avail} onChange={setAvail} readOnly={!canManage} />
          {canManage ? (
            <button type="button" className="btn block" disabled={busy} onClick={submitHours}>
              Save the week
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'capacity' && member ? (
        <div style={{ marginTop: 'var(--s4)', display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
          <div className="notice">
            Capacity is <b>declared, never derived</b>. It is a judgement by whoever runs the bench
            about how much of this coach&rsquo;s week is spoken for — not a count of pod seats.
          </div>

          <div className="grid2">
            <div>
              <div className="field-label">Ceiling</div>
              <input
                className="input"
                type="number"
                min={0}
                value={declared}
                onChange={(e) => setDeclared(Number(e.target.value))}
              />
            </div>
            <div>
              <div className="field-label">Carrying now</div>
              <input
                className="input"
                type="number"
                min={0}
                value={load}
                onChange={(e) => setLoad(Number(e.target.value))}
              />
            </div>
          </div>

          {overCapacity ? (
            <>
              <Notice kind="warn">
                <Pill kind="warn">OVER</Pill> {member.name} would be past their declared ceiling.
                Only the Operations Head or a Super Admin can approve that, and the reason goes on
                the record.
              </Notice>
              <div>
                <div className="field-label">Why</div>
                <input
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Two clients moved across while Sneha is away"
                />
                {fieldErrors.reason ? <p className="sub">{fieldErrors.reason}</p> : null}
              </div>
            </>
          ) : null}

          <button type="button" className="btn block" disabled={busy} onClick={submitCapacity}>
            Save capacity
          </button>
        </div>
      ) : null}

      <SecTitle>&nbsp;</SecTitle>
    </Sheet>
  );
}
