/* HAALVING console view — People & Access. Who is on the team, what each seat
   may do, and how loaded everyone is — and, for Super Admin, the editor for
   all three. The permission matrix is rendered FROM HV.store.roles (not the
   code-shipped HV.ROLES), so it cannot drift from the thing HV.can() and the
   router actually consult — that's the "cannot drift" guarantee Task 2 built.
   Edits (add employee, edit records, deactivate, matrix toggles, new role)
   are gated on HV.can('managePeople') — Super Admin only. Ops Head and Super
   User reach this page via ordinary nav membership and see it read-only.
   The Announcements tab is the team feed: composing needs can('broadcast');
   everyone with the nav reads it, and reading stamps teamFeedReads. */
(function () {
  'use strict';

  var TABS = [
    { key: 'staff',    label: 'Staff' },
    { key: 'roles',    label: 'Roles & permissions' },
    { key: 'capacity', label: 'Capacity' },
    { key: 'feed',     label: 'Announcements' },
  ];

  var STYLE =
    '<style>' +
    '.pa2-row{cursor:pointer}' +
    /* the headcount, top-left under the page title */
    '.pa2-head{display:flex; margin-bottom:var(--s4)}' +
    '.pa2-head .stat{min-width:15rem}' +
    /* search + Add employee on ONE line. .input ships width:100%, which as a
       flex item resolves to a 100% basis and wraps the button onto its own
       row — so the width is handed back to flex here. */
    '.pa2-tools{display:flex; gap:var(--s3); align-items:center; flex-wrap:wrap}' +
    '.pa2-tools .input{flex:1 1 18rem; width:auto; min-width:12rem}' +
    /* two chip rows stacked — .tfil ships a --s4 top margin meant for one */
    '.pa2-fil{margin:var(--s2) 0}' +
    /* the name cell is the accessible affordance: a real button, so it is
       tab-reachable and Enter-activated without a keydown twin */
    '.pa2-name{display:flex; align-items:center; gap:var(--s2); background:none; border:0;' +
      ' padding:0; font:inherit; color:inherit; cursor:pointer; text-align:left}' +
    /* a name is one thing: "Suresh K." breaking after "Suresh" reads as two */
    '.pa2-name b{display:block; white-space:nowrap}' +
    '.pa2-name small{display:block; color:var(--ink-3)}' +
    '.pa2-id{font-size:var(--t-micro); color:var(--ink-3)}' +
    '.pa2-tags{display:flex; flex-wrap:wrap; gap:var(--s1)}' +
    '.pa2-acts{display:flex; gap:var(--s1)}' +
    /* SCOPED to this table on purpose — a <style> injected by a view is a
       global stylesheet, so a bare `table.data td` would reach every other
       table in the console */
    '.pa2-t td{white-space:nowrap}' +
    '.pa2-t td:first-child{white-space:normal}' +
    /* the hairline between the two halves of a split shift */
    '.pa2-split{color:var(--ink-3); line-height:1}' +
    '.pa2-week{display:grid; grid-template-columns:repeat(7,1fr); gap:var(--s1); margin-top:var(--s2)}' +
    '.pa2-day{background:var(--surface-2); border-radius:var(--r-sm); padding:var(--s2) var(--s1); text-align:center; display:flex; flex-direction:column; gap:var(--s1); min-width:0}' +
    '.pa2-day small{display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}' +
    '.pa2-off{opacity:.5}' +
    '.pa2-ann{margin-bottom:var(--s3)}' +
    '.pa2-ann p{margin:var(--s3) 0 0; color:var(--ink-2)}' +
    '</style>';

  /* perm vocabulary + display labels — the single source every view that
     needs to name a permission back to a human should import from here */
  HV.PERM_LABELS = {
    seeAllClients: 'See all clients', seeDeptClients: 'See department clients',
    approve: 'Sign approvals', allocate: 'Allocate team',
    overrideCapacity: 'Override capacity', editRules: 'Edit rules', finalizeLevel: 'Finalize levels',
    sendDigest: 'Bulk-send digest', keyInBody: 'Key in body records', rawRecords: 'Raw medical records',
    signSummary: 'Sign health summaries', rateMeals: 'Rate meals', buildDiet: 'Build diets',
    buildCharts: 'Build charts', editCatalog: 'Edit own catalog', editAnyCatalog: 'Edit all catalogs',
    editTemplates: 'Edit templates', assignPlan: 'Assign client plans', manageTribe: 'Manage community',
    assignPod: 'Assign pod seats',
    /* two announcement perms, and the difference is who hears it: `broadcast`
       posts to the STAFF feed on this page; `announceClients` sends into
       clients' own chat threads from the Community page. The old label read
       simply "Post announcements", which is ambiguous now they sit side by
       side in the same chip row. The KEY stays `broadcast` — renaming a perm
       key orphans it in every saved store.roles and silently removes access. */
    broadcast: 'Post team announcements', announceClients: 'Announce to clients',
    approveLeave: 'Approve leave', reassignLeave: 'Run leave reallocation',
    managePeople: 'Manage people & roles', manageConfig: 'Manage configuration',
    /* the door into any session room, including client sessions nobody put
       this person on. Everyone else reaches a room by being ON the task, so
       this is the one seat that needs a perm rather than a participant test —
       and it is a perm, not a role literal, so the matrix can move it. */
    joinAnySession: 'Join any session',
  };

  /* the no-lockout guard: these two seats on the admin role can never be
     switched off, or a Super Admin could strand every seat (including their
     own) with nobody left who can open this page to undo it */
  function isGuardedNav(roleKey, navId) { return roleKey === 'admin' && navId === 'people'; }
  function isGuardedPerm(roleKey, permId) { return roleKey === 'admin' && permId === 'managePeople'; }

  /* ---------------- id / key helpers ---------------- */
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  function newStaffId(name) {
    var base = 'u-' + slug(name);
    var taken = HV.store.users.some(function (u) { return u.id === base; });
    if (!taken) return base;
    HV.store.peopleSeq = (HV.store.peopleSeq || 0) + 1;
    return base + '-' + HV.store.peopleSeq;
  }
  function newRoleKey(name) {
    var base = 'r-' + slug(name);
    if (!HV.store.roles[base]) return base;
    HV.store.peopleSeq = (HV.store.peopleSeq || 0) + 1;
    return base + '-' + HV.store.peopleSeq;
  }

  /* if the nav item a role's `home` route resolves through is the one just
     turned off, `home` would point at a screen the role can no longer see —
     the router lock-screens it. Re-point home at the new first nav item
     (the same rule "New role" applies at creation). Toggling any OTHER nav
     id never touches home, so a deliberately customised home (Super User's
     approvals queue, Dietician's meal queue) survives unrelated edits. */
  function navIdForRoute(route) {
    var name = String(route || '').replace(/^#\//, '').split('/')[0];
    return HV.VIEW_NAV[name] || null;
  }
  function fixHomeIfOrphaned(role, removedNavId) {
    if (navIdForRoute(role.home) !== removedNavId) return;
    var next = role.nav[0];
    if (next && HV.NAV_ITEMS[next]) role.home = HV.NAV_ITEMS[next].route;
  }

  /* ---------------- employee-record helpers ---------------- */
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_NAMES = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

  /* the approved leave record covering today, or null — the "On leave" pill */
  function onLeaveToday(staffId) {
    var t = HV.todayISO();
    return (HV.store.leaves || []).find(function (l) {
      return l.staffId === staffId && l.status === 'approved' && l.from <= t && t <= l.to;
    }) || null;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* '3 y 4 m with us' — whole months since the date of joining */
  function tenureHtml(iso) {
    if (!iso) return '';
    var a = new Date(iso + 'T00:00:00'), b = new Date();
    var months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) months--;
    if (months < 1) return 'joined this month';
    var y = Math.floor(months / 12), m = months % 12, s = [];
    if (y) s.push('<span class="num">' + y + '</span> y');
    if (m) s.push('<span class="num">' + m + '</span> m');
    return s.join(' ') + ' with us';
  }

  function fmtTzo(tzo) {
    var n = (tzo === undefined || tzo === null) ? 5.5 : tzo;
    var sign = n < 0 ? '−' : '+';
    var abs = Math.abs(n), h = Math.floor(abs), m = Math.round((abs - h) * 60);
    return sign + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* one day's shift as words. A split shift is two windows and must read as
     two: joining the raw array printed '06:00,10:00–17:00,21:00'. */
  function shiftOf(av, dayKey) {
    var w = HV.availWindows({ avail: av }, dayKey);
    return w.length
      ? w.map(function (r) { return HV.fmtTime(r[0]) + '–' + HV.fmtTime(r[1]); }).join(' and ')
      : null;
  }
  /* 'Mon–Fri 6 am–10 am and 5 pm–9 pm · Sat 6 am–10 am · Sun off' —
     consecutive days with the same shift collapse into one span */
  function availSummaryHtml(av) {
    if (!av) return 'Not set yet';
    var parts = [], i = 0;
    while (i < DAYS.length) {
      var r = shiftOf(av, DAYS[i]);
      var j = i;
      while (j + 1 < DAYS.length && shiftOf(av, DAYS[j + 1]) === r) j++;
      var label = i === j ? DAY_NAMES[DAYS[i]] : DAY_NAMES[DAYS[i]] + '–' + DAY_NAMES[DAYS[j]];
      parts.push(label + ' ' + (r ? '<span class="num">' + HV.esc(r) + '</span>' : 'off'));
      i = j + 1;
    }
    return parts.join(' · ');
  }

  /* one cell a day, one time pair per shift inside it — so a split shift
     stacks two pairs and reads as the two blocks of work it is */
  function weekStripHtml(av) {
    return '<div class="pa2-week">' + DAYS.map(function (k) {
      var wins = HV.availWindows({ avail: av }, k);
      return '<div class="pa2-day' + (wins.length ? '' : ' pa2-off') + '"><small><b>' + DAY_NAMES[k] + '</b></small>' +
        (wins.length
          ? wins.map(function (r) {
              return '<small class="num">' + HV.esc(HV.fmtTime(r[0])) + '</small>' +
                     '<small class="num">' + HV.esc(HV.fmtTime(r[1])) + '</small>';
            }).join('<small class="pa2-split" aria-hidden="true">·</small>')
          : '<small>Off</small>') +
        '</div>';
    }).join('') + '</div>';
  }

  function levelPill(u) {
    return '<span class="pill neutral"><span class="num">L' + (u.level || 2) + '</span></span>';
  }
  function deptChip(u) {
    return u.dept ? '<span class="chip">' + HV.esc(HV.DEPTS[u.dept] || u.dept) + '</span>' : '';
  }

  /* ---------------- the tag system ----------------
     Two kinds of tag share one chip row, because to somebody reading the board
     a tag is a tag. What differs is who maintains it.

     DERIVED tags are worked out from the record every time it is drawn, so
     they can never contradict it and nobody has to remember to take one off —
     "New joinee" retires itself on the employee's 183rd day.

     TYPED tags (`u.tags`) carry what the data cannot know: probation, a
     certification, a notice period. A human keys them onto the record.

     A typed tag may not borrow a derived name — readStaffFields refuses them —
     or the board could print "New joinee" beside somebody who joined four
     years ago, and be telling the truth about neither. */
  var DERIVED_TAGS = ['New joinee', 'Bench cover', 'On leave', 'Unallocated', 'Split shift', 'Inactive'];
  var NEW_JOINEE_DAYS = 183;

  function allocatedCount(id) {
    return HV.store.clients.filter(function (c) {
      return Object.keys(c.pod || {}).some(function (k) { return c.pod[k] === id; });
    }).length;
  }
  function daysSince(isoDate) {
    if (!isoDate) return null;
    return Math.floor((HV.now() - new Date(isoDate + 'T00:00:00').getTime()) / 864e5);
  }
  function derivedTags(u) {
    var d = daysSince(u.doj), out = [];
    if (d !== null && d >= 0 && d < NEW_JOINEE_DAYS) out.push('New joinee');
    if (Number(u.level) === 2) out.push('Bench cover');
    if (onLeaveToday(u.id)) out.push('On leave');
    if (!allocatedCount(u.id)) out.push('Unallocated');
    if (DAYS.some(function (k) { return HV.availWindows(u, k).length > 1; })) out.push('Split shift');
    if (u.inactive) out.push('Inactive');
    return out;
  }
  function typedTags(u) { return (u.tags || []).slice(); }
  function tagsOf(u) { return derivedTags(u).concat(typedTags(u)); }

  function empTagPill(tag) {
    var kind = (tag === 'On leave' || tag === 'Unallocated') ? 'warn'
      : tag === 'New joinee' ? 'info'
      : 'neutral';
    return '<span class="pill ' + kind + '">' + HV.esc(tag) + '</span>';
  }

  /* ---------------- Staff tab: search, filters, table ----------------
     Module-level so a keystroke can repaint the board without HV.refresh(),
     which would rebuild the search input and take the caret with it. */
  var staffQ = '', staffRole = 'all', staffTag = 'all';

  function staffAll() {
    return HV.store.users.filter(function (u) { return u.role !== 'client'; });
  }
  /* name OR id, so 'vik', 'u-vik' and 'u-vikram' all reach the same person */
  function matchesQuery(u) {
    var q = staffQ.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().indexOf(q) !== -1 || u.id.toLowerCase().indexOf(q) !== -1;
  }
  function matchesRole(u) { return staffRole === 'all' || u.role === staffRole; }
  function matchesTag(u) { return staffTag === 'all' || tagsOf(u).indexOf(staffTag) !== -1; }
  function staffRows() {
    return staffAll().filter(function (u) {
      return matchesQuery(u) && matchesRole(u) && matchesTag(u);
    });
  }

  /* A chip counts the rows CLICKING IT would give you: the search, plus the
     OTHER dimension, never its own. Counting a role chip against the role
     filter would print 0 beside every role you are not already standing on,
     and a chip that lands on an empty table reads as a bug, not a filter. */
  function roleChips() {
    var pool = staffAll().filter(matchesQuery).filter(matchesTag);
    var keys = [];
    staffAll().forEach(function (u) { if (keys.indexOf(u.role) === -1) keys.push(u.role); });
    var out = [{ k: 'all', label: 'All roles', n: pool.length }];
    keys.forEach(function (k) {
      var n = pool.filter(function (u) { return u.role === k; }).length;
      /* the same rule the tag row follows: a chip nobody in the current
         result carries is noise — unless you are standing on it, when
         removing it would strand you with no way back to All */
      if (!n && staffRole !== k) return;
      var def = HV.roleDef(k);
      out.push({ k: k, label: def ? def.title : k, n: n });
    });
    return out;
  }
  function tagChips() {
    var pool = staffAll().filter(matchesQuery).filter(matchesRole);
    /* derived names first, in their declared order, then whatever anyone has
       typed, alphabetically — so the automatic half of the row keeps a fixed
       shape as employees come and go */
    var typed = [];
    staffAll().forEach(function (u) {
      typedTags(u).forEach(function (t) { if (typed.indexOf(t) === -1) typed.push(t); });
    });
    typed.sort();
    var out = [{ k: 'all', label: 'All tags', n: pool.length }];
    DERIVED_TAGS.concat(typed).forEach(function (t) {
      var n = pool.filter(function (u) { return tagsOf(u).indexOf(t) !== -1; }).length;
      /* a tag nobody currently carries is noise — unless you are standing on
         it, in which case removing the chip would strand you with no way back */
      if (!n && staffTag !== t) return;
      out.push({ k: t, label: t, n: n });
    });
    return out;
  }
  function chipRowHtml(chips, active, attr, label) {
    return '<div class="tfil pa2-fil" role="group" aria-label="' + HV.esc(label) + '">' +
      chips.map(function (c) {
        var on = c.k === active;
        return '<button data-' + attr + '="' + HV.esc(c.k) + '" class="' + (on ? 'on' : '') + '"' +
          ' aria-pressed="' + on + '">' + HV.esc(c.label) +
          ' <span class="num">' + c.n + '</span></button>';
      }).join('') + '</div>';
  }

  function staffTableHtml() {
    var canEdit = HV.can('managePeople');
    var rows = staffRows();
    if (!rows.length) {
      return '<p class="sub" style="padding:var(--s5) 0">Nobody matches that search or filter.</p>';
    }
    var body = rows.map(function (u) {
      var role = HV.roleDef(u.role);
      var tags = tagsOf(u);
      return '<tr class="pa2-row"' + (u.inactive ? ' style="opacity:.55"' : '') + '>' +
        '<td><button class="pa2-name" data-open="' + HV.esc(u.id) + '"' +
          ' aria-label="' + HV.esc(u.name) + ' — employee record">' + HV.ui.avatar(u.name, 'sm') +
          '<span><b>' + HV.esc(u.name) + '</b>' +
          (u.subtitle ? '<small>' + HV.esc(u.subtitle) + '</small>' : '') + '</span></button></td>' +
        '<td class="pa2-id">' + HV.esc(u.id) + '</td>' +
        '<td>' + HV.esc(role ? role.title : '—') + '</td>' +
        '<td>' + (u.dept ? HV.esc(HV.DEPTS[u.dept] || u.dept) : '—') + '</td>' +
        '<td><span class="num">L' + (u.level || 2) + '</span></td>' +
        '<td><span class="num">' + allocatedCount(u.id) + '</span></td>' +
        '<td><span class="pa2-tags">' +
          (tags.length ? tags.map(empTagPill).join('') : '<span class="pa2-id">—</span>') +
        '</span></td>' +
        (canEdit
          ? '<td><span class="pa2-acts">' +
            '<button class="btn sm ghost" data-edit="' + HV.esc(u.id) + '"' +
              ' aria-label="Edit ' + HV.esc(u.name) + '">' + HV.ui.icon('pencil') + '</button>' +
            '<button class="btn sm ghost" data-deact="' + HV.esc(u.id) + '">' +
              (u.inactive ? 'Reactivate' : 'Deactivate') + '</button></span></td>'
          : '') +
        '</tr>';
    }).join('');
    return '<div class="tablewrap"><table class="data pa2-t">' +
      '<thead><tr><th>Employee</th><th>ID</th><th>Role</th><th>Department</th>' +
      '<th>Level</th><th>Allocated</th><th>Tags</th>' +
      (canEdit ? '<th><span class="vh">Actions</span></th>' : '') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /* everything a keystroke or a chip changes — the counts move with the rows,
     so they repaint together and the input above them stays put */
  function staffBodyHtml() {
    return chipRowHtml(roleChips(), staffRole, 'frole', 'Filter employees by role') +
      chipRowHtml(tagChips(), staffTag, 'ftag', 'Filter employees by tag') +
      staffTableHtml();
  }

  function staffHtml() {
    var canEdit = HV.can('managePeople');
    return '<div class="pa2-tools">' +
        '<input class="input grow" id="pa-q" type="search" placeholder="Search by name or id"' +
          ' aria-label="Search employees by name or id" autocomplete="off"' +
          ' value="' + HV.esc(staffQ) + '">' +
        (canEdit
          ? '<button class="btn sm" id="pa-add-emp" style="flex:none">' +
            HV.ui.icon('plus') + 'Add employee</button>'
          : '') +
      '</div>' +
      '<div id="pa-body">' + staffBodyHtml() + '</div>' +
      (canEdit
        ? '<p class="audit">Tap a name for the full employee record. New joinee, Bench cover, On leave, ' +
          'Unallocated, Split shift and Inactive are worked out from the record itself and maintain ' +
          'themselves; every other tag was typed on the record. Deactivating a seat removes it from new ' +
          'scheduling and assignment pickers immediately; existing allocations stay until reassigned.</p>'
        : '<p class="audit">Read-only for your role. Tap a name for the employee record; adding, editing ' +
          'and deactivating staff needs Super Admin access.</p>');
  }

  /* the headcount the page opens with. It counts EVERY seat, deactivated ones
     included, and breaks that down underneath — a headcount that quietly omits
     people is the kind of number somebody budgets against. */
  function headcountHtml() {
    var all = staffAll();
    var off = all.filter(function (u) { return u.inactive; }).length;
    var lv = all.filter(function (u) { return onLeaveToday(u.id); }).length;
    /* "12 · 12 active" says the same number twice in different words, which is
       the defect screenshot review caught on the v195 dashboard. Active is
       worth stating only when it differs from the total. */
    var bits = [];
    if (off) {
      bits.push('<span class="num">' + (all.length - off) + '</span> active');
      bits.push('<span class="num">' + off + '</span> deactivated');
    }
    bits.push('<span class="num">' + lv + '</span> on leave today');
    return '<div class="pa2-head"><div class="stat">' +
      '<div class="k">Total employees</div>' +
      '<div class="v num">' + all.length + '</div>' +
      '<div class="sub">' + bits.join(' · ') + '</div>' +
      '</div></div>';
  }

  /* the chips and the table repaint together — the counts move with the rows —
     while .pa2-tools above them, and the caret inside it, stays untouched */
  function repaintStaff(root) {
    var body = root.querySelector('#pa-body');
    if (!body) return;
    body.innerHTML = staffBodyHtml();
    wireStaffBody(root);
  }

  function wireStaffBody(root) {
    root.querySelectorAll('[data-frole]').forEach(function (b) {
      b.addEventListener('click', function () { staffRole = b.dataset.frole; repaintStaff(root); });
    });
    root.querySelectorAll('[data-ftag]').forEach(function (b) {
      b.addEventListener('click', function () { staffTag = b.dataset.ftag; repaintStaff(root); });
    });
    root.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openStaffDetail(b.dataset.open); });
    });
    /* the whole row is a convenience target; the name button is the real
       affordance, and its own handler runs for taps that land on it */
    root.querySelectorAll('.pa2-row').forEach(function (tr) {
      tr.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        var b = tr.querySelector('[data-open]');
        if (b) openStaffDetail(b.dataset.open);
      });
    });
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openEditStaffSheet(b.dataset.edit); });
    });
    root.querySelectorAll('[data-deact]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
        var u = HV.store.users.find(function (x) { return x.id === b.dataset.deact; });
        if (!u) return;
        u.inactive = !u.inactive;
        HV.save();
        HV.toast(u.name + (u.inactive ? ' deactivated.' : ' reactivated.'));
        /* a full refresh: deactivating changes the headcount above and the
           Inactive tag's chip count, neither of which lives in #pa-body */
        HV.refresh();
      });
    });
  }

  /* ---------------- staff detail sheet ---------------- */
  function drow(icon, label, valueHtml) {
    return '<div class="trow">' + HV.ui.iconTile(icon, 'sm') +
      '<span class="grow"><b>' + valueHtml + '</b><small>' + HV.esc(label) + '</small></span></div>';
  }

  /* Home's general search reaches any colleague, including from roles that do
     not hold the People nav — a coach looking up who covers yoga this week.
     The gate lives HERE rather than at the call site, so exactly one place
     decides how much of an employee record a given role may see. */
  function holdsPeopleNav() {
    var meta = HV.roleDef((HV.me() || {}).role);
    return !!(meta && (meta.nav || []).indexOf('people') !== -1);
  }

  /* the colleague card: who they are, what they do, when they work. No
     joining date, no emergency contact, no CV — those are the record. */
  function openStaffCard(id) {
    var u = HV.store.users.find(function (x) { return x.id === id; });
    if (!u) return;
    var role = HV.roleDef(u.role);
    var lv = onLeaveToday(u.id);
    HV.sheet(
      /* the sheet carries its own styles. This page's <style> block is written
         by render(), so a card opened from Home — where the People view never
         rendered — had NO .pa2-week grid and printed the week as
         "Mon6:00 am12:00 pm". A sheet that can be opened from another view
         cannot borrow its opener's CSS. */
      STYLE +
      '<div class="row" style="gap:var(--s3); align-items:center">' + HV.ui.avatar(u.name, 'lg') +
      '<span class="grow"><div class="h1">' + HV.esc(u.name) + '</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(role ? role.title : '—') +
      (u.subtitle ? ' · ' + HV.esc(u.subtitle) : '') + '</p></span></div>' +
      (u.dept ? '<div class="row" style="margin-top:var(--s2)">' + deptChip(u) + '</div>' : '') +
      (lv
        ? '<div class="notice warn" style="margin-top:var(--s3)">On approved leave until ' +
          '<span class="num">' + HV.esc(fmtDate(lv.to)) + '</span> — Time &amp; Cover names the cover.</div>'
        : '') +
      '<div class="sec-title" style="margin-top:var(--s4)">Working hours</div>' +
      weekStripHtml(u.avail) +
      '<p class="audit">The full employee record — joining date, emergency contact, CV — opens for ' +
      'People &amp; Access roles.</p>' +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s4)">' +
        '<button class="btn ghost" id="sc-close">Close</button></div>',
      function (sheet) { sheet.querySelector('#sc-close').addEventListener('click', HV.closeSheet); }
    );
  }

  function openStaffDetail(id) {
    var u = HV.store.users.find(function (x) { return x.id === id; });
    if (!u) return;
    var role = HV.roleDef(u.role);
    var lv = onLeaveToday(u.id);
    var canEdit = HV.can('managePeople');
    var em = u.emergency;
    HV.sheet(
      /* same reason as openStaffCard: Home's search opens this record too */
      STYLE +
      '<div class="row" style="gap:var(--s3); align-items:center">' + HV.ui.avatar(u.name, 'lg') +
      '<span class="grow"><div class="h1">' + HV.esc(u.name) + '</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(role ? role.title : '—') +
      (u.subtitle ? ' · ' + HV.esc(u.subtitle) : '') + '</p></span></div>' +
      '<div class="row" style="flex-wrap:wrap; gap:var(--s2); margin-top:var(--s2)">' +
        levelPill(u) + deptChip(u) + tagsOf(u).map(empTagPill).join('') +
      '</div>' +
      (lv
        ? '<div class="notice warn" style="margin-top:var(--s3)">On approved leave <span class="num">' +
          HV.esc(fmtDate(lv.from)) + '</span> → <span class="num">' + HV.esc(fmtDate(lv.to)) + '</span>' +
          (lv.reason ? ' · ' + HV.esc(lv.reason) : '') + '</div>'
        : '') +
      '<div class="list" style="margin-top:var(--s3)">' +
        drow('cal', 'Joined',
          '<span class="num">' + HV.esc(fmtDate(u.doj)) + '</span>' +
          (tenureHtml(u.doj) ? ' · ' + tenureHtml(u.doj) : '')) +
        drow('clock', 'Timezone',
          HV.esc(u.tzLabel || 'IST') + ' · UTC<span class="num">' + fmtTzo(u.tzo) + '</span>') +
        drow('phone', 'Emergency contact',
          em && (em.name || em.phone)
            ? HV.esc(em.name || '') + (em.phone ? ' · <span class="num">' + HV.esc(em.phone) + '</span>' : '')
            : 'Not on record') +
        drow('doc', 'CV on file', u.cv ? HV.esc(u.cv) : 'None on file') +
      '</div>' +
      (u.memo ? '<div class="notice" style="margin-top:var(--s3)">' + HV.esc(u.memo) + '</div>' : '') +
      '<div class="sec-title" style="margin-top:var(--s4)">Availability</div>' +
      weekStripHtml(u.avail) +
      '<p class="audit">The coach paints this week themselves in Time &amp; Cover — read-only here.</p>' +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s4)">' +
        '<button class="btn ghost" id="sd-close">Close</button>' +
        (canEdit ? '<button class="btn" id="sd-edit">' + HV.ui.icon('pencil') + 'Edit record</button>' : '') +
      '</div>',
      function (sheet) {
        sheet.querySelector('#sd-close').addEventListener('click', HV.closeSheet);
        var eb = sheet.querySelector('#sd-edit');
        if (eb) eb.addEventListener('click', function () { openEditStaffSheet(u.id); });
      }
    );
  }

  /* ---------------- shared employee field set (add + edit sheets) ---------------- */
  function roleOptions(selected) {
    return Object.keys(HV.store.roles).filter(function (k) { return k !== 'client'; }).map(function (k) {
      return '<option value="' + HV.esc(k) + '"' + (k === selected ? ' selected' : '') + '>' +
        HV.esc(HV.store.roles[k].title) + '</option>';
    }).join('');
  }
  function deptOptions(selected) {
    return '<option value="">No department</option>' + Object.keys(HV.DEPTS).map(function (k) {
      return '<option value="' + HV.esc(k) + '"' + (k === selected ? ' selected' : '') + '>' +
        HV.esc(HV.DEPTS[k]) + '</option>';
    }).join('');
  }
  function levelOptions(selected) {
    return [1, 2].map(function (n) {
      return '<option value="' + n + '"' + (n === Number(selected) ? ' selected' : '') + '>L' + n +
        (n === 1 ? ' · senior' : '') + '</option>';
    }).join('');
  }

  function staffFieldsHtml(p, u) {
    u = u || {};
    var em = u.emergency || {};
    return '<label class="field-label" for="' + p + '-name">Name</label>' +
      '<input class="input" id="' + p + '-name" placeholder="Full name" value="' + HV.esc(u.name || '') + '">' +
      '<div class="grid2">' +
        '<div><label class="field-label" for="' + p + '-role">Role</label>' +
        '<select class="input" id="' + p + '-role">' + roleOptions(u.role) + '</select></div>' +
        '<div><label class="field-label" for="' + p + '-dept">Department</label>' +
        '<select class="input" id="' + p + '-dept">' + deptOptions(u.dept) + '</select></div>' +
        '<div><label class="field-label" for="' + p + '-level">Level</label>' +
        '<select class="input" id="' + p + '-level">' + levelOptions(u.level || 2) + '</select></div>' +
        '<div><label class="field-label" for="' + p + '-doj">Date of joining</label>' +
        '<input class="input" type="date" id="' + p + '-doj" value="' + HV.esc(u.doj || HV.todayISO()) + '"></div>' +
        '<div><label class="field-label" for="' + p + '-ename">Emergency contact</label>' +
        '<input class="input" id="' + p + '-ename" placeholder="Name" value="' + HV.esc(em.name || '') + '"></div>' +
        '<div><label class="field-label" for="' + p + '-ephone">Emergency phone</label>' +
        '<input class="input" id="' + p + '-ephone" placeholder="+91 …" value="' + HV.esc(em.phone || '') + '"></div>' +
      '</div>' +
      '<label class="field-label" for="' + p + '-sub">Subtitle (optional)</label>' +
      '<input class="input" id="' + p + '-sub" placeholder="e.g. East pod" value="' + HV.esc(u.subtitle || '') + '">' +
      '<label class="field-label" for="' + p + '-tags">Tags</label>' +
      '<input class="input" id="' + p + '-tags" placeholder="Probation, First aid certified" ' +
        'value="' + HV.esc(typedTags(u).join(', ')) + '">' +
      '<p class="audit">Comma-separated. ' + DERIVED_TAGS.join(', ') +
      ' are worked out from the record itself, so typing one here is left off.</p>' +
      '<label class="field-label" for="' + p + '-memo">Memo</label>' +
      '<textarea class="input" id="' + p + '-memo" rows="2" placeholder="One line the team should know">' + HV.esc(u.memo || '') + '</textarea>' +
      '<label class="field-label" for="' + p + '-cv">CV on file</label>' +
      '<div class="row">' +
        '<input class="input grow" id="' + p + '-cv" placeholder="filename.pdf" value="' + HV.esc(u.cv || '') + '">' +
        '<button class="btn sm ghost" id="' + p + '-attach" style="flex:none">' + HV.ui.icon('clip') + 'Attach CV</button>' +
      '</div>';
  }

  /* what the last read refused, so the SAVE toast can say so. Reporting it
     from inside readStaffFields would fire a toast the caller's own toast
     immediately replaces, and the user would never see it. */
  var lastDropped = [];

  /* reads the field set back onto u; returns null (with a toast) if invalid */
  function readStaffFields(sheet, p, u) {
    var name = sheet.querySelector('#' + p + '-name').value.trim();
    if (!name) { HV.toast('Give the employee a name first.'); return null; }
    u.name = name;
    u.role = sheet.querySelector('#' + p + '-role').value;
    u.dept = sheet.querySelector('#' + p + '-dept').value || null;
    u.level = Number(sheet.querySelector('#' + p + '-level').value) || 2;
    u.doj = sheet.querySelector('#' + p + '-doj').value || HV.todayISO();
    var sub = sheet.querySelector('#' + p + '-sub').value.trim();
    if (sub) u.subtitle = sub; else delete u.subtitle;
    var en = sheet.querySelector('#' + p + '-ename').value.trim();
    var ep = sheet.querySelector('#' + p + '-ephone').value.trim();
    u.emergency = (en || ep) ? { name: en, phone: ep } : null;
    u.memo = sheet.querySelector('#' + p + '-memo').value.trim();
    u.cv = sheet.querySelector('#' + p + '-cv').value.trim() || null;
    /* a typed tag may not borrow a derived name, or the board would print a
       label the record itself contradicts. Case-insensitive both ways, and
       duplicates collapse. */
    lastDropped = [];
    var kept = [];
    sheet.querySelector('#' + p + '-tags').value.split(',').forEach(function (raw) {
      var t = raw.trim();
      if (!t) return;
      var low = t.toLowerCase();
      if (DERIVED_TAGS.some(function (d) { return d.toLowerCase() === low; })) { lastDropped.push(t); return; }
      if (kept.some(function (k) { return k.toLowerCase() === low; })) return;
      kept.push(t);
    });
    u.tags = kept;
    return u;
  }
  /* the tail the save toast adds when something was refused */
  function droppedNote() {
    return lastDropped.length
      ? ' ' + lastDropped.join(', ') + ' left off — the record works ' +
        (lastDropped.length === 1 ? 'that' : 'those') + ' out already.'
      : '';
  }

  /* the demo "file picker": stamps a plausible filename into the CV field */
  function wireAttach(sheet, p) {
    sheet.querySelector('#' + p + '-attach').addEventListener('click', function () {
      var name = sheet.querySelector('#' + p + '-name').value.trim() || 'coach';
      sheet.querySelector('#' + p + '-cv').value = slug(name) + '-cv.pdf';
      HV.toast('CV attached (demo) — the filename goes on record when you save.');
    });
  }

  function openAddEmployeeSheet() {
    HV.sheet(
      '<div class="h1">Add employee</div>' +
      staffFieldsHtml('ae', null) +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s3)">' +
        '<button class="btn ghost" id="ae-cancel">Cancel</button>' +
        '<button class="btn" id="ae-save">Add employee</button>' +
      '</div>',
      function (sheet) {
        wireAttach(sheet, 'ae');
        sheet.querySelector('#ae-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#ae-save').addEventListener('click', function () {
          if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
          var u = readStaffFields(sheet, 'ae', {});
          if (!u) return;
          u.id = newStaffId(u.name);
          u.tzo = 5.5; u.tzLabel = 'IST';
          u.avail = { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'],
                      thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: null, sun: null };
          HV.store.users.push(u);
          HV.store.capacity.push({ staffId: u.id, roleLabel: (HV.roleDef(u.role) || {}).title || u.role, load: 0, cap: 6 });
          HV.save();
          HV.closeSheet();
          HV.toast(u.name + ' added — in the staff list, capacity and every assignment picker now.' + droppedNote());
          HV.refresh();
        });
      }
    );
  }

  function openEditStaffSheet(id) {
    var u = HV.store.users.find(function (x) { return x.id === id; });
    if (!u) return;
    HV.sheet(
      '<div class="h1">Edit ' + HV.esc(u.name) + '</div>' +
      staffFieldsHtml('es', u) +
      '<div class="sec-title" style="margin-top:var(--s4)">Availability</div>' +
      '<p class="sub" style="margin:0">' + availSummaryHtml(u.avail) + '</p>' +
      '<p class="audit">Availability is the coach’s own week — edited in Time &amp; Cover, read-only here.</p>' +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s3)">' +
        '<button class="btn ghost" id="es-cancel">Cancel</button>' +
        '<button class="btn" id="es-save">Save changes</button>' +
      '</div>',
      function (sheet) {
        wireAttach(sheet, 'es');
        sheet.querySelector('#es-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#es-save').addEventListener('click', function () {
          if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
          if (!readStaffFields(sheet, 'es', u)) return;
          var cap = HV.store.capacity.find(function (x) { return x.staffId === u.id; });
          if (cap) cap.roleLabel = (HV.roleDef(u.role) || {}).title || u.role;
          HV.save();
          HV.closeSheet();
          HV.toast(u.name + ' — record updated.' + droppedNote());
          HV.refresh();
        });
      }
    );
  }

  /* ---------------- Announcements tab ---------------- */
  function agoHtml(ts) {
    var m = HV.minsSince(ts);
    if (m < 1) return 'just now';
    if (m < 60) return '<span class="num">' + m + '</span> min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return '<span class="num">' + h + '</span> h ago';
    var d = Math.floor(h / 24);
    return '<span class="num">' + d + '</span> d ago';
  }

  function tagPill(tag) {
    var kind = tag === 'Holiday' ? 'ok' : tag === 'Policy' ? 'info' : 'neutral';
    return '<span class="pill ' + kind + '">' + HV.esc(tag) + '</span>';
  }

  function unseenFeedCount() {
    var me = HV.me();
    if (!me) return 0;
    var mark = (HV.store.teamFeedReads || {})[me.id] || 0;
    return (HV.store.teamFeed || []).filter(function (f) { return f.ts > mark; }).length;
  }

  function feedHtml() {
    var me = HV.me();
    var mark = (HV.store.teamFeedReads || {})[me.id] || 0;
    var canPost = HV.can('broadcast');
    var feed = HV.store.teamFeed || [];
    var compose = canPost
      ? '<div class="card" style="margin-bottom:var(--s4)">' +
        '<div class="sec-title">Post to the team</div>' +
        '<label class="field-label" for="tf-text">Announcement</label>' +
        '<textarea class="input" id="tf-text" rows="3" placeholder="Everyone with console access will see this."></textarea>' +
        '<div class="row" style="margin-top:var(--s2); align-items:center">' +
          '<label class="field-label" for="tf-tag" style="margin:0">Tag</label>' +
          '<select class="input" id="tf-tag" style="max-width:11em">' +
            ['General', 'Holiday', 'Policy'].map(function (t) {
              return '<option value="' + t + '">' + t + '</option>';
            }).join('') +
          '</select>' +
          '<span class="grow"></span>' +
          '<button class="btn sm" id="tf-post">' + HV.ui.icon('send') + 'Post</button>' +
        '</div></div>'
      : '';
    var rows = feed.map(function (f) {
      var by = HV.staff(f.byId);
      var byRole = HV.roleDef(by.role);
      var fresh = f.ts > mark;
      return '<div class="card pa2-ann">' +
        '<div class="trow">' + HV.ui.avatar(by.name, 'sm') +
        '<span class="grow"><b>' + HV.esc(by.name) + '</b>' +
        '<small>' + HV.esc(byRole ? byRole.title : '—') + ' · ' + agoHtml(f.ts) + '</small></span>' +
        (fresh ? '<span class="pill info">New</span>' : '') + tagPill(f.tag) + '</div>' +
        '<p>' + HV.esc(f.text) + '</p></div>';
    }).join('');
    return compose +
      (rows || HV.ui.empty('chat', 'No announcements yet.', canPost ? 'Yours would be the first.' : '')) +
      (canPost
        ? '<p class="audit">Announcements reach every console role; reading here clears the New badge for you only.</p>'
        : '<p class="audit">Read-only for your role — posting needs the broadcast permission (Super Admin, Ops Head and department heads).</p>');
  }

  function wireFeed(root) {
    var me = HV.me();
    var post = root.querySelector('#tf-post');
    if (post) post.addEventListener('click', function () {
      if (!HV.can('broadcast')) { HV.toast('Posting needs the broadcast permission. This attempt was logged.'); return; }
      var text = root.querySelector('#tf-text').value.trim();
      if (!text) { HV.toast('Write the announcement first.'); return; }
      var tag = root.querySelector('#tf-tag').value;
      HV.store.teamFeed = HV.store.teamFeed || [];
      HV.store.teamFeed.unshift({ id: 'tf-' + HV.now(), byId: me.id, ts: HV.now(), tag: tag, text: text });
      HV.store.teamFeedReads = HV.store.teamFeedReads || {};
      HV.store.teamFeedReads[me.id] = HV.now();
      HV.save();
      HV.toast('Posted to the whole team.');
      HV.refresh();
    });
    /* viewing IS the read: stamp my read mark once the list is on screen —
       the New pills rendered above stay visible until the next navigation */
    var mark = (HV.store.teamFeedReads || {})[me.id] || 0;
    var unseen = (HV.store.teamFeed || []).some(function (f) { return f.ts > mark; });
    if (unseen) {
      HV.store.teamFeedReads = HV.store.teamFeedReads || {};
      HV.store.teamFeedReads[me.id] = HV.now();
      HV.save();
    }
  }

  /* ---------------- Roles & permissions tab ---------------- */
  /* the rename affordance is a real .btn — icon SVGs in this design system
     are unstyled without a scoping selector (.btn svg / .chip svg / …), so a
     bare icon dropped next to plain text renders at its raw intrinsic size */
  function wireTitleEdit(root) {
    root.querySelectorAll('[data-title-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
        var key = btn.dataset.titleEdit;
        var role = HV.store.roles[key];
        var span = btn.previousElementSibling;
        var wrap = span.parentElement;
        var inp = document.createElement('input');
        inp.className = 'input grow'; inp.style.maxWidth = '22em'; inp.value = role.title;
        wrap.replaceChild(inp, span);
        btn.style.display = 'none';
        inp.focus(); inp.select();
        var closed = false;
        var commit = function () {
          if (closed) return;
          closed = true;
          var v = inp.value.trim();
          if (v && v !== role.title) {
            role.title = v;
            HV.save();
            HV.toast('Role renamed.');
          }
          HV.refresh();
        };
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { closed = true; HV.refresh(); }
        });
        inp.addEventListener('blur', commit);
      });
    });
  }

  function chipRow(roleKey, kind, ids, labelOf, isOn, isGuarded, canEdit) {
    return ids.map(function (id) {
      var on = isOn(id);
      var label = labelOf(id);
      if (!canEdit) return '<span class="chip' + (on ? ' sel' : '') + '">' + HV.esc(label) + '</span>';
      if (isGuarded(id)) {
        return '<button class="chip sel" style="opacity:.6; cursor:default" aria-pressed="true" disabled>' + HV.esc(label) + '</button>';
      }
      return '<button class="chip' + (on ? ' sel' : '') + '" data-role="' + HV.esc(roleKey) + '" data-' + kind + '="' + HV.esc(id) + '" aria-pressed="' + on + '">' + HV.esc(label) + '</button>';
    }).join('');
  }

  function rolesHtml() {
    var canEdit = HV.can('managePeople');
    var navIds = Object.keys(HV.NAV_ITEMS);
    var permIds = Object.keys(HV.PERM_LABELS);
    var cards = Object.keys(HV.store.roles).map(function (key) {
      var r = HV.store.roles[key];
      var titleHtml = canEdit
        ? '<span class="h2 grow">' + HV.esc(r.title) + '</span>' +
          '<button class="btn sm ghost" data-title-edit="' + HV.esc(key) + '" aria-label="Rename ' + HV.esc(r.title) + '" style="flex:none">' + HV.ui.icon('pencil') + '</button>'
        : '<span class="h2">' + HV.esc(r.title) + '</span>';
      var navChips = chipRow(key, 'nav', navIds,
        function (id) { return HV.NAV_ITEMS[id].label; },
        function (id) { return (r.nav || []).indexOf(id) !== -1; },
        function (id) { return isGuardedNav(key, id); }, canEdit);
      var permChips = chipRow(key, 'perm', permIds,
        function (id) { return HV.PERM_LABELS[id]; },
        function (id) { return (r.perms || []).indexOf(id) !== -1; },
        function (id) { return isGuardedPerm(key, id); }, canEdit);
      return '<div class="card" style="margin-bottom:var(--s4)">' +
        '<div class="row" style="margin-bottom:var(--s3)">' + titleHtml + '</div>' +
        '<div class="sec-title">Sidebar</div>' +
        '<div class="row" style="flex-wrap:wrap" role="group" aria-label="Sidebar access — ' + HV.esc(r.title) + '">' + navChips + '</div>' +
        '<div class="sec-title" style="margin-top:var(--s4)">Permissions</div>' +
        '<div class="row" style="flex-wrap:wrap" role="group" aria-label="Permissions — ' + HV.esc(r.title) + '">' + permChips + '</div>' +
        (key === 'admin'
          ? '<p class="audit" style="margin-top:var(--s3)">People &amp; Access and Manage people &amp; roles cannot be turned off for Super Admin — the key cabinet always keeps one key.</p>'
          : '') +
        '</div>';
    }).join('');
    return (canEdit
      ? '<div class="row" style="justify-content:flex-end; margin-bottom:var(--s3)">' +
        '<button class="btn sm" id="pa-add-role">' + HV.ui.icon('plus') + 'New role</button></div>'
      : '') +
      cards +
      (canEdit
        ? '<p class="audit">Sidebar and permission edits save and apply immediately — a role editing its own row can see its sidebar change live.</p>'
        : '<p class="audit">Read-only for your role. This matrix is generated from the same store HV.can() consults, so it can never drift from what the router enforces.</p>');
  }

  function wireMatrix(root) {
    wireTitleEdit(root);
    root.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
        var role = HV.store.roles[b.dataset.role];
        var id = b.dataset.nav;
        var i = role.nav.indexOf(id);
        if (i === -1) role.nav.push(id);
        else { role.nav.splice(i, 1); fixHomeIfOrphaned(role, id); }
        HV.save();
        HV.refresh();
      });
    });
    root.querySelectorAll('[data-perm]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
        var role = HV.store.roles[b.dataset.role];
        var id = b.dataset.perm;
        var i = role.perms.indexOf(id);
        var nowOn;
        if (i === -1) { role.perms.push(id); nowOn = true; }
        else { role.perms.splice(i, 1); nowOn = false; }
        HV.save();
        b.classList.toggle('sel', nowOn);
        b.setAttribute('aria-pressed', String(nowOn));
      });
    });
  }

  function openNewRoleSheet() {
    var roleKeys = Object.keys(HV.store.roles);
    HV.sheet(
      '<div class="h1">New role</div>' +
      '<label class="field-label" for="nr-name">Role name</label>' +
      '<input class="input" id="nr-name" placeholder="e.g. Content Editor">' +
      '<label class="field-label" for="nr-base">Copy sidebar &amp; permissions from</label>' +
      '<select class="input" id="nr-base">' +
        roleKeys.map(function (k) { return '<option value="' + HV.esc(k) + '">' + HV.esc(HV.store.roles[k].title) + '</option>'; }).join('') +
      '</select>' +
      '<div class="row" style="justify-content:flex-end; margin-top:var(--s3)">' +
        '<button class="btn ghost" id="nr-cancel">Cancel</button>' +
        '<button class="btn" id="nr-save">Create role</button>' +
      '</div>',
      function (sheet) {
        sheet.querySelector('#nr-cancel').addEventListener('click', HV.closeSheet);
        sheet.querySelector('#nr-save').addEventListener('click', function () {
          if (!HV.can('managePeople')) { HV.toast('Super Admin only. This attempt was logged.'); return; }
          var name = sheet.querySelector('#nr-name').value.trim();
          if (!name) { HV.toast('Give the role a name first.'); return; }
          var baseKey = sheet.querySelector('#nr-base').value;
          var base = HV.store.roles[baseKey];
          var key = newRoleKey(name);
          var copy = JSON.parse(JSON.stringify(base));
          copy.title = name;
          var firstNav = copy.nav && copy.nav[0];
          if (firstNav && HV.NAV_ITEMS[firstNav]) copy.home = HV.NAV_ITEMS[firstNav].route;
          HV.store.roles[key] = copy;
          HV.save();
          HV.closeSheet();
          HV.toast('Role created — appears in Add employee and the matrix.');
          HV.refresh();
        });
      }
    );
  }

  /* ---------------- what other views may call ----------------
     Same contract as HV.clientRecord / HV.chatui / HV.planui: reach for it
     inside a handler, never at load time — this file registers itself after
     the ones that use it. `open` decides for itself how much of the record
     the viewer's role may see, so no call site has to know. */
  HV.peopleui = {
    open: function (id) { if (holdsPeopleNav()) openStaffDetail(id); else openStaffCard(id); },
    tagsOf: tagsOf,
  };

  /* ---------------- registration ---------------- */
  HV.registerView('people', {
    title: 'People & Access',
    /* no explicit roles[] — console access is nav membership (HV.allowedView),
       so admin, opshead AND core (all carry 'people' in their seeded nav)
       reach this page; edit affordances further gate on managePeople */
    render: function (el, params) {
      var active = TABS.some(function (t) { return t.key === params[0]; }) ? params[0] : 'staff';
      var unseenN = unseenFeedCount();
      var tabItems = TABS.map(function (t) {
        return t.key === 'feed' && unseenN ? { key: t.key, label: t.label, count: unseenN } : t;
      });

      el.innerHTML = STYLE +
        '<div class="h1-row"><div><div class="kicker">THE TEAM</div><h1 class="h1">People &amp; Access</h1>' +
        '<p class="sub">Who is on the team, what each seat may do, and how loaded everyone is.</p></div></div>' +
        headcountHtml() +
        HV.ui.tabs(tabItems, active) +
        '<div id="pa-root" style="margin-top:var(--s3)"></div>';

      var root = el.querySelector('#pa-root');
      if (active === 'staff') {
        root.innerHTML = staffHtml();
        var addEmp = root.querySelector('#pa-add-emp');
        if (addEmp) addEmp.addEventListener('click', openAddEmployeeSheet);
        var q = root.querySelector('#pa-q');
        if (q) q.addEventListener('input', function () { staffQ = q.value; repaintStaff(root); });
        wireStaffBody(root);
      } else if (active === 'roles') {
        root.innerHTML = rolesHtml();
        var addRole = root.querySelector('#pa-add-role');
        if (addRole) addRole.addEventListener('click', openNewRoleSheet);
        wireMatrix(root);
      } else if (active === 'feed') {
        root.innerHTML = feedHtml();
        wireFeed(root);
      } else {
        HV.capacityPanel(root);          /* moved out of the old admin screen */
      }

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/people/' + b.dataset.tab); });
      });
    },
  });
})();
