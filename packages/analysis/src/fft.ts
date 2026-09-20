/**
 * Minimal iterative radix-2 Cooley-Tukey FFT, just enough for chroma
 * extraction in key.ts. Power-of-two lengths only.
 */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length) throw new Error("real/imag length mismatch");
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two");

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i] as number;
      real[i] = real[j] as number;
      real[j] = tr;
      const ti = imag[i] as number;
      imag[i] = imag[j] as number;
      imag[j] = ti;
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const i0 = start + k;
        const i1 = i0 + half;
        const xr = real[i1] as number;
        const xi = imag[i1] as number;
        const tr = xr * wr - xi * wi;
        const ti = xr * wi + xi * wr;
        const er = real[i0] as number;
        const ei = imag[i0] as number;
        real[i1] = er - tr;
        imag[i1] = ei - ti;
        real[i0] = er + tr;
        imag[i0] = ei + ti;
      }
    }
  }
}

/** Magnitude spectrum of a Hann-windowed frame (reduces spectral leakage). */
export function magnitudeSpectrum(samples: Float32Array): Float64Array {
  const n = samples.length;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    real[i] = (samples[i] as number) * window;
  }
  fft(real, imag);

  const magnitudes = new Float64Array(n / 2);
  for (let i = 0; i < magnitudes.length; i++) {
    magnitudes[i] = Math.hypot(real[i] as number, imag[i] as number);
  }
  return magnitudes;
}
