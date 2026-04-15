const SIGNED_IN_STORAGE_KEY = 'ft.plugin.privacyNormalMode.webviewSignedIn'
const WEBVIEW_PARTITION = 'persist:ft-plugin-youtube'

const YOUTUBE_HOME_URL = 'https://www.youtube.com/'
const YOUTUBE_SIGNIN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'

export class GoogleAuthService {
  getWebviewPartition() {
    return WEBVIEW_PARTITION
  }

  getRecommendationsUrl() {
    return YOUTUBE_HOME_URL
  }

  getSignInUrl() {
    return YOUTUBE_SIGNIN_URL
  }

  isSignedIn() {
    return localStorage.getItem(SIGNED_IN_STORAGE_KEY) === '1'
  }

  markSignedIn() {
    localStorage.setItem(SIGNED_IN_STORAGE_KEY, '1')
  }

  signIn() {
    this.markSignedIn()
    return {
      signedInAt: Date.now(),
      type: 'webview',
    }
  }

  signOut() {
    localStorage.removeItem(SIGNED_IN_STORAGE_KEY)
  }
}
