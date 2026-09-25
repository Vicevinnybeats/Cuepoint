"use client";

/**
 * SoundCloud connect: OAuth 2.1 Authorization Code + PKCE (no client secret,
 * so this can run entirely client-side) plus fetching Likes/Uploads and
 * downloading a track's audio for import into the local library.
 *
 * Built to SoundCloud's publicly documented API (developers.soundcloud.com)
 * from training knowledge — this sandbox has no network egress to
 * soundcloud.com, so none of the endpoints below have been exercised
 * against a live app. If something 404s, it's almost certainly a stale
 * path or field name here, not a deeper problem; check the current docs
 * for the exact authorize/token URLs and the `/me/likes/tracks` and
 * `/me/tracks` response shape.
 *
 * Only works in the web/PWA build: OAuth requires a real HTTPS redirect
 * URI, which the Electron desktop build (served from a local file server)
 * doesn't have.
 */

const CLIENT_ID_KEY = "cuepoint-soundcloud-client-id";
const TOKEN_KEY = "cuepoint-soundcloud-token";
const VERIFIER_KEY = "cuepoint-soundcloud-pkce-verifier";

const AUTHORIZE_URL = "https://secure.soundcloud.com/authorize";
const TOKEN_URL = "https://secure.soundcloud.com/oauth/token";
const API_BASE = "https://api.soundcloud.com";

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export function getClientId(): string | null {
  try {
    return localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    return null;
  }
}

export function setClientId(id: string): void {
  try {
    localStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    // No storage — the connect button will just need it re-entered.
  }
}

function getToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export function isConnected(): boolean {
  return getToken() !== null;
}

export function disconnect(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clean up if storage never worked.
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Redirects the browser to SoundCloud's own authorize page. Call from a
 * user gesture (a click), since it navigates away immediately. */
export async function beginConnect(redirectUri: string): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error("Set a SoundCloud Client ID first.");

  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFor(verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Called from the OAuth redirect callback page with the `code` query
 * param. Exchanges it for an access token and stores it. */
export async function completeConnect(code: string, redirectUri: string): Promise<void> {
  const clientId = getClientId();
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!clientId) throw new Error("No Client ID was set before starting the connect flow.");
  if (!verifier) throw new Error("Missing PKCE verifier — the connect flow needs to be restarted.");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`SoundCloud token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const token: StoredToken = {
    accessToken: data.access_token,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } finally {
    sessionStorage.removeItem(VERIFIER_KEY);
  }
}

async function authedFetch(path: string): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error("Not connected to SoundCloud.");
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `OAuth ${token.accessToken}`, Accept: "application/json; charset=utf-8" },
  });
}

export interface SoundCloudTrack {
  id: number;
  title: string;
  /** The transcoding URL to resolve for a decodable (progressive, not HLS)
   * stream, or null when the track only offers HLS — Cuepoint's import
   * path uses decodeAudioData on a whole file, not a segmented stream. */
  transcodingUrl: string | null;
}

interface RawTranscoding {
  url?: string;
  format?: { protocol?: string };
}

interface RawTrack {
  id: number;
  title: string;
  media?: { transcodings?: RawTranscoding[] };
}

function toSoundCloudTrack(raw: RawTrack): SoundCloudTrack {
  const progressive = raw.media?.transcodings?.find((t) => t.format?.protocol === "progressive");
  return { id: raw.id, title: raw.title, transcodingUrl: progressive?.url ?? null };
}

export async function fetchLikes(): Promise<SoundCloudTrack[]> {
  const res = await authedFetch("/me/likes/tracks?limit=50");
  if (!res.ok) throw new Error(`Could not load your likes (${res.status})`);
  const data = (await res.json()) as RawTrack[] | { collection: RawTrack[] };
  const items = Array.isArray(data) ? data : data.collection;
  return items.map(toSoundCloudTrack);
}

export async function fetchUploads(): Promise<SoundCloudTrack[]> {
  const res = await authedFetch("/me/tracks?limit=50");
  if (!res.ok) throw new Error(`Could not load your uploads (${res.status})`);
  const data = (await res.json()) as RawTrack[] | { collection: RawTrack[] };
  const items = Array.isArray(data) ? data : data.collection;
  return items.map(toSoundCloudTrack);
}

/** Resolves a track's transcoding to its signed CDN URL and downloads the
 * audio. Throws if the track only has an HLS transcoding. */
export async function downloadTrackAudio(track: SoundCloudTrack): Promise<Blob> {
  if (!track.transcodingUrl) {
    throw new Error("This track only offers an HLS stream, which Cuepoint can't import yet.");
  }
  const token = getToken();
  if (!token) throw new Error("Not connected to SoundCloud.");

  const resolveRes = await fetch(track.transcodingUrl, {
    headers: { Authorization: `OAuth ${token.accessToken}` },
  });
  if (!resolveRes.ok) throw new Error(`Could not resolve the stream (${resolveRes.status})`);
  const { url } = (await resolveRes.json()) as { url: string };

  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`Could not download the audio (${audioRes.status})`);
  return audioRes.blob();
}
