'use client';

import { useState } from 'react';

/** Phone + password → /api/delete-account. */
export function DeleteAccountForm() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const b = (await r.json().catch(() => null)) as { error?: string } | null;
      if (r.ok) setDone(true);
      else setErr(b?.error ?? 'Something went wrong. Please try again.');
    } catch {
      setErr('No internet? Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="lok" role="status">
        Your account has been deleted.
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="lfld">
        Mobile number
        <input
          className="linp"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit number"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 16))}
        />
      </label>
      <label className="lfld">
        Password
        <input
          className="linp"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />I understand this
        deletes my account for good.
      </label>
      {err ? (
        <span className="lerr2" role="alert">
          {err}
        </span>
      ) : null}
      <button className="btn" type="submit" disabled={!sure || busy || !phone || password.length < 6}>
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
    </form>
  );
}
