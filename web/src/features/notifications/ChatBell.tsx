'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/icons/Icon';
import { ChatDrawer } from '@/features/notifications/ChatDrawer';
import { useRooms } from '@/features/notifications/rooms';

/**
 * THE CHATS BUTTON, beside the bell. The badge counts rooms waiting for a
 * reply — the person wrote last and nobody has answered. A tap opens the chat
 * drawer over the right of the screen (ChatDrawer), where every room is read
 * and answered in place.
 */
export function ChatBell() {
  const [open, setOpen] = useState(false);
  const { data } = useRooms();
  const lit = data?.lit ?? 0;

  return (
    <>
      <button
        type="button"
        className={`side-bell${open ? ' on' : ''}`}
        aria-label={lit ? `Chats (${lit} waiting for a reply)` : 'Chats'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Chats"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chat" />
        {lit ? <span className="dot num">{lit > 99 ? '99+' : lit}</span> : null}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(<ChatDrawer open={open} onClose={() => setOpen(false)} />, document.body)
        : null}
    </>
  );
}
