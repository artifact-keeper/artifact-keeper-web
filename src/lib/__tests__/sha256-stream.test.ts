import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { Sha256, sha256Blob } from "../sha256-stream";

function bytes(n: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

function reference(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("Sha256", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    const enc = new TextEncoder();
    expect(new Sha256().digestHex()).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(new Sha256().update(enc.encode("abc")).digestHex()).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(
      new Sha256()
        .update(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
        .digestHex()
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("matches node:crypto across padding boundaries", () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096 + 7]) {
      const data = bytes(n, n);
      expect(new Sha256().update(data).digestHex()).toBe(reference(data));
    }
  });

  it("gives the same digest however the input is split", () => {
    const data = bytes(10_000);
    const expected = reference(data);
    for (const step of [1, 3, 63, 64, 65, 1000, 4097]) {
      const h = new Sha256();
      for (let i = 0; i < data.length; i += step) h.update(data.subarray(i, i + step));
      expect(h.digestHex()).toBe(expected);
    }
  });

  it("refuses to be used after digest", () => {
    const h = new Sha256();
    h.digestHex();
    expect(() => h.update(new Uint8Array(1))).toThrow();
    expect(() => h.digestHex()).toThrow();
  });
});

describe("sha256Blob", () => {
  it("hashes a Blob slice by slice and matches node:crypto", async () => {
    const data = bytes(200_003);
    const blob = new Blob([data]);
    for (const sliceSize of [64, 1000, 65_536, 1 << 20]) {
      expect(await sha256Blob(blob, { sliceSize })).toBe(reference(data));
    }
  });

  it("never reads the whole file, only bounded slices (#887)", async () => {
    const data = bytes(50_000);
    const real = new Blob([data]);
    const sliceSize = 4096;
    const slice = vi.fn((start?: number, end?: number) => real.slice(start, end));
    const file = {
      size: real.size,
      arrayBuffer: vi.fn(() =>
        Promise.reject(new DOMException("could not be read", "NotReadableError"))
      ),
      slice,
    } as unknown as Blob;

    expect(await sha256Blob(file, { sliceSize })).toBe(reference(data));
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(slice).toHaveBeenCalledTimes(Math.ceil(data.length / sliceSize));
    for (const [start, end] of slice.mock.calls) {
      expect((end as number) - (start as number)).toBeLessThanOrEqual(sliceSize);
    }
  });

  it("stops when the signal is aborted", async () => {
    const signal = { aborted: true };
    await expect(sha256Blob(new Blob([bytes(10)]), { signal })).rejects.toThrow(
      /cancelled/
    );
  });
});
