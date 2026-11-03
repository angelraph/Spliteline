import { bytesToHex, hexToBytes, stringToBytes, type Hex } from 'viem'

export const ZERO_REF: Hex = `0x${'0'.repeat(64)}`

/** Turn a short note (or a raw 32-byte hex value) into the bytes32 the contract stores. */
export function encodeRef(input: string): { ok: true; value: Hex } | { ok: false; message: string } {
  const text = input.trim()
  if (!text) return { ok: true, value: ZERO_REF }
  if (/^0x[0-9a-fA-F]{64}$/.test(text)) return { ok: true, value: text as Hex }
  const bytes = stringToBytes(text)
  if (bytes.length > 32) return { ok: false, message: 'Keep the reference to 32 bytes or fewer (about 32 plain characters).' }
  const padded = new Uint8Array(32)
  padded.set(bytes)
  return { ok: true, value: bytesToHex(padded) }
}

export function decodeRef(ref: Hex): { empty: boolean; text?: string; hex: Hex } {
  if (ref === ZERO_REF) return { empty: true, hex: ref }
  const bytes = hexToBytes(ref)
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0) end--
  const body = bytes.slice(0, end)
  const printable = body.length > 0 && body.every((b) => b >= 0x20 && b <= 0x7e)
  return { empty: false, text: printable ? new TextDecoder().decode(body) : undefined, hex: ref }
}
