import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { SPLITLINE_ABI, SPLITLINE_ADDRESS, USDC_ABI, ARC_USDC_ADDRESS } from "../abi/splitline";

export type SplitData = {
  name: string;
  recipients: readonly `0x${string}`[];
  bps: readonly number[];
  totalReceived: bigint;
  totalReleased: bigint;
};

export function useSplit(id: bigint | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: SPLITLINE_ADDRESS,
    abi: SPLITLINE_ABI,
    functionName: "getSplit",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined && !!SPLITLINE_ADDRESS },
  });

  const split: SplitData | undefined = data
    ? { name: data[0], recipients: data[1], bps: data[2], totalReceived: data[3], totalReleased: data[4] }
    : undefined;

  return { split, isLoading, error, refetch };
}

export function useOwed(id: bigint | undefined, recipient: `0x${string}` | undefined) {
  return useReadContract({
    address: SPLITLINE_ADDRESS,
    abi: SPLITLINE_ABI,
    functionName: "owed",
    args: id !== undefined && recipient ? [id, recipient] : undefined,
    query: { enabled: id !== undefined && !!recipient && !!SPLITLINE_ADDRESS },
  });
}

export function useUsdcBalance(address: `0x${string}` | undefined) {
  // Deliberately the ERC-20 interface only — Arc's docs warn against showing the native
  // (18-decimal) and ERC-20 (6-decimal) USDC balances as two separate rows in a UI.
  return useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: owner && SPLITLINE_ADDRESS ? [owner, SPLITLINE_ADDRESS] : undefined,
    query: { enabled: !!owner && !!SPLITLINE_ADDRESS },
  });
}

export function useCreateSplit() {
  const { writeContractAsync, isPending, error } = useWriteContract();

  async function createSplit(name: string, recipients: `0x${string}`[], bps: number[]) {
    if (!SPLITLINE_ADDRESS) throw new Error("Splitline contract address is not configured");
    return writeContractAsync({
      address: SPLITLINE_ADDRESS,
      abi: SPLITLINE_ABI,
      functionName: "createSplit",
      args: [name, recipients, bps],
    });
  }

  return { createSplit, isPending, error };
}

export function useApproveUsdc() {
  const { writeContractAsync, isPending, error } = useWriteContract();

  async function approve(amount: bigint) {
    if (!SPLITLINE_ADDRESS) throw new Error("Splitline contract address is not configured");
    return writeContractAsync({
      address: ARC_USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [SPLITLINE_ADDRESS, amount],
    });
  }

  return { approve, isPending, error };
}

export function usePayIntoSplit() {
  const { writeContractAsync, isPending, error } = useWriteContract();

  async function pay(id: bigint, amount: bigint, ref: `0x${string}`) {
    if (!SPLITLINE_ADDRESS) throw new Error("Splitline contract address is not configured");
    return writeContractAsync({
      address: SPLITLINE_ADDRESS,
      abi: SPLITLINE_ABI,
      functionName: "pay",
      args: [id, amount, ref],
    });
  }

  return { pay, isPending, error };
}

export function useClaim() {
  const { writeContractAsync, isPending, error } = useWriteContract();
  const { address } = useAccount();

  async function claim(id: bigint) {
    if (!SPLITLINE_ADDRESS) throw new Error("Splitline contract address is not configured");
    return writeContractAsync({
      address: SPLITLINE_ADDRESS,
      abi: SPLITLINE_ABI,
      functionName: "claim",
      args: [id],
    });
  }

  async function claimTo(id: bigint, to: `0x${string}`) {
    if (!SPLITLINE_ADDRESS) throw new Error("Splitline contract address is not configured");
    return writeContractAsync({
      address: SPLITLINE_ADDRESS,
      abi: SPLITLINE_ABI,
      functionName: "claimTo",
      args: [id, to],
    });
  }

  return { claim, claimTo, isPending, error, connectedAddress: address };
}
