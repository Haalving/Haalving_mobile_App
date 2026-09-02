'use client';

import { Audit, Empty, IconTile, Pill, SecTitle } from '@/components/ui';
import { useClientDocuments, type ClientDetail, type DocumentRow } from '@/features/clients/queries';
import { first } from './ScratchPad';

/**
 * DOCUMENTS — everything on the client's file.
 *
 * The client uploads a lab, an InBody report or a scan from the app's Records
 * Vault; the doctor signs a summary against it. This tab is the client-scoped
 * read of those — `GET /clients/:id/documents`, newest first — with a pill that
 * says at a glance whether a clinician has signed it yet.
 *
 * THIS IS NOT THE RAW RECORD. Raw medical records stay the doctor's alone, opened
 * from the Work Queue with every open audited; this tab lists what exists and who
 * signed it, not the file itself.
 */

function DocRow({ d }: { d: DocumentRow }) {
  const meta = [d.kind, d.uploadedOn, d.by ? `signed by ${d.by}` : null].filter(Boolean).join(' · ');
  return (
    <div className="trow">
      <IconTile name="doc" className="sm" />
      <div className="grow">
        <b>{d.title}</b>
        <small>{meta}</small>
      </div>
      {d.signed ? <Pill kind="ok">Signed</Pill> : <Pill kind="warn">Pending</Pill>}
    </div>
  );
}

export function DocumentsTab({ c }: { c: ClientDetail }) {
  const { data, isLoading, isError } = useClientDocuments(c.id);

  if (isLoading) {
    return (
      <div className="ccscroll">
        <Empty icon="clock" sentence="Reading the file…" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="ccscroll">
        <Empty icon="leaf" sentence="We could not read the documents just now." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="ccscroll">
        <Empty
          icon="doc"
          sentence="No documents on file yet."
          sub={`Labs, reports and scans ${first(c.name)} uploads in the app appear here, with whether the doctor has signed a summary.`}
        />
      </div>
    );
  }

  return (
    <div className="ccscroll">
      <div className="card">
        <SecTitle>Documents</SecTitle>
        <div className="list">
          {data.map((d) => (
            <DocRow key={d.id} d={d} />
          ))}
        </div>
        <Audit>
          Every document on {first(c.name)}&rsquo;s file, newest first. Raw records are the
          doctor&rsquo;s alone and opened from the Work Queue — every open is logged.
        </Audit>
      </div>
    </div>
  );
}
