import { BaseError, ContractFunctionRevertedError } from "viem";

// Maps Splitline's custom Solidity errors (see contracts/src/Splitline.sol) to copy a
// non-technical user can act on, instead of a raw revert selector.
const FRIENDLY_MESSAGES: Record<string, string> = {
  InvalidRecipientCount: "A split needs between 1 and 20 recipients.",
  ArrayLengthMismatch: "Each recipient needs exactly one share percentage.",
  ZeroAddressRecipient: "One of the recipient addresses is empty or invalid.",
  DuplicateRecipient: "The same address was added twice.",
  SelfReferentialRecipient: "A split can't pay out to its own contract address.",
  BpsSumMismatch: "The shares don't add up to 100% yet.",
  SplitNotFound: "That split doesn't exist.",
  ZeroAmount: "Enter an amount greater than zero.",
  NothingOwed: "There's nothing to claim right now.",
  ReentrancyGuardReentrantCall: "That action is already in progress — try again in a moment.",
  SafeERC20FailedOperation: "The USDC transfer failed. Check your balance and allowance.",
};

export function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof BaseError) {
    const revertError = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      const errorName = revertError.data?.errorName;
      if (errorName && FRIENDLY_MESSAGES[errorName]) return FRIENDLY_MESSAGES[errorName];
      if (errorName) return `Transaction reverted: ${errorName}`;
    }

    if (error.shortMessage?.toLowerCase().includes("user rejected")) {
      return "Transaction was rejected in your wallet.";
    }
    if (error.shortMessage?.toLowerCase().includes("insufficient funds")) {
      return "Not enough USDC to cover this transaction and its gas.";
    }
    return error.shortMessage ?? error.message;
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
