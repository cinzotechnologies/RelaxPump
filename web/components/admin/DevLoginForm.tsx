'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { LogoMark } from '@/components/ui/Logo';

/** Local-dev sign-in (no password check: the server only accepts it on localhost). */
export function DevLoginForm() {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="lbox"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        const email = new FormData(e.currentTarget).get('email');
        const res = await fetch('/api/admin/dev-login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (res.ok) {
          router.replace('/admin');
          router.refresh();
        } else {
          setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not sign in');
          setBusy(false);
        }
      }}
    >
      <div className="lbrand">
        <LogoMark size={40} />
        <span>
          <span className="wm-relax">Relax</span>
          <span className="wm-pump">Pump</span> <small>ADMIN</small>
        </span>
      </div>
      <h1>Sign in</h1>
      <label className="afld" htmlFor="ae">
        Email
        <input
          className="ainp"
          id="ae"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@cinzotechnologies.com"
          required
        />
      </label>
      <label className="afld" htmlFor="ap">
        Password
        <input
          className="ainp"
          id="ap"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
        />
      </label>
      {err ? (
        <p className="lerr" role="alert">
          {err}
        </p>
      ) : null}
      <button className="abtn" type="submit" disabled={busy}>
        Sign in
      </button>
      <p className="lsmall">For CINZO staff only.</p>
    </form>
  );
}
