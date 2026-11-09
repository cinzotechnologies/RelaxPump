'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { generatePassword, passwordError, whatsAppLink, whatsAppMessage } from '@/lib/admin/password';

import { AIcon, IC, initials, phoneFmt } from './icons';
import { useToast } from './Toast';

export type RequestRow = {
  id: string;
  name: string;
  phone: string;
  status: 'waiting' | 'done';
  when: string; // "5 min ago" (made on the server)
  doneLabel: string | null; // "Done by … · 8 Nov, 9:30 PM"
};

type Tab = 'waiting' | 'done';

/** Waiting / Done lists and the 3 steps: set password → WhatsApp → mark done. */
export function RequestsView({
  waiting,
  done,
  startId,
}: {
  waiting: RequestRow[];
  done: RequestRow[];
  startId: string | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState([...waiting, ...done]);
  const start = rows.find((r) => r.id === startId) ?? waiting[0] ?? null;
  const [tab, setTab] = useState<Tab>(start?.status ?? 'waiting');
  const [selId, setSelId] = useState<string | null>(start?.id ?? null);
  const [pw, setPw] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [noAcct, setNoAcct] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const { toast, say } = useToast();
  const detail = useRef<HTMLDivElement>(null);

  const list = rows.filter((r) => r.status === tab);
  const nWaiting = rows.filter((r) => r.status === 'waiting').length;
  const sel = rows.find((r) => r.id === selId) ?? null;

  function pick(r: RequestRow) {
    setSelId(r.id);
    const u = new URL(window.location.href);
    u.searchParams.set('id', r.id);
    window.history.replaceState(null, '', u);
    // phone: the detail card is below the list
    if (window.matchMedia('(max-width: 820px)').matches) {
      requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  async function post(path: string, body?: unknown) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const b = (await r.json().catch(() => null)) as { error?: string; noAccount?: boolean } | null;
    return { ok: r.ok, error: b?.error ?? `Something went wrong (${r.status})`, noAccount: !!b?.noAccount };
  }

  async function savePw(r: RequestRow) {
    const p = pw[r.id] ?? '';
    const err = passwordError(p);
    if (err) return say(err);
    setBusy(true);
    const res = await post(`/api/admin/reset-requests/${r.id}/password`, { password: p });
    setBusy(false);
    if (res.ok) {
      setSaved((s) => ({ ...s, [r.id]: true }));
      setNoAcct((s) => ({ ...s, [r.id]: '' }));
      say(`New password saved for ${r.name}`);
    } else if (res.noAccount) {
      setNoAcct((s) => ({ ...s, [r.id]: res.error }));
    } else say(res.error);
  }

  async function markDone(r: RequestRow) {
    setBusy(true);
    const res = await post(`/api/admin/reset-requests/${r.id}/done`);
    setBusy(false);
    if (!res.ok) return say(res.error);
    setRows((x) => x.map((i) => (i.id === r.id ? { ...i, status: 'done', doneLabel: 'Done just now' } : i)));
    say(`${r.name} marked as done`);
    router.refresh(); // sidebar badge
  }

  const p = sel ? (pw[sel.id] ?? '') : '';
  const isDone = sel?.status === 'done';
  const isSaved = !!sel && !!saved[sel.id];
  const missing = sel ? noAcct[sel.id] : '';
  const msg = sel ? whatsAppMessage(sel.name, p || '••••••••') : '';

  return (
    <>
      <div className="anote">
        When someone taps <b>Forgot password</b> in the app, the request lands here. Set a new password, send
        it on WhatsApp, then mark it done.
      </div>
      <div className="g2">
        <div className="card">
          <div className="ch">
            <div className="atabs" role="tablist" aria-label="Requests">
              {(['waiting', 'done'] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={tab === t ? 'atab on' : 'atab'}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t === 'waiting' ? `Waiting · ${nWaiting}` : `Done · ${rows.length - nWaiting}`}
                </button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <p className="empty-note">
              {tab === 'waiting' ? 'All done. No one is waiting.' : 'Nothing here.'}
            </p>
          ) : null}
          {list.map((r) => (
            <button
              key={r.id}
              className={r.id === selId ? 'row on' : 'row'}
              type="button"
              aria-current={r.id === selId ? 'true' : undefined}
              onClick={() => pick(r)}
            >
              <span className="av">{initials(r.name)}</span>
              <span className="rn">
                <b>{r.name}</b>
                <span>
                  +91 {phoneFmt(r.phone)} · {r.when}
                </span>
              </span>
              <span className={r.status === 'done' ? 'pillst done' : 'pillst pend'}>
                {r.status === 'done' ? 'Done' : 'Waiting'}
              </span>
            </button>
          ))}
        </div>

        <div className="card" ref={detail} style={{ scrollMarginTop: 72 }}>
          {!sel ? (
            <p className="empty-note">Pick a request to start.</p>
          ) : (
            <>
              <div className="ch">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span className="av">{initials(sel.name)}</span>
                  <span className="rn">
                    <b>{sel.name}</b>
                    <span>+91 {phoneFmt(sel.phone)}</span>
                  </span>
                </div>
                <span className={isDone ? 'pillst done' : 'pillst pend'}>{isDone ? 'Done' : 'Waiting'}</span>
              </div>
              <div className="adet">
                {isDone && sel.doneLabel ? <span className="adone-by">{sel.doneLabel}</span> : null}

                <div className="astp">
                  <span className={isSaved || isDone ? 'asn ok' : 'asn'}>1</span>
                  <div>
                    <b>Set a new password</b>
                    <div className="apw">
                      <input
                        className="ainp"
                        type="text"
                        aria-label="New password"
                        placeholder="At least 6 characters"
                        autoComplete="off"
                        spellCheck={false}
                        value={p}
                        disabled={isDone}
                        onChange={(e) => {
                          setPw((s) => ({ ...s, [sel.id]: e.target.value }));
                          setSaved((s) => ({ ...s, [sel.id]: false }));
                        }}
                      />
                      <button
                        className="abtn"
                        type="button"
                        disabled={isDone}
                        onClick={() => {
                          setPw((s) => ({ ...s, [sel.id]: generatePassword() }));
                          setSaved((s) => ({ ...s, [sel.id]: false }));
                        }}
                      >
                        Generate
                      </button>
                    </div>
                    <button
                      className="abtn strong"
                      type="button"
                      disabled={busy || isDone || isSaved || p.length < 6}
                      onClick={() => void savePw(sel)}
                    >
                      {isSaved || isDone ? 'Password saved' : 'Save new password'}
                    </button>
                    {missing ? (
                      <span className="aerr" role="alert">
                        {missing} You can mark this request done.
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="astp">
                  <span className={sent[sel.id] || isDone ? 'asn ok' : 'asn'}>2</span>
                  <div>
                    <b>Send it on WhatsApp</b>
                    <div className="amsg">{msg}</div>
                    {isSaved && !isDone ? (
                      <a
                        className="abtn wa"
                        href={whatsAppLink(sel.phone, msg)}
                        target="_blank"
                        rel="noopener"
                        onClick={() => setSent((s) => ({ ...s, [sel.id]: true }))}
                      >
                        <AIcon d={IC.wa} size={18} />
                        Open WhatsApp
                      </a>
                    ) : (
                      <button className="abtn" type="button" disabled>
                        Open WhatsApp
                      </button>
                    )}
                  </div>
                </div>

                <div className="astp">
                  <span className={isDone ? 'asn ok' : 'asn'}>3</span>
                  <div>
                    <b>Mark as done</b>
                    <button
                      className="abtn"
                      type="button"
                      disabled={busy || isDone || !(isSaved || missing)}
                      onClick={() => void markDone(sel)}
                    >
                      {isDone ? 'Done' : 'Mark as done'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {toast}
    </>
  );
}
