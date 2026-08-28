'use client';

import { useRouter } from 'next/navigation';

import { Avatar, LevelBadges, Pill, SessionRings, useToast } from '@/components/ui';
import type { AttentionRow as Row } from '@/features/home/attention/queries';

/**
 * One Attention row — ported from `attentionHtml` (console-digest.js:570-592).
 *
 * The element order is the demo's and is not rearranged: avatar, then a growing
 * middle holding the name row, the digest sentence, the evidence link and the
 * level badges, then the session rings at the trailing edge.
 */

/**
 * `flagPill` — high says "High" in the danger tone, med says "Watch" in amber,
 * and an unflagged line wears nothing at all.
 *
 * Only these two tones. A flag is a volume, not a pillar, so it never borrows a
 * pillar's colour — those belong to the badges and the rings further along the
 * same row, and spending one here would leave three colour languages in one line.
 */
function FlagPill({ flag }: { flag: Row['flag'] }) {
  if (flag === 'HIGH') return <Pill kind="bad">High</Pill>;
  if (flag === 'MED') return <Pill kind="warn">Watch</Pill>;
  return null;
}

export function AttentionRow({ row }: { row: Row }) {
  const router = useRouter();
  const toast = useToast();

  const { client } = row;
  /* the demo guards on both: a client without levels or without a session ledger
     draws neither instrument rather than half a row */
  const hasInstruments = !!client.levels && !!client.sessions;

  const open = () => router.push(`/clients/${row.clientId}`);

  return (
    <div
      className={`trow click${row.fresh ? ' dg-fresh' : ''}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      <Avatar name={client.name} />

      {/*
        NO `flex: 1` HERE, deliberately.

        `.grow` earns `flex:1; min-width:0` from `.row .grow` — scoped to `.row`,
        and a `.trow` is not one (app.css:494, and the demo says so itself at
        app.css:1739). So inside a digest row the middle column sizes to its
        content and the rings sit just past the text.

        Adding the flex inline made the column 904px instead of 494px and threw
        the rings 410px right, hard against the card edge. The row still "looked
        fine" on its own; it only reads as wrong beside the demo.
      */}
      <span className="grow">
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <b>{client.name}</b>
          <FlagPill flag={row.flag} />
          {row.fresh ? <Pill kind="info">New</Pill> : null}
        </span>

        <small>{row.text}</small>

        <button
          type="button"
          className="sub"
          style={{ color: 'var(--brand)', fontWeight: 600, textAlign: 'left' }}
          onClick={(e) => {
            /* the row is a button too — without this the click opens the record
               instead of showing the evidence */
            e.stopPropagation();
            toast(`Evidence opened: ${row.evidence.join(' · ')}`);
          }}
        >
          Evidence: {row.evidence.join(' · ')}
        </button>

        {hasInstruments ? (
          <span className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s1)' }}>
            <LevelBadges levels={client.levels} />
          </span>
        ) : null}
      </span>

      {hasInstruments && client.sessions ? (
        <span className="row" style={{ gap: 'var(--s2)' }}>
          <SessionRings sessions={client.sessions} size="sm" />
        </span>
      ) : null}
    </div>
  );
}
