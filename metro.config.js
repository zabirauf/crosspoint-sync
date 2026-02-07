const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

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
