/* HAALVING — the session room, and the report that closes it.
   ------------------------------------------------------------------------
   Every door in the product (Schedule tile, Work Queue strip, the client
   workspace Plan tab, the client's own Today card) opens THIS one surface,
   so "join" means the same act everywhere and attendance is recorded once.
   The room is simulated: the demo carries no live media, and the page says
   so on its face rather than pretending.

   Two rules shape the code more than anything else:

   1. The room is its OWN overlay, not an HV.sheet. Sheets are single-slot —
      opening one destroys whatever sheet is showing, with no teardown — and
      leaving the room must open the report sheet. A room built as a sheet
      would race its own replacement, and the sheet's document-level Escape
      handler would close it without ever running the leave hook.

   2. Attendance is stamped by REAL DATE (t.joined[dateISO][uid]), never by
      the rd day-offset. rd 0 is always "today" and nothing ages, so the
      demo week replays: an rd-keyed stamp would read as "joined today"
      every morning for ever. Same reason t.reminded is keyed by todayISO.

   Exports HV.meetui.{join, reportSheet}; registers no route. Like every
   surface reachable from another view it carries its own CSS — a sheet
   opened from a page that never rendered would otherwise print unstyled. */
(function () {
  'use strict';

  const WENT = [
    { key: 'great', label: 'Went well', tone: 'ok' },
    { key: 'okay', label: 'As expected', tone: 'info' },
    { key: 'tough', label: 'Hard going', tone: 'warn' },
  ];

  /* One dark room in both themes, deliberately: a call stage is a lit face
     against a dark ground, and a "light mode" video room would read as a
     form. Grounds and inks are stated explicitly so neither theme leaks in. */
  const STYLE = '<style>' +
    '.mtg-pop{position:fixed; inset:0; z-index:84; display:flex; flex-direction:column;' +
      'background:#111614; color:#f4f7f5;' +
      'padding:calc(var(--s5) + env(safe-area-inset-top)) var(--s4) calc(var(--s4) + env(safe-area-inset-bottom));' +
      'gap:var(--s4); animation:fade var(--d-base) var(--ease); overflow-y:auto}' +
    '.mtg-top{flex:none; text-align:center; display:flex; flex-direction:column; gap:var(--s1)}' +
    '.mtg-k{display:inline-flex; align-items:center; justify-content:center; gap:var(--s2);' +
      'font-size:var(--t-micro); font-weight:600; letter-spacing:.08em; color:#9fb3ab}' +
    '.mtg-live{width:7px; height:7px; border-radius:var(--r-full); background:#ff5f56;' +
      'animation:mtg-blink 1.6s var(--ease) infinite}' +
    '@keyframes mtg-blink{0%,100%{opacity:1} 50%{opacity:.25}}' +
    '.mtg-t{font-size:var(--t-h2); font-weight:600; color:#fff}' +
    '.mtg-s{font-size:var(--t-sm); color:#9fb3ab}' +
    '.mtg-stage{flex:1; display:grid; gap:var(--s3); align-content:center;' +
      'grid-template-columns:repeat(auto-fit, minmax(132px, 1fr)); padding:var(--s4) 0}' +
    '.mtg-tile{background:#1b2320; border-radius:var(--r-lg); padding:var(--s5) var(--s3);' +
      'display:flex; flex-direction:column; align-items:center; gap:var(--s2); text-align:center;' +
      'min-height:148px; justify-content:center}' +
    '.mtg-tile.me{outline:1.5px solid #3f6f5f}' +
    '.mtg-nm{font-weight:600; font-size:var(--t-sm); color:#fff}' +
    '.mtg-ro{font-size:var(--t-micro); color:#9fb3ab}' +
    '.mtg-tag{font-size:var(--t-micro); font-weight:600; border-radius:var(--r-full);' +
      'padding:1px var(--s2); background:#2b3a34; color:#a9d6c4}' +
    '.mtg-tag.wait{background:#2a2f2d; color:#8b9a94}' +
    '.mtg-bar{flex:none; display:flex; align-items:center; justify-content:center; gap:var(--s3);' +
      'flex-wrap:wrap}' +
    '.mtg-clock{display:inline-flex; align-items:center; gap:var(--s2); color:#cfe0d8;' +
      'font-size:var(--t-sm)}' +
    '.mtg-clock svg{width:15px; height:15px; stroke:currentColor; fill:none; stroke-width:1.6;' +
      'stroke-linecap:round; stroke-linejoin:round}' +
    '.mtg-btn{width:46px; height:46px; border-radius:var(--r-full); border:0; cursor:pointer;' +
      'background:#242e2a; color:#f4f7f5; display:inline-flex; align-items:center; justify-content:center}' +
    '.mtg-btn svg{width:20px; height:20px; stroke:currentColor; fill:none; stroke-width:1.6;' +
      'stroke-linecap:round; stroke-linejoin:round}' +
    '.mtg-btn[aria-pressed="true"]{background:#3a2422; color:#ff9d95}' +
    '.mtg-btn.leave{width:auto; padding:0 var(--s5); gap:var(--s2); background:#c0392b; color:#fff;' +
      'font-weight:600; font-size:var(--t-sm)}' +
    '.mtg-foot{flex:none; text-align:center; font-size:var(--t-micro); color:#7d8e88; font-style:italic}' +
    /* the report sheet's own bits, carried here for the same reason */
    '.mtg-went{display:flex; gap:var(--s2); flex-wrap:wrap}' +
    '.mtg-went .chip{cursor:pointer}' +
    '@media (prefers-reduced-motion: reduce){ .mtg-live{animation:none} }' +
  '</style>';

  function first(name) { return String(name || '').split(' ')[0]; }
  function two(n) { return (n < 10 ? '0' : '') + n; }

  /* the people a task names, group expansion included. console-schedule owns
     that expansion because it is cover-aware; fall back to the bare assignee
     list if the Schedule file has not been reached yet. */
  function peopleOf(t) {
    if (HV.schedui && HV.schedui.taskPeople) return HV.schedui.taskPeople(t);
    return (t.assignees || []).slice();
  }

  /* who may walk in: anyone the task names, the client it belongs to, and
     the seat holding joinAnySession — a perm, never a role literal, so the
     matrix in People & Access can move it. */
  function mayJoin(t) {
    const me = HV.me();
    if (!me) return false;
    if (me.role === 'client') {
      const mine = HV.myClient();
      return !!mine && mine.id === t.clientId;
    }
    if (HV.can('joinAnySession')) return true;
    return peopleOf(t).indexOf(me.id) >= 0;
  }
  HV.meetui = { mayJoin: mayJoin };

  /* ── the room ─────────────────────────────────────────────────────── */
  HV.meetui.join = function (taskId, rd) {
    const t = (HV.store.tasks || []).find(x => x.id === taskId);
    if (!t) { HV.toast('That session is no longer on the calendar.'); return; }
    const occ = HV.occursOn(t, rd);
    if (!occ) { HV.toast('That occurrence has been cancelled.'); return; }
    if (!mayJoin(t)) { HV.toast('You are not on this session. This attempt was logged.'); return; }

    const me = HV.me();
    const c = t.clientId ? HV.client(t.clientId) : null;
    const today = HV.todayISO();
    const amClient = me.role === 'client';

    /* the register. Stamped on the way IN, so an admin who drops into a room
       nobody rostered them for still owes the report on the way out. */
    t.joined = t.joined || {};
    t.joined[today] = t.joined[today] || {};
    if (!t.joined[today][me.id]) { t.joined[today][me.id] = HV.now(); HV.save(); }

    /* every face in the room: the rostered seats, everyone who has walked in
       today, the client, and me */
    const ids = [];
    const add = id => { if (id && ids.indexOf(id) < 0) ids.push(id); };
    (occ.assignees || []).forEach(add);
    peopleOf(t).forEach(add);
    /* the client belongs in their own session's room even before they walk
       in — a room that names them in the header and shows no seat for them
       reads as though they were not invited */
    if (c && c.userId) add(c.userId);
    Object.keys(t.joined[today]).forEach(add);
    add(me.id);

    const tiles = ids.map(id => {
      const inRoom = !!t.joined[today][id];
      const isMe = id === me.id;
      const cu = c && c.userId === id ? c : null;
      const u = cu ? { name: c.name, role: 'client' } : HV.staff(id);
      const role = cu ? 'Client'
        : u.ai ? 'AI coach'
        : ((HV.roleDef(u.role) || {}).title || u.role || '');
      return '<div class="mtg-tile' + (isMe ? ' me' : '') + '">' +
        HV.ui.avatar(u.name, 'lg') +
        '<span class="mtg-nm">' + HV.esc(isMe ? 'You' : u.name) + '</span>' +
        '<span class="mtg-ro">' + HV.esc(role) + '</span>' +
        '<span class="mtg-tag' + (inRoom ? '' : ' wait') + '">' +
          (inRoom ? 'In the room' : 'Not joined') + '</span>' +
      '</div>';
    }).join('');

    const pop = document.createElement('div');
    pop.className = 'mtg-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-label', 'Session room — ' + occ.title);
    pop.tabIndex = -1;
    pop.innerHTML = STYLE +
      '<div class="mtg-top">' +
        '<span class="mtg-k"><span class="mtg-live"></span>LIVE · SIMULATED</span>' +
        '<span class="mtg-t">' + HV.esc(occ.title) + '</span>' +
        '<span class="mtg-s">' + (c ? HV.esc(c.name) + ' · ' : '') +
          '<span class="num">' + HV.esc(HV.fmtTime(occ.start)) + '</span>–' +
          '<span class="num">' + HV.esc(HV.fmtTime(occ.start + occ.dur)) + '</span></span>' +
      '</div>' +
      '<div class="mtg-stage">' + tiles + '</div>' +
      '<div class="mtg-bar">' +
        '<span class="mtg-clock">' + HV.ui.icon('clock') + '<b class="num" data-mtg-timer>00:00</b></span>' +
        '<button class="mtg-btn" data-mtg-mic aria-pressed="false" aria-label="Mute microphone">' + HV.ui.icon('mic') + '</button>' +
        '<button class="mtg-btn" data-mtg-cam aria-pressed="false" aria-label="Turn camera off">' + HV.ui.icon('video') + '</button>' +
        '<button class="mtg-btn leave" data-mtg-leave>' + HV.ui.icon('phone') + 'Leave</button>' +
      '</div>' +
      '<p class="mtg-foot">Simulated room — the demo carries no live media.</p>';
    const returnFocus = document.activeElement;
    document.body.appendChild(pop);
    pop.focus();

    const t0 = Date.now();
    const timerEl = pop.querySelector('[data-mtg-timer]');
    const tick = setInterval(function () {
      const s = Math.floor((Date.now() - t0) / 1000);
      timerEl.textContent = two(Math.floor(s / 60)) + ':' + two(s % 60);
    }, 1000);

    [['[data-mtg-mic]', 'Unmute microphone', 'Mute microphone'],
     ['[data-mtg-cam]', 'Turn camera on', 'Turn camera off']].forEach(function (p) {
      const b = pop.querySelector(p[0]);
      b.addEventListener('click', function () {
        const on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        b.setAttribute('aria-label', on ? p[2] : p[1]);
      });
    });

    function leave() {
      clearInterval(tick);
      document.removeEventListener('keydown', onKey);
      pop.remove();
      /* only if the opener survived the repaint — the same guard closeSheet keeps */
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
      /* leaving IS the end of the session — the one moment both halves of
         the loop hang off. Staff are asked for the report they owe; the
         client is offered stars they may ignore. */
      if (amClient) {
        if (c) HV.rateSheet(c, {
          taskId: t.id, dateISO: today, key: t.pillar,
          day: c.day + occ.rd, label: occ.title,
          staffId: (occ.assignees || [])[0] || null,
        });
        return;
      }
      if (HV.reportRequired(t) && !HV.reportFiled(t.id, today, me.id)) {
        HV.meetui.reportSheet(t.id, today);
      } else {
        HV.toast('You left the room.');
      }
    }
    /* the room is a modal dialog, so it owes the same two things HV.sheet
       gives every other dialog: Tab may not walk out of it into the page
       behind, and the key that opened it gets the focus back on the way out.
       Building the room as its own overlay bought the leave hook — it did
       not excuse it from the contract. */
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); leave(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.prototype.filter.call(
        pop.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
        n => n.offsetParent !== null || n === pop);
      if (!f.length) return;
      const firstEl = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === pop)) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    pop.querySelector('[data-mtg-leave]').addEventListener('click', leave);
  };

  /* ── the report ───────────────────────────────────────────────────── */
  HV.meetui.reportSheet = function (taskId, dateISO) {
    const t = (HV.store.tasks || []).find(x => x.id === taskId);
    const me = HV.me();
    if (!t || !me) return;
    const c = t.clientId ? HV.client(t.clientId) : null;
    const occ = HV.occursOn(t, 0) || { title: t.title, start: t.start, dur: t.dur, rd: 0 };
    const day = c ? c.day + (occ.rd || 0) : null;

    HV.sheet(
      '<div class="h1">Session report</div>' +
      '<p class="sub" style="margin:0">' + HV.esc(occ.title) +
        (c ? ' · ' + HV.esc(c.name) : '') +
        (day != null ? ' · Day <span class="num">' + day + '</span>' : '') +
        ' — pod-side, never shown to the client.</p>' +
      '<label class="field-label" id="mr-went-l">How did it go?</label>' +
      '<div class="mtg-went" id="mr-went" role="group" aria-labelledby="mr-went-l">' +
        WENT.map(function (w) {
          return '<button class="chip" data-went="' + w.key + '" aria-pressed="false">' +
            HV.esc(w.label) + '</button>';
        }).join('') +
      '</div>' +
      '<label class="field-label" for="mr-note">What did you observe?</label>' +
      '<textarea class="input" id="mr-note" rows="3" placeholder="Form, effort, mood, anything the pod should read before the next one…"></textarea>' +
      '<label class="field-label" for="mr-concern">Anything to flag? (optional)</label>' +
      '<input class="input" id="mr-concern" placeholder="A concern the team should act on">' +
      '<label class="field-label" for="mr-next">Next step (optional)</label>' +
      '<input class="input" id="mr-next" placeholder="e.g. Nudge load up 2.5 kg next session">' +
      '<button class="btn block" id="mr-save">File the report</button>' +
      '<button class="btn quiet block" id="mr-later">Later</button>',
      function (sheet) {
        let went = '';
        sheet.querySelectorAll('[data-went]').forEach(function (b) {
          b.addEventListener('click', function () {
            went = b.dataset.went;
            sheet.querySelectorAll('[data-went]').forEach(function (x) {
              x.classList.toggle('sel', x === b);
              x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
            });
          });
        });
        sheet.querySelector('#mr-later').addEventListener('click', function () {
          HV.closeSheet();
          HV.toast('Left open — it stays on your work list until it is filed.');
        });
        sheet.querySelector('#mr-save').addEventListener('click', function () {
          const note = sheet.querySelector('#mr-note').value.trim();
          /* both halves are required, the same stance the pod's team note
             takes: a rating with no words does not brief anybody */
          if (!went) { HV.toast('Say how it went first.'); return; }
          if (!note) { HV.toast('Write the observation too — a verdict alone briefs nobody.'); return; }
          const concern = sheet.querySelector('#mr-concern').value.trim();
          const next = sheet.querySelector('#mr-next').value.trim();
          const s = HV.store;
          s.sessionReports = s.sessionReports || [];
          s.reportSeq = (s.reportSeq || 0) + 1;
          s.sessionReports.push({
            id: 'sr-' + s.reportSeq, taskId: t.id, dateISO: dateISO,
            clientId: t.clientId || null, byId: me.id,
            /* the cycle coordinates are snapshotted here because every
               existing session surface joins on (cy, day, pillar) while the
               obligation itself lives on (taskId, dateISO) */
            cy: c ? c.cycle : null, day: day, pillar: t.pillar || null,
            went: went, note: note, concern: concern, next: next, ts: HV.now(),
          });
          /* the front desk stops chasing */
          (s.worklist || []).forEach(function (w) {
            if (w.type === 'report' && w.taskId === t.id && w.dateISO === dateISO &&
                w.owner === me.id) w.status = 'done';
          });
          if (c) HV.logAct(c, 'report', 'Session report filed — ' + occ.title +
            (concern ? ' · concern flagged' : ''));
          HV.save();
          if (concern && c) {
            const seat = HV.staffFor(c, 'admin');
            if (seat && !seat.ai && seat.id !== me.id)
              HV.notice(seat.id, 'sla', 'Concern flagged on ' + c.name + '’s ' +
                occ.title + ': “' + concern + '”', c.id);
          }
          HV.closeSheet();
          HV.toast('Filed — the pod sees it on the session and in the review pack.');
          HV.refresh();
        });
      }
    );
  };

  /* the words a filed report is rendered with, so the queue, the client
     record and the brief all say the same thing */
  HV.meetui.wentWord = function (key) {
    const w = WENT.find(x => x.key === key);
    return w ? w.label : key || '';
  };
  HV.meetui.wentTone = function (key) {
    const w = WENT.find(x => x.key === key);
    return w ? w.tone : 'neutral';
  };
})();
