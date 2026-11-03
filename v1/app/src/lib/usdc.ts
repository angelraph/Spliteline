import { formatUnits, parseUnits } from "viem";

// Arc's ERC-20 USDC interface always uses 6 decimals (distinct from the 18-decimal
// native interface used for gas — see src/chains/arc.ts). Every amount shown or sent
// by this app goes through these two functions so the decimal count is never implicit.
const USDC_DECIMALS = 6;

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

export function parseUsdc(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS);
}

export function formatUsdcCompact(amount: bigint): string {
  const value = Number(formatUnits(amount, USDC_DECIMALS));
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
