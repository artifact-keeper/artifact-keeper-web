/**
 * Incremental SHA-256 for files too large to read in one piece (#887).
 *
 * `crypto.subtle.digest` only accepts a complete buffer, so hashing a `File`
 * with it means `file.arrayBuffer()` first. Browsers cannot materialise a
 * file of 2 GiB or more as one ArrayBuffer: Chrome rejects the read with
 * `NotReadableError` ("The requested file could not be read ..."), which is
 * what large chunked uploads failed with before any request was sent. This
 * module hashes the file one `slice()` at a time instead, so memory use is
 * bounded by the slice size whatever the file size.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Streaming SHA-256 (FIPS 180-4). Feed bytes with `update`, then `digestHex`. */
export class Sha256 {
  private readonly h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly w = new Uint32Array(64);
  private readonly buffer = new Uint8Array(64);
  private buffered = 0;
  /** Total bytes hashed. A double holds byte counts exactly up to 2^53. */
  private length = 0;
  private finished = false;

  update(data: Uint8Array): this {
    if (this.finished) throw new Error("Sha256: update after digest");
    this.length += data.length;
    let offset = 0;
    if (this.buffered > 0) {
      const take = Math.min(64 - this.buffered, data.length);
      this.buffer.set(data.subarray(0, take), this.buffered);
      this.buffered += take;
      offset = take;
      if (this.buffered < 64) return this;
      this.compress(this.buffer, 0);
      this.buffered = 0;
    }
    while (offset + 64 <= data.length) {
      this.compress(data, offset);
      offset += 64;
    }
    if (offset < data.length) {
      this.buffer.set(data.subarray(offset), 0);
      this.buffered = data.length - offset;
    }
    return this;
  }

  digestHex(): string {
    if (this.finished) throw new Error("Sha256: digest called twice");
    const bitLength = this.length * 8;
    const pad = new Uint8Array(((this.buffered + 8) >> 6 << 6) + 64 - this.buffered);
    pad[0] = 0x80;
    const view = new DataView(pad.buffer);
    view.setUint32(pad.length - 8, Math.floor(bitLength / 0x100000000));
    view.setUint32(pad.length - 4, bitLength >>> 0);
    const length = this.length;
    this.update(pad);
    this.length = length;
    this.finished = true;
    let hex = "";
    for (let i = 0; i < 8; i++) hex += this.h[i].toString(16).padStart(8, "0");
    return hex;
  }

  private compress(bytes: Uint8Array, offset: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] =
        (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    const h = this.h;
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
}

/** Slice size for hashing: large enough to amortise the read, small enough to bound memory. */
export const HASH_SLICE_SIZE = 8 * 1024 * 1024;

async function readSlice(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

/**
 * SHA-256 of a `Blob`/`File` as lowercase hex, read `sliceSize` bytes at a
 * time. Never reads the whole blob at once.
 */
export async function sha256Blob(
  blob: Blob,
  options: { sliceSize?: number; signal?: { aborted: boolean } } = {},
): Promise<string> {
  const sliceSize = options.sliceSize ?? HASH_SLICE_SIZE;
  const hasher = new Sha256();
  for (let start = 0; start < blob.size; start += sliceSize) {
    if (options.signal?.aborted) throw new Error("Hashing cancelled");
    const end = Math.min(start + sliceSize, blob.size);
    hasher.update(new Uint8Array(await readSlice(blob.slice(start, end))));
  }
  return hasher.digestHex();
}
