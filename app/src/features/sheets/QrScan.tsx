import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { View } from 'react-native';

import { Fade } from '@/components/FadeUp';
import { PrimaryButton } from '@/components/PrimaryButton';
import { parseBoxQr } from '@/logic/claim';
import { alpha, colors, s, Txt } from '@/theme';

export type BoxCode = NonNullable<ReturnType<typeof parseBoxQr>>;

/** Scan the QR sticker on the controller box (device id + Bluetooth PoP + claim code). */
export function QrScan({ onCode, onBad }: { onCode: (c: BoxCode) => void; onBad: () => void }) {
  const [perm, request] = useCameraPermissions();
  const done = useRef(false);
  const lastBad = useRef(0);

  if (!perm?.granted) {
    return (
      <Fade style={{ gap: s(12) }}>
        <Txt size={14} color={colors.muted}>
          Scan the code on your controller box. We need the camera for that.
        </Txt>
        <PrimaryButton label="Allow camera" onPress={() => request()} />
      </Fade>
    );
  }
  return (
    <Fade style={{ gap: s(12) }}>
      <Txt size={14} color={colors.muted}>
        Scan the code on your controller box.
      </Txt>
      <View
        style={{
          height: s(240),
          borderRadius: s(20),
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: alpha(colors.glow, 0.3),
        }}
      >
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const c = parseBoxQr(data);
            if (c) {
              done.current = true;
              onCode(c);
            } else if (Date.now() - lastBad.current > 2500) {
              lastBad.current = Date.now();
              onBad();
            }
          }}
        />
      </View>
    </Fade>
  );
}
