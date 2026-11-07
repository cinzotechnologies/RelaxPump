import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { s } from './scale';
import { colors, fonts } from './tokens';

type Weight = 300 | 400 | 500 | 600 | 700;
type Family = 'ui' | 'outfit';

const interByWeight: Record<Weight, string> = {
  300: fonts.inter300,
  400: fonts.inter400,
  500: fonts.inter500,
  600: fonts.inter600,
  700: fonts.inter700,
};
const outfitByWeight: Record<Weight, string> = {
  300: fonts.outfit300,
  400: fonts.outfit300,
  500: fonts.outfit500,
  600: fonts.outfit600,
  700: fonts.outfit600,
};

/** Font style for a weight. The design's UI font is `-apple-system, Inter`: system on iOS, Inter elsewhere. */
export function font(weight: Weight = 400, family: Family = 'ui'): TextStyle {
  if (family === 'outfit') return { fontFamily: outfitByWeight[weight] };
  if (Platform.OS === 'ios') return { fontWeight: String(weight) as TextStyle['fontWeight'] };
  return { fontFamily: interByWeight[weight] };
}

export type TxtProps = TextProps & {
  size?: number;
  weight?: Weight;
  family?: Family;
  color?: string;
  /** letter-spacing in design px */
  tracking?: number;
  tabular?: boolean;
};

export function Txt({
  size = 14,
  weight = 400,
  family = 'ui',
  color = colors.text,
  tracking,
  tabular,
  style,
  ...rest
}: TxtProps) {
  return (
    <Text
      allowFontScaling={false}
      {...rest}
      style={[
        font(weight, family),
        { fontSize: s(size), color },
        tracking !== undefined && { letterSpacing: s(tracking) },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
