#!/usr/bin/env bash
set -euo pipefail

FORMAT="${1:-apk}"
case "$FORMAT" in
  apk) TASK=assembleRelease; ARTIFACT=apk/release/app-release.apk ;;
  aab) TASK=bundleRelease; ARTIFACT=bundle/release/app-release.aab ;;
  *) echo "Usage: $0 [apk|aab]" >&2; exit 1 ;;
esac

if [[ ! -d "${ANDROID_HOME:-}" ]]; then
  echo "Android SDK missing. Set ANDROID_HOME or install it in .local/android-sdk." >&2
  exit 1
fi

if [[ ! -f android/gradlew ]]; then
  npx expo prebuild --platform android --no-install
fi
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties

# Expo's generated release build uses the development key by default.
# Configure a private upload key before using an AAB with Google Play.
(cd android && ./gradlew "$TASK" --no-daemon --max-workers=4)

VERSION="$(node -p "require('./app.json').expo.version")"
mkdir -p builds
OUTPUT="builds/crosspoint-sync-${VERSION}.${FORMAT}"
cp "android/app/build/outputs/$ARTIFACT" "$OUTPUT"
echo "Android build: $PWD/$OUTPUT"
