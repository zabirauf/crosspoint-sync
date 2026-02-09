import { defaultConfig } from '@tamagui/config/v5'
import { animations } from '@tamagui/config/v5-rn'
import { createTamagui } from 'tamagui'

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
