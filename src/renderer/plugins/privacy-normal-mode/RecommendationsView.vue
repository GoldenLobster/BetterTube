<template>
  <section class="pluginRecommendationsPage">
    <div
      v-if="!isElectron"
      class="pluginRecommendationsEmpty"
    >
      {{ electronOnlyMessage }}
    </div>

    <div
      v-else
      ref="webviewContainer"
      class="pluginRecommendationsWebviewContainer"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  pluginContext: {
    type: Object,
    required: true,
  },
})

const route = useRoute()
const router = useRouter()
const webviewContainer = useTemplateRef('webviewContainer')
const webviewRef = ref(null)
const resizeObserverRef = ref(null)
let pendingMountFrame = null
const isElectron = !!process.env.IS_ELECTRON
const electronOnlyMessage = 'Embedded recommendations require the Electron build.'

const webviewSrc = computed(() => {
  const isSignInFlow = route.query.signin === '1'
  return isSignInFlow
    ? props.pluginContext.authService.getSignInUrl()
    : props.pluginContext.authService.getRecommendationsUrl()
})

function parseVideoId(url) {
  try {
    const parsed = new URL(url)

    if (parsed.hostname === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\//, '').split('/')[0]
      return videoId || null
    }

    if (!parsed.hostname.includes('youtube.com')) {
      return null
    }

    const watchId = parsed.searchParams.get('v')
    if (watchId) {
      return watchId
    }

    if (parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/')[2] || null
    }

    return null
  } catch {
    return null
  }
}

function routeVideoIfNeeded(url, event) {
  const videoId = parseVideoId(url)
  if (!videoId) {
    return false
  }

  if (typeof event?.preventDefault === 'function') {
    event.preventDefault()
  }

  router.push(`/watch/${videoId}`)
  return true
}

function attachWebviewHandlers(webview) {
  function forceInternalIframeFill() {
    const shadowRoot = webview.shadowRoot
    if (!shadowRoot) {
      return
    }

    const iframe = shadowRoot.querySelector('iframe')
    if (!iframe) {
      return
    }

    iframe.style.height = '100%'
    iframe.style.minHeight = '100%'
    iframe.style.display = 'block'
    iframe.style.flex = '1 1 auto'
    iframe.style.alignSelf = 'stretch'

    const styleNode = shadowRoot.querySelector('style')
    if (styleNode && !styleNode.textContent.includes('height: 100%')) {
      styleNode.textContent += '\n:host { height: 100%; min-height: 100%; }\niframe { height: 100%; min-height: 100%; }\n'
    }
  }

  function resetGuestZoomAndViewport() {
    try {
      if (typeof webview.setZoomLevel === 'function') {
        webview.setZoomLevel(0)
      }
      if (typeof webview.setZoomFactor === 'function') {
        webview.setZoomFactor(1)
      }
    } catch {
      // Ignore zoom-reset failures and keep rendering.
    }

    webview.executeJavaScript(`
      document.documentElement.style.zoom = '1';
      document.body.style.zoom = '1';
      document.documentElement.style.height = '100%';
      document.body.style.minHeight = '100%';
      document.body.style.margin = '0';
    `, true).catch(() => {})
  }

  webview.addEventListener('dom-ready', () => {
    forceInternalIframeFill()
    resetGuestZoomAndViewport()
    syncWebviewSize()

    // Electron may recreate/update the internal iframe after load milestones.
    window.setTimeout(forceInternalIframeFill, 50)
    window.setTimeout(forceInternalIframeFill, 250)
  })

  webview.addEventListener('did-stop-loading', () => {
    forceInternalIframeFill()
    resetGuestZoomAndViewport()
    syncWebviewSize()
  })

  webview.addEventListener('did-navigate', (event) => {
    if (String(event.url).includes('youtube.com/')) {
      props.pluginContext.authService.markSignedIn()
    }
  })

  webview.addEventListener('did-fail-load', () => {})

  webview.addEventListener('did-navigate-in-page', (event) => {
    routeVideoIfNeeded(event.url, event)
  })

  webview.addEventListener('will-navigate', (event) => {
    routeVideoIfNeeded(event.url, event)
  })

  webview.addEventListener('new-window', (event) => {
    routeVideoIfNeeded(event.url, event)
  })
}

function syncWebviewSize() {
  if (!webviewRef.value || !webviewContainer.value) {
    return
  }

  const nextRect = webviewContainer.value.getBoundingClientRect()
  const webview = webviewRef.value
  const nextWidth = Math.max(1, Math.floor(nextRect.width))
  const height = Math.max(1, Math.floor(nextRect.height))

  webview.style.width = `${nextWidth}px`
  webview.style.height = `${height}px`

  // Keep guest view bounds pinned to the host panel dimensions.
  webview.setAttribute('minwidth', String(nextWidth))
  webview.setAttribute('maxwidth', String(nextWidth))
  webview.setAttribute('minheight', String(height))
  webview.setAttribute('maxheight', String(height))

  if (webview.shadowRoot) {
    const iframe = webview.shadowRoot.querySelector('iframe')
    if (iframe) {
      iframe.style.height = `${height}px`
      iframe.style.minHeight = `${height}px`
    }
  }
}

function createWebviewIfNeeded() {
  if (!isElectron || !webviewContainer.value || webviewRef.value) {
    return
  }

  const webview = document.createElement('webview')
  webview.className = 'pluginRecommendationsWebview'
  webview.setAttribute('partition', props.pluginContext.authService.getWebviewPartition())
  webview.setAttribute('src', webviewSrc.value)
  webview.setAttribute('autosize', 'on')

  webview.style.position = 'absolute'
  webview.style.top = '0'
  webview.style.left = '0'
  webview.style.right = '0'
  webview.style.bottom = '0'
  webview.style.width = '100%'
  webview.style.height = '100%'
  webview.style.display = 'block'

  attachWebviewHandlers(webview)

  webviewContainer.value.innerHTML = ''
  webviewContainer.value.appendChild(webview)
  webviewRef.value = webview

  syncWebviewSize()
}

function mountWebviewWhenContainerReady(triesLeft = 90) {
  if (!isElectron || !webviewContainer.value || webviewRef.value) {
    pendingMountFrame = null
    return
  }

  const rect = webviewContainer.value.getBoundingClientRect()
  if (rect.height >= 280 || triesLeft <= 0) {
    pendingMountFrame = null
    createWebviewIfNeeded()
    syncWebviewSize()

    // If the guest was initialized during a transitional tiny layout, recreate once.
    window.setTimeout(() => {
      if (!webviewRef.value || !webviewContainer.value) {
        return
      }

      const containerRect = webviewContainer.value.getBoundingClientRect()
      const webviewRect = webviewRef.value.getBoundingClientRect()
      const containerHeight = Math.floor(containerRect.height)
      const webviewHeight = Math.floor(webviewRect.height)

      if (containerHeight >= 280 && webviewHeight > 0 && webviewHeight < containerHeight * 0.35) {
        const currentSrc = webviewRef.value.getURL() || webviewSrc.value
        webviewRef.value.remove()
        webviewRef.value = null
        createWebviewIfNeeded()

        if (webviewRef.value && webviewRef.value.getURL() !== currentSrc) {
          webviewRef.value.src = currentSrc
        }

        syncWebviewSize()
      }
    }, 450)

    return
  }

  pendingMountFrame = window.requestAnimationFrame(() => {
    mountWebviewWhenContainerReady(triesLeft - 1)
  })
}

onMounted(() => {
  if (!isElectron || !webviewContainer.value) {
    return
  }

  mountWebviewWhenContainerReady()

  const observer = new ResizeObserver(() => {
    syncWebviewSize()
  })
  observer.observe(webviewContainer.value)
  resizeObserverRef.value = observer

  window.addEventListener('resize', syncWebviewSize)
})

watch(webviewSrc, (nextSrc) => {
  mountWebviewWhenContainerReady()

  if (!webviewRef.value) {
    return
  }

  if (webviewRef.value.getURL() === nextSrc) {
    return
  }

  webviewRef.value.src = nextSrc
})

onBeforeUnmount(() => {
  if (pendingMountFrame !== null) {
    window.cancelAnimationFrame(pendingMountFrame)
    pendingMountFrame = null
  }

  resizeObserverRef.value?.disconnect()
  resizeObserverRef.value = null

  window.removeEventListener('resize', syncWebviewSize)

  if (webviewRef.value) {
    webviewRef.value.remove()
    webviewRef.value = null
  }
})
</script>

<style scoped>
.pluginRecommendationsPage {
  padding: 0;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  box-sizing: border-box;
  height: 100%;
  min-height: calc(100vh - 96px);
}

.pluginRecommendationsEmpty {
  border: 1px dashed var(--text-with-main-color);
  border-radius: 12px;
  padding: 18px;
  opacity: 0.9;
}
.pluginRecommendationsWebviewContainer {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  border-radius: 0;
  border: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.pluginRecommendationsWebview {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 1015px) {
  .pluginRecommendationsPage {
    min-height: calc(100vh - 76px);
  }
}
</style>
