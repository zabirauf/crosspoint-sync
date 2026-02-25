Deploy a release build of CrossPoint Sync to a connected Android device. Optional arguments: $ARGUMENTS

## What This Command Does

Build a signed release AAB using EAS (local build), convert it to a universal APK via bundletool, and install it on a USB-connected Android device via adb.

## Step 0: Check Prerequisites

Verify all required tools are installed. For any missing tool, install it before proceeding.

### 0a. adb (Android Debug Bridge)

```bash
adb version
```

If missing: `brew install android-platform-tools`

### 0b. eas-cli

```bash
npx eas --version
```

If missing or below v16: `npm install -g eas-cli`

### 0c. bundletool

```bash
bundletool version
```

If missing: `brew install bundletool`

### 0d. keytool (Java)

```bash
keytool 2>&1 | head -1
```

If missing: install a JDK — `brew install openjdk` and follow the symlink instructions.

### 0e. Android debug keystore

```bash
test -f ~/.android/debug.keystore && echo "exists" || echo "missing"
```

If missing, create it:
```bash
mkdir -p ~/.android
keytool -genkey -v \
  -keystore ~/.android/debug.keystore \
  -storepass android \
  -alias androiddebugkey \
  -keypass android \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Android Debug,O=Android,C=US"
```

### 0f. Connected device

```bash
adb devices
```

Verify at least one device shows as `device` (not `unauthorized` or `offline`). If `unauthorized`, tell the user to check the "Allow USB debugging" prompt on the device. If no devices listed, tell the user to connect via USB with USB debugging enabled.

Save the device serial (e.g., `29241FDH2004J2`) for later steps.

## Step 1: Build Release AAB

Run an EAS local production build. This uses the `production` profile from `eas.json`, which auto-increments `versionCode` and signs with the EAS-managed keystore.

```bash
npx eas build --platform android --profile production --local
```

**Important**: This command takes 10-20 minutes. Run it with `timeout: 600000` and `run_in_background: true`. Wait for it to complete.

The build output will end with a line like:
```
You can find the build artifacts in /path/to/build-XXXXXXXXX.aab
```

Capture the `.aab` path from the output. If the user provided `$ARGUMENTS` containing `--profile <name>`, use that profile instead of `production`.

### Build failure: expo doctor

If the build fails on the `RUN_EXPO_DOCTOR` step due to `react-native-udp` or local modules being flagged as unmaintained/unknown, this is a known non-blocking issue. The EAS local builder treats `expo doctor` exit code 1 as fatal. Workaround: the build usually continues past this — check the full output for `BUILD SUCCESSFUL`.

## Step 2: Convert AAB to Universal APK

Use bundletool to create a universal APK signed with the debug keystore:

```bash
bundletool build-apks \
  --bundle=<path-to-aab> \
  --output=<path-to-aab-without-extension>.apks \
  --mode=universal \
  --ks=$HOME/.android/debug.keystore \
  --ks-pass=pass:android \
  --ks-key-alias=androiddebugkey \
  --key-pass=pass:android
```

Then extract the universal APK:

```bash
unzip -o <path>.apks -d build-apks-extracted
```

The APK will be at `build-apks-extracted/universal.apk`.

**Note**: The debug keystore signature differs from the EAS production keystore. If a production-signed version is already installed on the device, it must be uninstalled first (Step 3 handles this).

## Step 3: Install on Device

First uninstall any existing version (different signature will block install), then install the new APK:

```bash
adb -s <device-serial> uninstall com.crosspointsync.app 2>&1 || true
adb -s <device-serial> install build-apks-extracted/universal.apk
```

The uninstall may fail with `DELETE_FAILED_INTERNAL_ERROR` if no prior version exists — that's fine, ignore it.

Verify the install output says `Success`.

## Step 4: Launch the App

```bash
adb -s <device-serial> shell am start -n com.crosspointsync.app/.MainActivity
```

## Step 5: Cleanup

Remove intermediate build artifacts but keep the AAB:

```bash
rm -rf build-apks-extracted *.apks
```

Report to the user:
- AAB path and size
- versionCode used
- Device serial it was installed on
- That the app has been launched

## Rules

- Always check prerequisites before building. On a fresh machine, several tools may be missing.
- Never skip the uninstall step — signature mismatches cause cryptic install failures.
- The `.aab` file is gitignored. Don't commit it.
- If `$ARGUMENTS` contains "setup-only" or "setup", stop after Step 0 — just ensure all tools are installed and a device is connected.
- If `$ARGUMENTS` contains "install-only" and there's already a `.aab` file in the project root, skip the build and go straight to Step 2.
- If multiple devices are connected, ask the user which one to target.
- The EAS build auto-increments versionCode via the `production` profile's `autoIncrement: true` setting. This modifies the remote EAS version — no local file changes needed.
