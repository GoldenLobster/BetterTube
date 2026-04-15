import { createPluginRuntime } from './runtime'
import privacyNormalModePlugin from './privacy-normal-mode'
import modernThemePlugin from './modern-theme'

const pluginModules = [
  privacyNormalModePlugin,
  modernThemePlugin,
]

export async function initializePlugins({ app, router, store }) {
  const runtime = createPluginRuntime({ app, router, store })

  runtime.setupComponentExtensionBridge()
  runtime.initializeRouteHook()

  for (const pluginModule of pluginModules) {
    await runtime.registerPlugin(pluginModule)
  }

  return runtime
}
