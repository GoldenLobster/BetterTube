export class RecommendationsService {
  async fetchRecommendations({ authSession, limit = 24 }) {
    if (!authSession) {
      return {
        videos: [],
        source: 'none',
      }
    }

    if (authSession.accessToken) {
      const apiVideos = await this.fetchFromGoogleApi(authSession.accessToken, limit)
      if (apiVideos.length > 0) {
        return {
          videos: apiVideos,
          source: 'google-api',
        }
      }
    }

    return {
      videos: this.buildFallbackRecommendations(authSession.displayName, limit),
      source: 'fallback',
    }
  }

  async fetchFromGoogleApi(accessToken, limit) {
    try {
      const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos')
      endpoint.searchParams.set('part', 'snippet,contentDetails,statistics')
      endpoint.searchParams.set('myRating', 'like')
      endpoint.searchParams.set('maxResults', String(Math.min(limit, 50)))

      const response = await fetch(endpoint.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        return []
      }

      const payload = await response.json()
      const items = Array.isArray(payload?.items) ? payload.items : []

      return items.map(item => {
        const videoId = item?.id
        const snippet = item?.snippet ?? {}

        return {
          id: videoId,
          title: snippet.title ?? 'Untitled video',
          channelTitle: snippet.channelTitle ?? 'Unknown channel',
          thumbnail: snippet?.thumbnails?.medium?.url ?? snippet?.thumbnails?.default?.url ?? '',
          link: `/watch/${videoId}`,
        }
      }).filter(video => typeof video.id === 'string' && video.id !== '')
    } catch {
      return []
    }
  }

  buildFallbackRecommendations(displayName, limit) {
    const capped = Math.max(1, Math.min(24, limit))

    return Array.from({ length: capped }, (_, index) => {
      const order = index + 1

      return {
        id: `fallback-${order}`,
        title: `Recommended pick #${order}`,
        channelTitle: `Generated for ${displayName}`,
        thumbnail: '',
        link: '/subscriptions',
      }
    })
  }
}
