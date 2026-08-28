'use client';

/**
 * The shared tab bar — `HV.ui.tabs`, ported.
 *
 * Tab state lives in the URL, not in component state, so a refresh keeps your
 * place and a deep link opens the tab it names. That is the demo's contract
 * (tabs are hash sub-routes there) and breaking it here would make every tabbed
 * page lose its place on reload.
 */
export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onSelect,
}: {
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          className={t.key === active ? 'on' : ''}
          aria-current={t.key === active ? 'page' : undefined}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
          {t.count ? (
            <>
              {' '}
              <span className="pill info">
                <span className="num">{t.count}</span>
              </span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}
