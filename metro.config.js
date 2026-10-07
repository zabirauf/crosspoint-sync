const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Native toolchains and build caches are not JavaScript source files.
const localToolsPath = require('path').resolve(__dirname, '.local')
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const existingBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  new RegExp(`^${localToolsPath}/.*`),
]

// Use Metro's file watcher by default; Watchman can stall on this machine.
// Opt in with CROSSPOINT_USE_WATCHMAN=1 when Watchman is configured.
config.resolver.useWatchman = process.env.CROSSPOINT_USE_WATCHMAN === '1'

// Tamagui Metro resolver workaround:
// Ensures Metro loads .native.js files instead of .mjs for Tamagui packages on native platforms
const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform)
    }
    return context.resolveRequest(context, moduleName, platform)
  }

  const isTamagui =
    moduleName === 'tamagui' ||
    moduleName.startsWith('tamagui/') ||
    moduleName.startsWith('@tamagui/')

  if (isTamagui) {
    return context.resolveRequest(
      {
        ...context,
        unstable_conditionNames: ['react-native', 'require', 'default'],
      },
      moduleName,
      platform
    )
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
