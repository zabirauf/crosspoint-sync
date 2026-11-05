module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { web: { unstable_transformImportMeta: true } }]],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
          disableExtraction: true,
        },
      ],
      'react-native-reanimated/plugin',
    ],
  }
}
