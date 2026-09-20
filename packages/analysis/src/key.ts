/**
 * Key detection: 12-bin chroma vector (energy per pitch class, summed across
 * the FFT frames of the track's opening) correlated against the Krumhansl-
 * Kessler major/minor key profiles. Reports the Camelot wheel code DJ
 * software uses for harmonic mixing (e.g. "8A"), not the musical name.
 */
import { magnitudeSpectrum } from "./fft.js";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Camelot wheel number for each tonic pitch class (index 0 = C .. 11 = B).
// Relative major/minor pairs share a number (e.g. C major and A minor are
// both "8"); a minor tonic sits 3 semitones below its relative major's.
const MAJOR_CAMELOT = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const MINOR_CAMELOT = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

const FFT_SIZE = 16384;
const HOP_SIZE = 8192;
/** Only the opening section is analysed — a stable estimate for far less
 * work than scanning a whole track frame by frame. */
const ANALYSIS_SECONDS = 30;
const MIN_HZ = 55; // A1
const MAX_HZ = 5000; // just past the top of the musically useful range

export interface KeyDetectionResult {
  /** Camelot wheel notation, e.g. "8A" — what harmonic-mixing DJs read. */
  camelot: string;
  /** Traditional name, e.g. "A Minor". */
  name: string;
}

function frequencyToPitchClass(freq: number): number {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return ((midi % 12) + 12) % 12;
}

export function computeChromaVector(samples: Float32Array, sampleRate: number): Float64Array {
  const chroma = new Float64Array(12);
  const limit = Math.min(samples.length, Math.floor(sampleRate * ANALYSIS_SECONDS));
  let frames = 0;

  for (let start = 0; start + FFT_SIZE <= limit; start += HOP_SIZE) {
    const frame = samples.subarray(start, start + FFT_SIZE);
    const magnitudes = magnitudeSpectrum(frame);
    for (let bin = 1; bin < magnitudes.length; bin++) {
      const freq = (bin * sampleRate) / FFT_SIZE;
      if (freq < MIN_HZ || freq > MAX_HZ) continue;
      const pitchClass = frequencyToPitchClass(freq);
      chroma[pitchClass] = (chroma[pitchClass] as number) + (magnitudes[bin] as number);
    }
    frames++;
  }

  if (frames > 0) {
    for (let i = 0; i < 12; i++) chroma[i] = (chroma[i] as number) / frames;
  }
  return chroma;
}

/** Pearson correlation between chroma and `profile`, testing the hypothesis
 * that the tonic sits at pitch class `tonic`. */
function correlate(chroma: Float64Array, profile: number[], tonic: number): number {
  let chromaMean = 0;
  let profileMean = 0;
  for (let i = 0; i < 12; i++) {
    chromaMean += chroma[i] as number;
    profileMean += profile[i] as number;
  }
  chromaMean /= 12;
  profileMean /= 12;

  let numerator = 0;
  let chromaVariance = 0;
  let profileVariance = 0;
  for (let i = 0; i < 12; i++) {
    const c = (chroma[(i + tonic) % 12] as number) - chromaMean;
    const p = (profile[i] as number) - profileMean;
    numerator += c * p;
    chromaVariance += c * c;
    profileVariance += p * p;
  }
  const denominator = Math.sqrt(chromaVariance * profileVariance);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function detectKey(samples: Float32Array, sampleRate: number): KeyDetectionResult {
  const chroma = computeChromaVector(samples, sampleRate);

  let bestScore = -Infinity;
  let bestTonic = 0;
  let bestMode: "major" | "minor" = "major";

  for (let tonic = 0; tonic < 12; tonic++) {
    const majorScore = correlate(chroma, MAJOR_PROFILE, tonic);
    if (majorScore > bestScore) {
      bestScore = majorScore;
      bestTonic = tonic;
      bestMode = "major";
    }
    const minorScore = correlate(chroma, MINOR_PROFILE, tonic);
    if (minorScore > bestScore) {
      bestScore = minorScore;
      bestTonic = tonic;
      bestMode = "minor";
    }
  }

  const camelotNumber = bestMode === "major" ? MAJOR_CAMELOT[bestTonic] : MINOR_CAMELOT[bestTonic];
  const camelotLetter = bestMode === "major" ? "B" : "A";
  const noteName = NOTE_NAMES[bestTonic];
  return {
    camelot: `${camelotNumber}${camelotLetter}`,
    name: bestMode === "major" ? `${noteName} Major` : `${noteName} Minor`,
  };
}
