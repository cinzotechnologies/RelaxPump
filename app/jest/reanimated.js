// Small stand-in for react-native-reanimated in Jest (v4's own mock needs native worklets).
// Animations resolve to their end value; layout animations are chainable no-ops.
const React = require('react');
const { View, Text, ScrollView, Image } = require('react-native');

const chain = () => {
  const p = new Proxy(function () {}, {
    get: (_t, k) => (k === 'build' ? () => () => ({ initialValues: {}, animations: {} }) : () => p),
    apply: () => p,
  });
  return p;
};
const createAnimatedComponent = (C) =>
  // eslint-disable-next-line react/display-name
  React.forwardRef(({ entering, exiting, layout, animatedProps, ...rest }, ref) =>
    React.createElement(C, { ...rest, ...(animatedProps || {}), ref }),
  );
const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  ScrollView: createAnimatedComponent(ScrollView),
  Image: createAnimatedComponent(Image),
  createAnimatedComponent,
};
const ease = () => (t) => t;
const Easing = new Proxy({ bezier: () => ease(), linear: (t) => t }, { get: (o, k) => o[k] || ease() });

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing,
  useSharedValue: (v) => {
    const r = React.useRef(null);
    if (!r.current) {
      const sv = { value: v, get: () => sv.value, set: (x) => (sv.value = typeof x === 'function' ? x(sv.value) : x) };
      r.current = sv;
    }
    return r.current;
  },
  useAnimatedStyle: (fn) => fn(),
  isSharedValue: (v) => !!v && typeof v === 'object' && 'value' in v,
  makeMutable: (v) => ({ value: v }),
  useEvent: () => () => {},
  useHandler: () => ({ context: {}, doDependenciesDiffer: false }),
  useAnimatedProps: (fn) => fn(),
  useDerivedValue: (fn) => ({ value: fn() }),
  useReducedMotion: () => true,
  withTiming: (v) => v,
  withSpring: (v) => v,
  withDelay: (_d, v) => v,
  withRepeat: (v) => v,
  withSequence: (...v) => v[v.length - 1],
  cancelAnimation: () => {},
  runOnJS: (f) => f,
  interpolate: (x) => x,
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  FadeIn: chain(),
  FadeOut: chain(),
  FadeInUp: chain(),
  FadeInDown: chain(),
  FadeInLeft: chain(),
  FadeInRight: chain(),
  SlideInRight: chain(),
  SlideInLeft: chain(),
};
