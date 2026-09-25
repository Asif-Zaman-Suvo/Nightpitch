const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function generatePublicId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("")
}

/** Accepts `TMT-8F4K-2XQ9`, spaces, and Crockford confusables. Returns the stored 8-character id. */
export function normalizePublicId(input: string): string | null {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/^TMT/, "")
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")

  if (!/^[0-9A-HJ-KM-NP-TV-Z]{8}$/.test(compact)) return null
  return compact
}

export function formatPublicId(publicId: string): string {
  return `TMT-${publicId.slice(0, 4)}-${publicId.slice(4)}`
}

export async function allocatePublicId(
  isTaken: (publicId: string) => Promise<boolean>,
  random: () => string = generatePublicId,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const publicId = random()
    if (!(await isTaken(publicId))) return publicId
  }
  throw new Error("Could not allocate a tournament id")
}
