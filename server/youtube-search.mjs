const searchUrl = 'https://www.googleapis.com/youtube/v3/search';

export class YouTubeSearchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalize(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function plainText(value) {
  const entities = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>' };
  return value.replace(/&(?:amp|quot|#39|#x27|lt|gt);/g, entity => entities[entity]);
}

function isStrongMatch(video, title, artist) {
  const normalizedArtist = normalize(artist);
  const channel = normalize(video.channel);
  if (![normalizedArtist, `${normalizedArtist} topic`, `${normalizedArtist} vevo`, `${normalizedArtist}vevo`].includes(channel)) return false;

  const videoTitle = normalize(video.title.replace(/\s*[[(](?:official (?:music )?video|official audio|audio|music video)[\])]/gi, ''));
  const songTitle = normalize(title);
  return [songTitle, `${normalizedArtist} ${songTitle}`, `${songTitle} ${normalizedArtist}`].includes(videoTitle);
}

export async function searchYouTubeVideos(title, artist) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new YouTubeSearchError(503, 'YouTube lookup is unavailable. You can enter a URL manually.');

  const url = new URL(searchUrl);
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '5',
    q: `${artist} ${title}`
  });
  const response = await fetch(url, {
    headers: { 'X-Goog-Api-Key': key },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    if (response.status === 429 || error?.errors?.some(item => ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(item.reason))) {
      throw new YouTubeSearchError(429, 'YouTube search has reached its limit. You can enter a URL manually.');
    }
    throw new YouTubeSearchError(502, 'YouTube lookup failed. You can enter a URL manually.');
  }

  const { items } = await response.json();
  const videos = items.filter(item => /^[\w-]{11}$/.test(item.id?.videoId ?? '')).map(item => ({
    title: plainText(item.snippet.title),
    channel: plainText(item.snippet.channelTitle),
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`
  }));
  const strongMatches = videos.filter(video => isStrongMatch(video, title, artist));
  return { videos, suggestedUrl: strongMatches.length === 1 ? strongMatches[0].url : null };
}
