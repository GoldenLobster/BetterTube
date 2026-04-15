import './modern-theme.css'

const THEME_STORAGE_KEY = 'ft.plugin.modernTheme.variant'
const SETTINGS_SECTION_ID = 'plugin-theme-settings'

function loadThemeVariant() {
  return localStorage.getItem(THEME_STORAGE_KEY) === 'youtube-modern'
    ? 'youtube-modern'
    : 'stock'
}

function saveThemeVariant(variant) {
  localStorage.setItem(THEME_STORAGE_KEY, variant)
  window.dispatchEvent(new CustomEvent('ft-plugin-theme-change', { detail: { variant } }))
}

function applyThemeVariant() {
  const variant = loadThemeVariant()
  document.body.classList.toggle('plugin-theme-youtube-modern', variant === 'youtube-modern')
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
  heading.textContent = 'Plugin: Modern Theme'

  const row = document.createElement('div')
  row.className = 'plugin-settings-mode-row'
  row.dataset.role = 'theme-row'

  const helper = document.createElement('p')
  helper.className = 'plugin-settings-subline'
  helper.dataset.role = 'theme-status'

  section.appendChild(heading)
  section.appendChild(row)
  section.appendChild(helper)

  rootElement.querySelector('.settingsSections')?.prepend(section)

  return section
}

function renderSettingsSection(section) {
  const row = section.querySelector('[data-role="theme-row"]')
  const helper = section.querySelector('[data-role="theme-status"]')

  if (!row || !helper) {
    return
  }

  const activeVariant = loadThemeVariant()
  row.innerHTML = ''

  const stockButton = createButton('Stock Theme', () => {
    saveThemeVariant('stock')
    renderSettingsSection(section)
  }, activeVariant === 'stock')

  const youtubeButton = createButton('YouTube-like Theme', () => {
    saveThemeVariant('youtube-modern')
    renderSettingsSection(section)
  }, activeVariant === 'youtube-modern')

  row.appendChild(stockButton)
  row.appendChild(youtubeButton)

  helper.textContent = activeVariant === 'youtube-modern'
    ? 'Modern theme active'
    : 'Stock FreeTube theme active'
}

function setupSettingsInjection(element) {
  let disposed = false
  let sectionReady = false
  let observer

  const upsertSection = () => {
    if (disposed || sectionReady) {
      return
    }

    const section = ensureSettingsContainer(element)
    if (!section) {
      return
    }

    sectionReady = true
    observer?.disconnect()
    renderSettingsSection(section)
  }

  upsertSection()

  if (!sectionReady) {
    observer = new MutationObserver(() => {
      upsertSection()
    })

    observer.observe(element, {
      childList: true,
      subtree: true,
    })
  }

  const listener = () => {
    applyThemeVariant()
    upsertSection()
  }

  window.addEventListener('ft-plugin-theme-change', listener)

  return () => {
    disposed = true
    observer?.disconnect()
    window.removeEventListener('ft-plugin-theme-change', listener)
  }
}

export default {
  name: 'modern-theme',
  setup({ extendComponent, onAppMounted, onRouteChange }) {
    onAppMounted(() => {
      applyThemeVariant()
    })

    onRouteChange(() => {
      applyThemeVariant()
    })

    extendComponent('Settings', ({ element }) => {
      return setupSettingsInjection(element)
    })
  },
}
