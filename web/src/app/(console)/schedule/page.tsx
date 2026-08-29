'use client';

import { ScheduleView } from '@/features/schedule/ScheduleView';

/**
 * Schedule — the team's working calendar.
 *
 * NO TAB IN THE URL, deliberately. The demo's `#/schedule` is one screen, and
 * Day/Week is a way of LOOKING at it rather than a place to be — a link to
 * "/schedule/day" would promise a destination that the next narrow viewport
 * silently overrules (`resolveMode` picks Day under 860px on its own). The
 * anchored week is the same kind of thing: it starts on today, every time.
 *
 * The page header lives inside the toolbar because it does in the demo — the
 * kicker, the title and the sentence under it all change with the lens, and the
 * lens button sits two lines below them.
 */
export default function SchedulePage() {
  return <ScheduleView />;
}
