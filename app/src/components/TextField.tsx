import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useState, type ComponentRef, type Ref } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { alpha, colors, font, s } from '@/theme';

export type TextFieldRef = ComponentRef<typeof TextInput>;

/** 46 px field: card bg, faint glow border; on focus border .7, 3 px ring, darker bg. */
export function TextField({
  style,
  onFocus,
  onBlur,
  tracking,
  inSheet,
  ref,
  ...rest
}: TextInputProps & { tracking?: number; inSheet?: boolean; ref?: Ref<TextFieldRef> }) {
  const [focus, setFocus] = useState(false);
  const Input = (inSheet ? BottomSheetTextInput : TextInput) as typeof TextInput;
  return (
    <Input
      ref={ref}
      allowFontScaling={false}
      placeholderTextColor={colors.dim}
      selectionColor={colors.glow}
      cursorColor={colors.glow}
      {...rest}
      onFocus={(e) => {
        setFocus(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        onBlur?.(e);
      }}
      style={[
        font(400),
        {
          height: s(46),
          borderRadius: s(14),
          borderWidth: 1,
          borderColor: focus ? alpha(colors.glow, 0.7) : alpha(colors.glow, 0.14),
          backgroundColor: focus ? colors.focusBg : colors.card,
          color: colors.text,
          paddingHorizontal: s(14),
          fontSize: s(15),
          boxShadow: focus ? `0 0 0 ${s(3)}px ${alpha(colors.glow, 0.14)}` : undefined,
        },
        tracking !== undefined && { letterSpacing: s(tracking) },
        style,
      ]}
    />
  );
}
