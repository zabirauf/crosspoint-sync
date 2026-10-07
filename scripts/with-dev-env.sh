#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
export PATH="$PROJECT_ROOT/node_modules/.bin:/opt/homebrew/bin:$PATH"
if [[ -d "$PROJECT_ROOT/.local/maestro/maestro/bin" ]]; then
  export PATH="$PROJECT_ROOT/.local/maestro/maestro/bin:$PATH"
fi
if [[ -d "$PROJECT_ROOT/.local/maestro-2.10/maestro/bin" ]]; then
  export PATH="$PROJECT_ROOT/.local/maestro-2.10/maestro/bin:$PATH"
fi

if [[ -z "${JAVA_HOME:-}" ]] && [[ -x /usr/libexec/java_home ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
  export JAVA_HOME
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  if [[ -d "$PROJECT_ROOT/.local/android-sdk" ]]; then
    export ANDROID_HOME="$PROJECT_ROOT/.local/android-sdk"
  elif [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  fi
fi

if [[ -n "${ANDROID_HOME:-}" ]]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
fi

if [[ -d "$PROJECT_ROOT/.local/platform-tools-36/platform-tools" ]]; then
  export PATH="$PROJECT_ROOT/.local/platform-tools-36/platform-tools:$PATH"
fi

export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJECT_ROOT/.local/gradle}"
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-$PROJECT_ROOT/.local/android-user}"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
export COCOAPODS_DISABLE_STATS=true

exec "$@"
