import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { s } from '@/theme';

// Every icon is copied from reference/design/Main.dc.html (24×24 viewBox, stroke icons).
export type IconName =
  | 'arrowRight'
  | 'back'
  | 'chevron'
  | 'eye'
  | 'bell'
  | 'power'
  | 'auto'
  | 'tanks'
  | 'stats'
  | 'home'
  | 'bluetooth'
  | 'plus'
  | 'lock'
  | 'signOut'
  | 'warning'
  | 'check'
  | 'down'
  | 'chip'
  | 'wifi'
  | 'trash';

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export function Icon({ name, size = 18, color, strokeWidth = 2 }: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const px = s(size);
  return (
    <Svg width={px} height={px} viewBox="0 0 24 24">
      {render(name, common, color)}
    </Svg>
  );
}

function render(name: IconName, p: Record<string, unknown>, color: string) {
  switch (name) {
    case 'arrowRight':
      return <Path d="M5 12h14M13 6l6 6-6 6" {...p} />;
    case 'back':
      return <Path d="M15 6l-6 6 6 6" {...p} />;
    case 'chevron':
      return <Path d="M9 6l6 6-6 6" {...p} />;
    case 'eye':
      return (
        <>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...p} />
          <Circle cx={12} cy={12} r={3} {...p} />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" {...p} />
          <Path d="M10 20.5a2 2 0 0 0 4 0" {...p} />
        </>
      );
    case 'power':
      return <Path d="M12 3v9M7 6.3a8 8 0 1 0 10 0" {...p} />;
    case 'auto':
      return <Path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" {...p} />;
    case 'tanks':
      return (
        <>
          <Rect x={3} y={6} width={5} height={14} rx={1.5} {...p} />
          <Rect x={10} y={6} width={5} height={14} rx={1.5} {...p} />
          <Rect x={17} y={6} width={4} height={14} rx={1.5} {...p} />
        </>
      );
    case 'stats':
      return <Path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...p} />;
    case 'home':
      return <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...p} />;
    case 'bluetooth':
      return <Path d="M7 7l10 10-5 4.5V2.5L17 7 7 17" {...p} />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...p} />;
    case 'lock':
      return (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2} {...p} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} />
        </>
      );
    case 'signOut':
      return <Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" {...p} />;
    case 'warning':
      return <Path d="M12 3l10 18H2zM12 10v5M12 18v.5" {...p} />;
    case 'check':
      return <Path d="M5 12l5 5 9-10" {...p} />;
    case 'trash':
      return (
        <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" {...p} />
      );
    case 'down':
      return <Path d="M12 5v14M6 13l6 6 6-6" {...p} />;
    case 'chip':
      return (
        <>
          <Rect x={5} y={5} width={14} height={14} rx={2.5} {...p} />
          <Path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" {...p} />
        </>
      );
    case 'wifi':
      return (
        <>
          <Path d="M2.5 9a15 15 0 0 1 19 0" {...p} />
          <Path d="M5.5 12.5a10 10 0 0 1 13 0" {...p} />
          <Path d="M8.7 16a5 5 0 0 1 6.6 0" {...p} />
          <Circle cx={12} cy={19.5} r={1.2} fill={color} />
        </>
      );
  }
}
