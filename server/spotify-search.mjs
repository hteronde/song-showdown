const tokenUrl = 'https://accounts.spotify.com/api/token';
const searchUrl = 'https://api.spotify.com/v1/search';
let cachedToken;
let pendingToken;

export class SpotifySearchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function checkResponse(response) {
  if (response.status === 429) {
    throw new SpotifySearchError(429, 'Spotify is limiting searches. Wait a moment and try again.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpotifySearchError(502, 'Spotify denied access. Check the app credentials and Web API access.');
  }
  if (!response.ok) {
    throw new SpotifySearchError(502, 'Spotify could not complete the request. Please try again.');
  }
}

async function requestToken() {
  const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) {
    throw new SpotifySearchError(503, 'Spotify credentials are missing from the server configuration.');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(5000)
  });
  checkResponse(response);
  const { access_token: value, expires_in: expiresIn } = await response.json();
  if (!value || !(expiresIn > 0)) {
    throw new SpotifySearchError(502, 'Spotify returned an invalid access token.');
  }
  cachedToken = { value, expiresAt: Date.now() + (expiresIn - 30) * 1000 };
  return value;
}

function getToken() {
  if (cachedToken?.expiresAt > Date.now()) return cachedToken.value;
  pendingToken ??= requestToken().finally(() => { pendingToken = undefined; });
  return pendingToken;
}

export async function searchSpotifyTracks(query) {
  const url = new URL(searchUrl);
  url.search = new URLSearchParams({ q: query, type: 'track', market: 'US', limit: '10' });
  const token = await getToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000)
  });
  if (response.status === 401 && cachedToken?.value === token) cachedToken = undefined;
  checkResponse(response);

  const { tracks } = await response.json();
  return tracks.items.filter(track => track?.id).map(track => ({
    spotifyTrackId: track.id,
    title: track.name,
    artist: track.artists.map(artist => artist.name).join(', '),
    album: track.album.name,
    year: Number(track.album.release_date?.slice(0, 4)) || null,
    albumCoverUrl: track.album.images?.[0]?.url ?? null,
    spotifyUrl: track.external_urls?.spotify ?? null
  }));
}
