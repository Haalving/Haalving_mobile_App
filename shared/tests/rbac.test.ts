import { describe, expect, it } from 'vitest';

import {
  NAV_ITEMS,
  ROLES,
  ROLE_KEYS,
  STAFF_ROLE_KEYS,
  STORABLE_ROLE_KEYS,
  allowedView,
  can,
  homePath,
  navFor,
  roleTitle,
} from '../src/rbac.js';

/**
 * These are lock tests, not behaviour tests. The matrix was ported verbatim from
 * the demo and the brief forbids adding, removing or renaming a role or a
 * permission — so the assertions below are deliberately literal. A diff here is
 * meant to be loud.
 */

describe('the matrix is the demo matrix', () => {
  it('carries exactly twelve roles, in the demo order', () => {
    expect(ROLE_KEYS).toEqual([
      'client', 'admin', 'opsmgr', 'opshead', 'core', 'doctor',
      'dietitian', 'fitness', 'yoga', 'mind', 'hod', 'ai',
    ]);
  });

  it('stores eleven of them and shows ten in the console', () => {
    /* `ai` is a pseudo-role: HV.staff() invents that user rather than reading
       one, and a stored ai account would sign house content "AI Coach" — a lie,
       and a breach of the rule that a Poorna client never hears the AI. */
    expect(STORABLE_ROLE_KEYS).toHaveLength(11);
    expect(STORABLE_ROLE_KEYS).not.toContain('ai');
    expect(STAFF_ROLE_KEYS).toHaveLength(10);
    expect(STAFF_ROLE_KEYS).not.toContain('client');
  });

  it('keeps the titles the product says out loud', () => {
    expect(roleTitle('admin')).toBe('Super Admin');
    /* renamed from Ops Manager; the key stayed */
    expect(roleTitle('opsmgr')).toBe('Haalving Coach');
    expect(roleTitle('core')).toBe('Super User');
    /* the demo's spelling, kept verbatim */
    expect(roleTitle('dietitian')).toBe('Dietician');
    expect(roleTitle('mind')).toBe('Mind Wellness Coach');
    expect(roleTitle('hod')).toBe('Head of Department');
  });

  it('gives the Super Admin all nine sidebar items in order', () => {
    expect(ROLES.admin.nav).toEqual([
      'home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'people', 'leave', 'config',
    ]);
  });

  it('gives a coach six, with no People, Community or Configuration', () => {
    const coachNav = ['home', 'clients', 'queues', 'schedule', 'catalog', 'leave'];
    expect(ROLES.fitness.nav).toEqual(coachNav);
    expect(ROLES.yoga.nav).toEqual(coachNav);
    expect(ROLES.mind.nav).toEqual(coachNav);
    expect(ROLES.dietitian.nav).toEqual(coachNav);
    expect(ROLES.doctor.nav).toEqual(coachNav);
  });

  it('lands each role where the demo lands it', () => {
    expect(homePath('admin')).toBe('/home');
    /* the Super User's job is the approvals queue, so that is the front door */
    expect(homePath('core')).toBe('/queues/approvals');
    /* the dietitian opens on the meal queue — the signature surface */
    expect(homePath('dietitian')).toBe('/queues/meals');
    expect(homePath('client')).toBe('/today');
  });

  it('names the sidebar items the way both apps do', () => {
    expect(NAV_ITEMS.queues.label).toBe('Work Queues');
    expect(NAV_ITEMS.people.label).toBe('People & Access');
    expect(NAV_ITEMS.leave.label).toBe('Time & Cover');
    /* Tribe became Community (TJ, 17 Aug) — staff and clients name it identically */
    expect(NAV_ITEMS.community.label).toBe('Community');
  });
});

describe('can', () => {
  it('makes the Doctor the only holder of rawRecords', () => {
    const holders = STORABLE_ROLE_KEYS.filter((r) => can(r, 'rawRecords'));
    expect(holders).toEqual(['doctor']);
  });

  it('keeps capacity overrides with the two roles that own the decision', () => {
    const holders = STORABLE_ROLE_KEYS.filter((r) => can(r, 'overrideCapacity'));
    expect(holders.sort()).toEqual(['admin', 'opshead']);
  });

  it('lets only the Super Admin manage people', () => {
    const holders = STORABLE_ROLE_KEYS.filter((r) => can(r, 'managePeople'));
    expect(holders).toEqual(['admin']);
  });

  it('gives the Super User the signature and nothing else', () => {
    expect(ROLES.core.perms).toEqual(['seeAllClients', 'approve']);
    expect(can('core', 'editTemplates')).toBe(false);
    expect(can('core', 'managePeople')).toBe(false);
  });

  it('gives the AI pseudo-role no permission at all', () => {
    expect(ROLES.ai.perms).toEqual([]);
    expect(can('ai', 'approve')).toBe(false);
  });

  it('answers false for an unknown role rather than throwing', () => {
    expect(can('nobody', 'approve')).toBe(false);
    expect(can(null, 'approve')).toBe(false);
    expect(can(undefined, 'approve')).toBe(false);
  });
});

describe('allowedView — console access IS nav membership', () => {
  it('lets the Super Admin into People & Access', () => {
    expect(allowedView('admin', 'people')).toBe(true);
  });

  it('locks a Fitness Coach out of People, Community and Configuration', () => {
    expect(allowedView('fitness', 'people')).toBe(false);
    expect(allowedView('fitness', 'community')).toBe(false);
    expect(allowedView('fitness', 'config')).toBe(false);
  });

  it('lights a parent item from its sub-routes', () => {
    /* #/client/<id> and #/review both belong to Clients */
    expect(allowedView('fitness', 'client')).toBe(true);
    expect(allowedView('fitness', 'review')).toBe(true);
    /* the four queue boards all belong to Work Queues */
    expect(allowedView('dietitian', 'meals')).toBe(true);
    expect(allowedView('dietitian', 'approvals')).toBe(true);
  });

  it('keeps the medical board behind Work Queues for everyone, and rawRecords behind the perm', () => {
    /* the board is reachable — the RAW RECORD inside it is what the Doctor
       alone may open, and that is a second, separate check */
    expect(allowedView('fitness', 'medical')).toBe(true);
    expect(can('fitness', 'rawRecords')).toBe(false);
    expect(can('doctor', 'rawRecords')).toBe(true);
  });

  it('never admits the client shell to a console view', () => {
    expect(allowedView('client', 'home')).toBe(false);
    expect(allowedView('client', 'clients')).toBe(false);
  });

  it('refuses an unknown view instead of defaulting open', () => {
    expect(allowedView('admin', 'nowhere')).toBe(false);
  });
});

describe('navFor', () => {
  it('returns the matrix order, never a sorted one', () => {
    expect(navFor('opsmgr').map((n) => n.key)).toEqual([
      'home', 'clients', 'queues', 'schedule', 'catalog', 'community', 'leave',
    ]);
  });

  it('carries the path, label, icon and owned sub-routes', () => {
    const clients = navFor('admin').find((n) => n.key === 'clients');
    expect(clients).toMatchObject({
      path: '/clients',
      label: 'Clients',
      icon: 'users',
      owns: ['client', 'review'],
    });
  });

  it('gives the client shell no sidebar', () => {
    expect(navFor('client')).toEqual([]);
  });
});
