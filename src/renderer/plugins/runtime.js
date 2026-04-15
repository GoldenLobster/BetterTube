const DEFAULT_ORDER = 100

function normalizeTabConfig(tabConfig) {
  return {
    id: tabConfig.id,
    title: tabConfig.title,
    to: tabConfig.to,
    order: tabConfig.order ?? DEFAULT_ORDER,
    isVisible: typeof tabConfig.isVisible === 'function' ? tabConfig.isVisible : () => true,
  }
}

function matchesComponentName(instance, targetName) {
  const options = instance?.$options ?? {}
  const candidateNames = [options.name, options.__name].filter(Boolean)
  return candidateNames.includes(targetName)
}

export function createPluginRuntime({ app, router, store }) {
  const plugins = []
  const hooks = {
    onAppMounted: [],
    onRouteChange: [],
  }

  const componentExtensions = []
  const extensionCleanups = new WeakMap()

  const navigationTabs = []
  const sideNavHosts = new Map()
  let modeChangeListenerBound = false

  function ensureSideNavStyles() {
    if (document.getElementById('plugin-side-nav-styles')) {
      return
    }

    const style = document.createElement('style')
    style.id = 'plugin-side-nav-styles'
    style.textContent = `
      .plugin-side-nav-host {
        display: contents;
      }

      .plugin-side-nav-badge {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: inline-grid;
        place-items: center;
        font-size: 0.72rem;
        font-weight: 700;
        background: color-mix(in srgb, var(--accent-color, #ff4e45) 82%, #fff 18%);
        color: var(--text-with-main-color, #fff);
      }
    `

    document.head.appendChild(style)
  }

  function getContext() {
    return {
      app,
      router,
      store,
      route: router.currentRoute.value,
    }
  }

  function renderNavigationTabs() {
    const context = getContext()

    const visibleTabs = navigationTabs
      .filter(tab => {
        try {
          return tab.isVisible(context)
        } catch {
          return false
        }
      })
      .sort((a, b) => a.order - b.order)

    for (const host of sideNavHosts.values()) {
      host.innerHTML = ''

      if (visibleTabs.length === 0) {
        host.style.display = 'none'
        continue
      }

      host.style.display = ''

      for (const tab of visibleTabs) {
        const link = document.createElement('a')
        link.href = `#${tab.to}`
        link.className = 'navOption mobileHidden plugin-side-nav-link'
        link.setAttribute('role', 'button')
        link.setAttribute('title', tab.title)

        if (context.route.path === tab.to) {
          link.classList.add('router-link-active')
          link.setAttribute('aria-current', 'page')
        }

        const thumb = document.createElement('div')
        thumb.className = 'thumbnailContainer'

        const badge = document.createElement('span')
        badge.className = 'plugin-side-nav-badge'
        badge.textContent = tab.title.slice(0, 1).toUpperCase()

        const label = document.createElement('p')
        label.className = 'navLabel'
        label.textContent = tab.title

        thumb.appendChild(badge)
        link.appendChild(thumb)
        link.appendChild(label)

        link.addEventListener('click', (event) => {
          event.preventDefault()
          if (router.currentRoute.value.path !== tab.to) {
            router.push(tab.to)
          }
        })

        host.appendChild(link)
      }
    }
  }

  function createPluginApi(pluginName) {
    return {
      app,
      router,
      store,
      onAppMounted(handler) {
        hooks.onAppMounted.push({ pluginName, handler })
      },
      onRouteChange(handler) {
        hooks.onRouteChange.push({ pluginName, handler })
      },
      extendComponent(name, extensionFn) {
        componentExtensions.push({ pluginName, name, extensionFn })
      },
      addNavigationTab(tabConfig) {
        if (!tabConfig?.id || !tabConfig?.title || !tabConfig?.to) {
          return
        }

        const normalized = normalizeTabConfig(tabConfig)
        navigationTabs.push(normalized)
        renderNavigationTabs()
      },
      getContext,
    }
  }

  function setupComponentExtensionBridge() {
    app.mixin({
      mounted() {
        if (matchesComponentName(this, 'SideNav')) {
          const root = this.$el
          const inner = root?.querySelector?.('.inner')

          if (inner) {
            const existingHost = Array.from(inner.children).find((child) => {
              return child.classList?.contains('plugin-side-nav-host')
            })

            if (existingHost) {
              sideNavHosts.set(this, existingHost)
              renderNavigationTabs()
              return
            }

            const firstDivider = Array.from(inner.children).find((child) => {
              return child.tagName === 'HR'
            })

            const host = document.createElement('div')
            host.className = 'plugin-side-nav-host'

            if (firstDivider) {
              inner.insertBefore(host, firstDivider)
            } else {
              inner.appendChild(host)
            }

            sideNavHosts.set(this, host)
            renderNavigationTabs()
          }
        }

        const matchedExtensions = componentExtensions.filter(({ name }) => {
          return matchesComponentName(this, name)
        })

        if (matchedExtensions.length === 0) {
          return
        }

        const cleanups = []

        for (const extension of matchedExtensions) {
          try {
            const maybeCleanup = extension.extensionFn({
              instance: this,
              element: this.$el,
              ...getContext(),
            })

            if (typeof maybeCleanup === 'function') {
              cleanups.push(maybeCleanup)
            }
          } catch (error) {
            console.error(`[plugin-runtime] Failed to extend component in plugin "${extension.pluginName}"`, error)
          }
        }

        if (cleanups.length > 0) {
          extensionCleanups.set(this, cleanups)
        }
      },
      beforeUnmount() {
        const navHost = sideNavHosts.get(this)
        if (navHost) {
          navHost.remove()
          sideNavHosts.delete(this)
        }

        const cleanups = extensionCleanups.get(this)
        if (!cleanups) {
          return
        }

        for (const cleanup of cleanups) {
          try {
            cleanup()
          } catch {
            // no-op cleanup failures
          }
        }

        extensionCleanups.delete(this)
      }
    })
  }

  function runHookEntries(entries, ...args) {
    for (const { pluginName, handler } of entries) {
      try {
        handler(...args)
      } catch (error) {
        console.error(`[plugin-runtime] Hook failed in plugin "${pluginName}"`, error)
      }
    }
  }

  async function registerPlugin(pluginModule) {
    if (!pluginModule || typeof pluginModule.setup !== 'function') {
      return
    }

    const pluginName = pluginModule.name ?? 'anonymous-plugin'
    const api = createPluginApi(pluginName)

    try {
      await pluginModule.setup(api)
      plugins.push(pluginName)
    } catch (error) {
      console.error(`[plugin-runtime] Failed to initialize plugin "${pluginName}"`, error)
    }
  }

  function initializeRouteHook() {
    router.afterEach((to, from) => {
      runHookEntries(hooks.onRouteChange, { to, from, ...getContext() })
      renderNavigationTabs()
    })
  }

  return {
    setupComponentExtensionBridge,
    initializeRouteHook,
    registerPlugin,
    onAppMounted() {
      ensureSideNavStyles()

      if (!modeChangeListenerBound) {
        window.addEventListener('ft-plugin-mode-change', () => {
          renderNavigationTabs()
        })
        modeChangeListenerBound = true
      }

      renderNavigationTabs()
      runHookEntries(hooks.onAppMounted, getContext())
    },
    getLoadedPlugins() {
      return [...plugins]
    }
  }
}
