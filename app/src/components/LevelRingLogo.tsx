import Svg, {
  Circle,
  ClipPath,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

/**
 * Logo option A · Level ring (reference/design/Logo.dc.html), light variant used on the white tile.
 * `variant="dark"` is the version for dark backgrounds.
 */
export function LevelRingLogo({ size, variant = 'light' }: { size: number; variant?: 'light' | 'dark' }) {
  const light = variant === 'light';
  const id = light ? 'lrl' : 'lrd';
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id={`${id}r`} x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#03606E" />
          <Stop offset="0.55" stopColor="#22B8C6" />
          <Stop offset="1" stopColor="#9AF0F6" />
        </LinearGradient>
        <LinearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8CEBF2" />
          <Stop offset="1" stopColor="#037788" />
        </LinearGradient>
        <ClipPath id={`${id}c`}>
          <Circle cx="24" cy="24" r="13.6" />
        </ClipPath>
        <Filter id={`${id}f`} x="-30%" y="-30%" width="160%" height="160%">
          <FeGaussianBlur stdDeviation="1.2" />
        </Filter>
      </Defs>
      <Circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={light ? 'rgba(3,83,96,0.08)' : 'rgba(127,227,236,0.12)'}
        strokeWidth="3.6"
      />
      <Circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={`url(#${id}r)`}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray="96.6 128.8"
        transform="rotate(128 24 24)"
        filter={`url(#${id}f)`}
        opacity={light ? 0.35 : 0.7}
      />
      <Circle
        cx="24"
        cy="24"
        r="20.5"
        fill="none"
        stroke={`url(#${id}r)`}
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray="96.6 128.8"
        transform="rotate(128 24 24)"
      />
      <Circle cx="24" cy="24" r="13.6" fill={light ? '#EAF7F9' : 'rgba(127,227,236,0.10)'} />
      <G clipPath={`url(#${id}c)`}>
        <Path d="M6 23.5q3.75-3.2 7.5 0t7.5 0t7.5 0t7.5 0t7.5 0V40H6Z" fill="#7FE3EC" opacity={0.45} />
        <Path d="M2 26q3.75-3.4 7.5 0t7.5 0t7.5 0t7.5 0t7.5 0t7.5 0V40H2Z" fill={`url(#${id}w)`} />
        <Path
          d="M14.5 31.5q2-1.4 4 0"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.6}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <Circle cx="28.5" cy="33" r="0.9" fill="#FFFFFF" fillOpacity={0.6} />
      </G>
      <Circle
        cx="24"
        cy="24"
        r="13.6"
        fill="none"
        stroke={light ? 'rgba(3,119,136,0.25)' : 'rgba(127,227,236,0.35)'}
        strokeWidth="0.8"
      />
      <Path
        d="M16.5 16.8a10 10 0 0 1 5-3.2"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={light ? 0.9 : 0.35}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  );
}
