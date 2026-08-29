'use client';

/**
 * The two marks the calendar adds to the set.
 *
 * `Icon.tsx` is the closed mark set — 77 paths lifted from the demo's own ICONS
 * map — and the demo does exactly this for these two: it declares `I_REPEAT` and
 * `I_LINK` inline in the view because the set in core is closed
 * (console-schedule.js:33-36). Ported the same way, and kept here rather than
 * added to `ICON_PATHS`, so the generated set stays a faithful copy of the demo's
 * and re-running its extractor never has to argue with a hand edit.
 *
 * Same voice as the rest: a 24-box, hairline, round caps. Both wear `hv-icon`,
 * which carries that language at ZERO specificity (globals.css:131) — the demo
 * could leave its two marks bare because every home it gave them had a context
 * rule, and `.btn svg` is one of the demo rules this port did not need until now.
 * The context rules that ARE ported — `.tile .tic svg`, `.drow .tic svg`,
 * `.sch3-rsp svg` — still win, so a mark on a tile is still 12px.
 */

export function RepeatMark() {
  return (
    <svg className="hv-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9.5a5 5 0 0 1 5-5h8M14.5 2 17 4.5 14.5 7M20 14.5a5 5 0 0 1-5 5H7M9.5 22 7 19.5 9.5 17" />
    </svg>
  );
}

export function LinkMark() {
  return (
    <svg className="hv-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 14a4.5 4.5 0 0 0 6.4.4l2.3-2.3a4.5 4.5 0 0 0-6.4-6.4L11 7" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-2.3 2.3a4.5 4.5 0 0 0 6.4 6.4L13 17" />
    </svg>
  );
}
