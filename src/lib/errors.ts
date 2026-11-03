import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

export interface FriendlyError {
  /** The wallet owner declined; treat as a cancel, not a failure. */
  rejected: boolean
  message: string
  /** True when the failure was recognised (a decoded contract error or a known wallet or network problem). */
  known: boolean
}

const CUSTOM_ERRORS: Record<string, string> = {
  InvalidBps: 'Each recipient needs a share above 0%, and all shares must add up to exactly 100%.',
  DuplicateRecipient: 'The same address is listed twice. Each recipient can only appear once.',
  InvalidRecipient:
    'One recipient is not allowed. It cannot be the empty address, the Splitline contract, the USDC contract, or the split’s own deposit address.',
  InvalidRecipientCount: 'A split needs between 1 and 20 recipients.',
  LengthMismatch: 'Recipients and percentages do not line up. Check every row has both.',
  NameTooLong: 'That name is too long. Keep it to 64 bytes or fewer.',
  SplitAlreadyExists:
    'You already created a split with this exact name and recipients. Change the name to create another.',
  SplitNotFound: 'That split does not exist on this network.',
  ZeroAmount: 'Enter an amount above 0.',
  NativeAmountNotWhole: 'That amount has more than 6 decimal places. USDC amounts can have at most 6 decimals.',
  NothingToSweep: 'There is no USDC waiting at this deposit address right now.',
  NotRecipient: 'This wallet is not a recipient of that split.',
  InvalidDestination: 'Choose a real destination address. It cannot be empty or the Splitline contract itself.',
  NothingOwed: 'Nothing to claim yet. New payments will show up here as they arrive.',
  ReentrancyGuardReentrantCall: 'The contract is busy with another call. Wait a moment and try again.',
  FailedDeployment: 'The deposit address could not be created. Try changing the split name.',
  SafeERC20FailedOperation: 'The USDC transfer was refused. The sender or receiver may be blocked by USDC, or the balance is too low.',
  InsufficientBalance: 'Not enough USDC for this action.',
}

const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/transfer amount exceeds balance|exceeds balance|insufficient balance/i, 'Your USDC balance is too low for this payment.'],
  [/exceeds allowance|insufficient allowance/i, 'USDC spending is not approved for this amount yet. Approve first, then pay.'],
  [/blacklist|blocklist|blocked/i, 'USDC refused this transfer because an address involved is blocklisted.'],
  [/EIP2612|invalid signature|signature expired|permit is expired/i, 'The payment signature was rejected or has expired. Try again, or use approve then pay.'],
  [/insufficient funds for gas|gas required exceeds|fee/i, 'Not enough USDC to cover the network fee. Add a little USDC to your wallet and retry.'],
  [/paused/i, 'USDC transfers are paused right now.'],
  [/rate limit|too many requests|429/i, 'The network is busy. Wait a few seconds and try again.'],
  [/timeout|timed out|network|fetch failed|failed to fetch/i, 'Network problem. Check your connection and try again.'],
  [/chain mismatch|does not match the target chain|wrong network/i, 'Your wallet is on a different network. Switch networks and try again.'],
]

function isRejection(error: unknown): boolean {
  if (error instanceof BaseError && error.walk((e) => e instanceof UserRejectedRequestError)) return true
  const e = error as { code?: number; name?: string; message?: string } | undefined
  if (e?.code === 4001 || e?.name === 'UserRejectedRequestError') return true
  return /user rejected|user denied|rejected the request|request rejected|cancell?ed by user/i.test(e?.message ?? '')
}

export function explainError(error: unknown): FriendlyError {
  if (isRejection(error)) {
    return { rejected: true, known: true, message: 'You cancelled the request in your wallet. Nothing was sent.' }
  }

  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && CUSTOM_ERRORS[name]) return { rejected: false, known: true, message: CUSTOM_ERRORS[name] }
      const reason = reverted.reason ?? reverted.shortMessage
      for (const [pattern, text] of MESSAGE_PATTERNS) if (pattern.test(reason)) return { rejected: false, known: true, message: text }
    }
  }

  const raw = error instanceof BaseError ? `${error.shortMessage} ${error.details ?? ''}` : String((error as Error)?.message ?? error)
  for (const [name, text] of Object.entries(CUSTOM_ERRORS)) {
    if (new RegExp(`\\b${name}\\b`).test(raw)) return { rejected: false, known: true, message: text }
  }
  for (const [pattern, text] of MESSAGE_PATTERNS) if (pattern.test(raw)) return { rejected: false, known: true, message: text }
  return { rejected: false, known: false, message: 'Something went wrong and nothing was sent. Please try again.' }
}
