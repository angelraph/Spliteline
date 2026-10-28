import { formatUnits, parseUnits } from 'viem'
import { USDC_DECIMALS } from '@/onchain-facts'

/** Parse a user-typed USDC amount with viem's parseUnits. Returns null for anything invalid. */
export function parseUsdcInput(input: string): bigint | null {
  const value = input.trim()
  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return null
  const [, fraction = ''] = value.split('.')
  if (fraction.length > USDC_DECIMALS) return null
  try {
    return parseUnits(value.startsWith('.') ? `0${value}` : value, USDC_DECIMALS)
  } catch {
    return null
  }
}

/** Exact, untrimmed decimal string (viem formatUnits). */
export const formatUsdcExact = (raw: bigint): string => formatUnits(raw, USDC_DECIMALS)

/** Human display: thousands separators, at least 2 and at most 6 fraction digits (never rounds). */
export function formatUsdc(raw: bigint, minFraction = 2): string {
  const negative = raw < 0n
  const [int, frac = ''] = formatUnits(negative ? -raw : raw, USDC_DECIMALS).split('.')
  let trimmed = frac.replace(/0+$/, '')
  while (trimmed.length < minFraction) trimmed += '0'
  const grouped = BigInt(int).toLocaleString('en-US')
  return `${negative ? '-' : ''}${grouped}${trimmed ? `.${trimmed}` : ''}`
}

/** floor(amount * bps / 10000), matching the contract's cumulative entitlement. */
export const shareOf = (amount: bigint, bps: number): bigint => (amount * BigInt(bps)) / 10000n

export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100)
  const frac = String(bps % 100).padStart(2, '0')
  return `${whole}.${frac}%`
}

/** Parse "33.33" into basis points (0..10000). Returns null if invalid or more than 2 decimals. */
export function parsePercentToBps(input: string): number | null {
  const value = input.trim()
  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return null
  const [, frac = ''] = value.split('.')
  if (frac.length > 2) return null
  const bps = Number(parseUnits(value.startsWith('.') ? `0${value}` : value, 2))
  return bps > 10000 ? null : bps
}
