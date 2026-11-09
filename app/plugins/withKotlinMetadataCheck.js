// Firebase Android BoM 35 (firebase-auth 25) ships Kotlin 2.4 metadata, but React Native 0.88 /
// Expo 58 compile with Kotlin 2.2, which reads metadata up to 2.3 only:
//   "Module was compiled with an incompatible version of Kotlin. The binary version of its
//    metadata is 2.4.0, expected version is 2.2.0." (:react-native-firebase_auth:compileReleaseKotlin)
// Raising Kotlin would also move KSP (expo-image, expo-updates, async-storage), so instead every
// Kotlin compile skips the metadata version check. Remove once Expo moves to Kotlin ≥ 2.3.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARK = '// relaxpump: skip Kotlin metadata version check';
const BLOCK = `
${MARK}
allprojects {
  tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
  }
}
`;

module.exports = function withKotlinMetadataCheck(config) {
  return withProjectBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy')
      throw new Error('withKotlinMetadataCheck: expected Groovy build.gradle');
    if (!c.modResults.contents.includes(MARK)) c.modResults.contents += BLOCK;
    return c;
  });
};
