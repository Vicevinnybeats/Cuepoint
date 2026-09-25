"use client";

/**
 * SoundCloud connect: OAuth 2.1 Authorization Code + PKCE (no client secret,
 * so this can run entirely client-side) plus fetching Likes/Uploads and
 * downloading a track's audio for import into the local library.
 *
 * Endpoints and schema (authorize/token URLs, /me/likes/tracks, /me/tracks,
 * /tracks/{track_urn}/streams, the Track object's `urn`) are checked against
 * SoundCloud's own published OpenAPI spec (github.com/soundcloud/api,
 * openapi/api.yaml) and their reference sc-api-auth.mjs CLI script — not
 * exercised against a live app, since this sandbox has no network egress to
 * soundcloud.com, but the shapes themselves come from SoundCloud's own repo
 * rather than guesswork.
 *
 * One real, confirmed limitation from that spec: the public API only
 * offers full tracks as HLS (`hls_mp3_128_url` / `hls_aac_160_url`) — the
 * old flat `stream_url` field is deprecated and preview-only. There's no
 * single progressive-MP3 URL to just fetch and decode, so `downloadTrackAudio`
 * fetches the HLS media playlist and concatenates its MP3 segments into one
 * Blob (MP3 is frame-based and tolerates this) rather than doing a real HLS
 * demux — good enough for import, not a general HLS player.
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
  /** e.g. "soundcloud:tracks:308946187" — the public API's only identifier
   * for a track; there's no plain numeric id in the current schema. */
  urn: string;
  title: string;
}

interface RawTrack {
  urn: string;
  title: string;
}

function toSoundCloudTrack(raw: RawTrack): SoundCloudTrack {
  return { urn: raw.urn, title: raw.title };
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

interface StreamsResponse {
  hls_mp3_128_url?: string;
  hls_aac_160_url?: string;
  preview_mp3_128_url?: string;
}

/** Fetches an HLS media playlist and concatenates its segments into one
 * Blob. Not a real HLS demux (no bitrate switching, no discontinuity
 * handling) — just enough to turn "one track, one quality" into a file
 * decodeAudioData can read. MP3 is frame-based and tolerates being
 * concatenated like this; this would need real demuxing for AAC/TS segments. */
async function concatenateHlsSegments(playlistUrl: string, accessToken: string): Promise<Blob> {
  const playlistRes = await fetch(playlistUrl, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  if (!playlistRes.ok) throw new Error(`Could not fetch the HLS playlist (${playlistRes.status})`);
  const playlistText = await playlistRes.text();
  const base = new URL(playlistRes.url);
  const segmentUrls = playlistText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => new URL(line, base).toString());
  if (segmentUrls.length === 0) throw new Error("The HLS playlist had no segments.");

  const parts: Blob[] = [];
  for (const url of segmentUrls) {
    const segmentRes = await fetch(url);
    if (!segmentRes.ok) throw new Error(`Could not fetch an HLS segment (${segmentRes.status})`);
    parts.push(await segmentRes.blob());
  }
  return new Blob(parts, { type: "audio/mpeg" });
}

/** Downloads a track's full audio via its HLS stream (see module docs —
 * the public API doesn't offer a plain progressive URL for full tracks). */
export async function downloadTrackAudio(track: SoundCloudTrack): Promise<Blob> {
  const token = getToken();
  if (!token) throw new Error("Not connected to SoundCloud.");

  const streamsRes = await authedFetch(`/tracks/${encodeURIComponent(track.urn)}/streams`);
  if (!streamsRes.ok) throw new Error(`Could not get this track's stream (${streamsRes.status})`);
  const streams = (await streamsRes.json()) as StreamsResponse;
  const playlistUrl = streams.hls_mp3_128_url ?? streams.hls_aac_160_url;
  if (!playlistUrl) {
    throw new Error("SoundCloud didn't return a playable stream for this track.");
  }
  if (!streams.hls_mp3_128_url) {
    throw new Error("This track only offers an AAC stream, which Cuepoint can't import yet.");
  }

  return concatenateHlsSegments(playlistUrl, token.accessToken);
}
