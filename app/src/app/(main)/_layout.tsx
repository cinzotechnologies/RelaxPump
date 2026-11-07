import { Slot } from 'expo-router';
import { View } from 'react-native';

import { BottomNav } from '@/components/BottomNav';
import { colors } from '@/theme';

/** Home, Tanks and Usage share the floating bottom nav. */
export default function MainLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.base }}>
      <Slot />
      <BottomNav />
    </View>
  );
}
