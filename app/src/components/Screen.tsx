import { useFocusEffect } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { BackHandler, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useUi, type Route } from '@/state/ui';
import { colors } from '@/theme';

import { screenEntering } from './FadeUp';

/** Screen wrapper: slide-in by navigation direction, optional scroll, Android back → `back`. */
export function Screen({
  children,
  scroll,
  style,
  contentStyle,
  onBack,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onBack?: () => void;
  route?: Route;
}) {
  const dir = useUi((s) => s.dir);
  useFocusEffect(
    useCallback(() => {
      if (!onBack) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack]),
  );
  return (
    <Animated.View entering={screenEntering(dir)} style={[{ flex: 1, backgroundColor: colors.base }, style]}>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </Animated.View>
  );
}
