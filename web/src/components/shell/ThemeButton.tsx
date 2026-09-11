'use client';

import { Icon } from '@/components/icons/Icon';
import { THEME_LABEL, nextTheme, setTheme, useTheme } from '@/lib/theme';

/**
 * THE THEME BUTTON — a third round button in the Home header, beside the chats
 * and the bell. One tap walks System → Light → Dark; the icon says which mode
 * is on (device, sun, moon) and the tooltip names the choice. The choice is
 * this browser's and is applied before the first paint — see lib/theme.ts.
 */
export function ThemeButton() {
  const theme = useTheme();
  const label = THEME_LABEL[theme];
  return (
    <button
      type="button"
      className="side-bell"
      title={`Theme: ${label} — tap to switch`}
      aria-label={`Theme: ${label}. Switch`}
      onClick={() => setTheme(nextTheme(theme))}
    >
      <Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'device'} />
    </button>
  );
}
