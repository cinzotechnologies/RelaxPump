module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^react-native-reanimated$': '<rootDir>/jest/reanimated.js' },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-firebase|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|zustand))',
  ],
};
