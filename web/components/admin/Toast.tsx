'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AIcon, IC } from './icons';

/** Dark pill at the bottom (Admin.dc.html .toast); `say` shows it for 2.4 s. */
export function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2400);
  }, []);
  useEffect(() => () => clearTimeout(t.current), []);
  const toast = msg ? (
    <div className="toast" role="status">
      <AIcon d={IC.check} size={18} w={2.4} />
      {msg}
    </div>
  ) : null;
  return { toast, say };
}
