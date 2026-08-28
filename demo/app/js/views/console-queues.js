/* HAALVING console view — Work Queues. The SLA-bound surfaces in one place:
   the work list, approvals (SOP sign-offs), meal ratings, medical summaries,
   deviations and the live board. Status by exception — a role with no
   permitted board never reaches this screen, and the nav item is not drawn
   for it. Access to the route itself is the nav gate (HV.allowedView), not a
   roles array here — individual boards still gate themselves via roles/perm. */
(function () {
  'use strict';

  var ORDER = ['work', 'approvals', 'meals', 'medical', 'deviations', 'live'];

  HV.registerView('queues', {
    title: 'Queues',
    render: function (el, params) {
      var boards = HV.boardsFor(ORDER);
      if (!boards.length) {
        el.innerHTML = HV.ui.empty('leaf', 'No queues for your role.');
        return;
      }
      var active = boards.some(function (b) { return b.key === params[0]; }) ? params[0] : boards[0].key;
      var board = boards.find(function (b) { return b.key === active; });
      var waiting = boards.reduce(function (n, b) { return n + (b.count ? b.count() : 0); }, 0);

      el.innerHTML =
        '<div class="h1-row"><div><div class="kicker">THE CLOCK</div><h1 class="h1">Queues</h1>' +
        '<p class="sub">Work the rules put on a clock — rated, signed or cleared before its SLA runs out.</p></div>' +
        '<span class="pill ' + (waiting ? 'warn' : 'ok') + '"><span class="num">' + waiting + '</span> waiting</span></div>' +
        HV.ui.tabs(boards.map(function (b) {
          return { key: b.key, label: b.label, count: b.count ? b.count() : 0 };
        }), active) +
        '<div id="board-root" style="display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s3)"></div>';

      board.mount(el.querySelector('#board-root'));

      el.querySelectorAll('.tabs button').forEach(function (b) {
        b.addEventListener('click', function () { HV.go('#/queues/' + b.dataset.tab); });
      });
    },
  });
})();
