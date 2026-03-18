/**
 * Perceptual Image Hashing (dHash)
 *
 * Computes a 64-bit difference hash for visual similarity detection.
 * Uses sharp (already installed) — no additional dependencies needed.
 */

import sharp from 'sharp';

const HASH_SIZE = 8; // 8x8 = 64-bit hash

/**
 * Compute a dHash (difference hash) for an image buffer.
 * Returns a 16-character hex string representing a 64-bit hash.
 *
 * Algorithm:
 * 1. Resize to 9x8 grayscale
 * 2. For each row, compare adjacent pixels (left > right = 1 bit)
 * 3. Produces 64-bit hash
 */
export async function computeDHash(imageBuffer: Buffer): Promise<string> {
  const pixels = await sharp(imageBuffer)
    .greyscale()
    .resize(HASH_SIZE + 1, HASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const left = pixels[y * (HASH_SIZE + 1) + x];
      const right = pixels[y * (HASH_SIZE + 1) + x + 1];
      if (left > right) {
        hash |= 1n << BigInt(y * HASH_SIZE + x);
      }
    }
  }

  return hash.toString(16).padStart(16, '0');
}

/**
 * Compute Hamming distance between two hex hash strings.
 * Returns the number of differing bits (0 = identical, 64 = maximally different).
 */
export function hammingDistance(a: string, b: string): number {
  let xor = BigInt('0x' + a) ^ BigInt('0x' + b);
  let dist = 0;
  while (xor > 0n) {
    dist += Number(xor & 1n);
    xor >>= 1n;
  }
  return dist;
}

/**
 * Hamming distance threshold for considering two images "visually similar".
 * 0 = identical, ≤5 = near-identical, ≤10 = similar, >10 = different.
 */
export const SIMILARITY_THRESHOLD = 10;
