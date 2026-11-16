import { useEffect } from 'react';

import { markAllSeen } from '@/state/notifs';
import { useUi } from '@/state/ui';

import { BleSheet } from './BleSheet';
import { DeleteSheet } from './DeleteSheet';
import { ForgotSheet } from './ForgotSheet';
import { NotificationsSheet } from './NotificationsSheet';
import { PasswordSheet } from './PasswordSheet';
import { TanksSheet } from './TanksSheet';

/** All bottom sheets, mounted once at the root. Opening one is `useUi.openSheet(name)`. */
export function Sheets() {
  const sheet = useUi((st) => st.sheet);
  useEffect(() => {
    if (sheet === 'notif') markAllSeen();
  }, [sheet]);
  return (
    <>
      <TanksSheet />
      <PasswordSheet />
      <NotificationsSheet />
      <ForgotSheet />
      <BleSheet />
      <DeleteSheet />
    </>
  );
}
