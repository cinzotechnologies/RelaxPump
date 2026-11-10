import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Easing, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, colors, motion, s, Txt } from '@/theme';

/** Bottom sheet from the design: deep card, 28 px top radius, glow top border, 36×4 handle, 50 % backdrop. */
export function Sheet({
  open,
  onClose,
  title,
  gap = 16,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  gap?: number;
  children: ReactNode;
}) {
  const ref = useRef<BottomSheetModal>(null);
  const openRef = useRef(open);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const timing = useBottomSheetTimingConfigs({
    duration: reduce ? 1 : 450,
    easing: Easing.bezier(...motion.ease),
  });

  useEffect(() => {
    openRef.current = open;
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...p}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={ref}
      // Only report a close the user made (swipe/backdrop); switching to another sheet already set `open` false.
      onDismiss={() => {
        if (openRef.current) onClose();
      }}
      animationConfigs={timing}
      backdropComponent={backdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      handleComponent={() => (
        <View style={{ paddingTop: s(10), alignItems: 'center' }}>
          <View
            style={{
              width: s(36),
              height: s(4),
              borderRadius: s(2),
              backgroundColor: alpha(colors.white, 0.2),
            }}
          />
        </View>
      )}
      backgroundStyle={{
        backgroundColor: colors.deepCard,
        borderTopLeftRadius: s(28),
        borderTopRightRadius: s(28),
        borderTopWidth: 1,
        borderColor: alpha(colors.glow, 0.3),
      }}
    >
      <BottomSheetView
        style={{
          paddingTop: s(gap),
          paddingHorizontal: s(20),
          paddingBottom: s(32) + insets.bottom,
          gap: s(gap),
        }}
      >
        {title ? (
          <Txt size={17} weight={600}>
            {title}
          </Txt>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
