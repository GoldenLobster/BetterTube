import RecommendationsView from './RecommendationsView.vue'
import { GoogleAuthService } from './google-auth-service'
import './privacy-normal-mode.css'

const MODE_STORAGE_KEY = 'ft.plugin.privacyNormalMode.mode'
const SETTINGS_SECTION_ID = 'plugin-privacy-normal-settings'

function loadMode() {
  const value = localStorage.getItem(MODE_STORAGE_KEY)
  return value === 'normal' ? 'normal' : 'privacy'
}

function saveMode(mode) {
  localStorage.setItem(MODE_STORAGE_KEY, mode)
  window.dispatchEvent(new CustomEvent('ft-plugin-mode-change', { detail: { mode } }))
}

function createButton(label, onClick, isActive = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'plugin-settings-button'
  if (isActive) {
    button.classList.add('is-active')
  }
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function ensureSettingsContainer(rootElement) {
  if (!rootElement) {
    return null
  }

  let section = rootElement.querySelector(`#${SETTINGS_SECTION_ID}`)
  if (section) {
    return section
  }

  section = document.createElement('section')
  section.id = SETTINGS_SECTION_ID
  section.className = 'plugin-settings-section'

  const heading = document.createElement('h3')
  heading.textContent = 'Plugin: Privacy vs Normal Mode'

  const modeRow = document.createElement('div')
  modeRow.className = 'plugin-settings-mode-row'
  modeRow.dataset.role = 'mode-row'

  const authRow = document.createElement('div')
  authRow.className = 'plugin-settings-mode-row'
  authRow.dataset.role = 'auth-row'

  const status = document.createElement('p')
  status.className = 'plugin-settings-subline'
  status.dataset.role = 'status'

  section.appendChild(heading)
  section.appendChild(modeRow)
  section.appendChild(authRow)
  section.appendChild(status)

  rootElement.querySelector('.settingsSections')?.prepend(section)

  return section
}

async function renderSettingsSection(section, { authService, router }) {
  const modeRow = section.querySelector('[data-role="mode-row"]')
  const authRow = section.querySelector('[data-role="auth-row"]')
  const status = section.querySelector('[data-role="status"]')

  if (!modeRow || !authRow || !status) {
    return
  }

  const mode = loadMode()
  const isSignedIn = authService.isSignedIn()

  modeRow.innerHTML = ''
  authRow.innerHTML = ''

  const privacyButton = createButton('Privacy Mode', () => {
    saveMode('privacy')
    renderSettingsSection(section, { authService, router })
  }, mode === 'privacy')

  const normalButton = createButton('Normal Mode', () => {
    saveMode('normal')
    renderSettingsSection(section, { authService, router })
  }, mode === 'normal')

  modeRow.appendChild(privacyButton)
  modeRow.appendChild(normalButton)

  const signInButton = createButton('Sign In (Embedded WebView)', async () => {
    saveMode('normal')
    authService.signIn()
    await router.push('/recommendations?signin=1')
    await renderSettingsSection(section, { authService, router })
  })

  const signOutButton = createButton('Sign Out', async () => {
    authService.signOut()
    await renderSettingsSection(section, { authService, router })
  })

  const openRecommendationsButton = createButton('Open Recommendations', async () => {
    saveMode('normal')
    await router.push('/recommendations')
  })

  authRow.appendChild(signInButton)
  authRow.appendChild(openRecommendationsButton)
  authRow.appendChild(signOutButton)

  const signedInText = isSignedIn
    ? 'Embedded YouTube session is active.'
    : 'No embedded sign-in has been confirmed yet.'

  status.textContent = `Current mode: ${mode}. ${signedInText}`
}

function setupSettingsInjection({ element, authService, router }) {
  let disposed = false
  let sectionReady = false
  let currentSection = null
  let observer

  const upsertSection = async () => {
    if (disposed || sectionReady) {
      return
    }

    const section = ensureSettingsContainer(element)
    if (!section) {
      return
    }

    currentSection = section
    sectionReady = true
    observer?.disconnect()
    await renderSettingsSection(section, { authService, router })
  }

  const initObserver = () => {
    observer = new MutationObserver(() => {
      upsertSection()
    })

    observer.observe(element, {
      childList: true,
      subtree: true,
    })
  }

  // Attempt immediately and observe only until the settings container exists.
  upsertSection()
  if (!sectionReady) {
    initObserver()
  }

  const modeChangeListener = () => {
    if (currentSection) {
      renderSettingsSection(currentSection, { authService, router })
      return
    }

    upsertSection()
  }

  window.addEventListener('ft-plugin-mode-change', modeChangeListener)

  return () => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('ft-plugin-mode-change', modeChangeListener)
  }
}

export default {
  name: 'privacy-normal-mode',
  setup({ router, onRouteChange, extendComponent, addNavigationTab }) {
    const authService = new GoogleAuthService()

    const pluginContext = {
      authService,
      getMode: loadMode,
      setMode: saveMode,
    }

    router.addRoute({
      path: '/recommendations',
      name: 'pluginRecommendations',
      meta: {
        title: 'Recommendations',
      },
      component: RecommendationsView,
      props: {
        pluginContext,
      },
    })

    addNavigationTab({
      id: 'plugin-recommendations',
      title: 'Recommendations',
      to: '/recommendations',
      order: 30,
      isVisible: () => loadMode() === 'normal',
    })

    onRouteChange(({ to, router: appRouter }) => {
      if (to.path === '/recommendations' && loadMode() !== 'normal') {
        appRouter.replace('/subscriptions')
      }
    })

    extendComponent('Settings', ({ element }) => {
      return setupSettingsInjection({
        element,
        authService,
        router,
      })
    })
  },
}
