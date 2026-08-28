import { Empty, SecTitle } from '@/components/ui';
import type { IconName } from '@/components/icons/Icon';

/**
 * A page whose board has not been built yet.
 *
 * It renders the demo's OWN empty state — a sentence a human would say, never
 * just an icon — because a blank screen and a broken screen look identical, and
 * the difference matters to whoever is walking the console for the first time.
 *
 * The h1 and kicker are real: the page's title, route and place in the sidebar
 * are decided, and only the board inside it is outstanding.
 */
export function PendingPage({
  kicker,
  title,
  sub,
  icon = 'doc',
  sentence,
  detail,
}: {
  kicker: string;
  title: string;
  sub: string;
  icon?: IconName | string;
  sentence: string;
  detail?: string;
}) {
  return (
    <>
      <div className="h1-row">
        <div>
          <div className="kicker">{kicker}</div>
          <h1 className="h1">{title}</h1>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <SecTitle>Not built yet</SecTitle>
      <div className="card">
        <Empty icon={icon} sentence={sentence} sub={detail} />
      </div>
    </>
  );
}
