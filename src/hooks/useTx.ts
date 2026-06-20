import { useCallback, useState } from "react";
import type { Hash } from "viem";
import { useWallet } from "@/context/WalletProvider";
import { run, type Write } from "@/lib/circleTx";
import { humanizeError } from "@/lib/errors";

/**
 * Unified write-runner. Routes a batch of contract writes through whichever
 * wallet is active (passkey → one gasless op, UC → PIN challenges, injected →
 * wagmi), and exposes a uniform status surface to the action hooks.
 *
 * run() awaits settlement, so there is a single pending phase that flips to
 * confirmed on success (no separate submit/confirm split as with raw wagmi).
 */
export function useTx() {
  const { signer } = useWallet();
  const [isPending, setIsPending] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (writes: Write[]): Promise<Hash | undefined> => {
      setIsPending(true);
      setIsConfirmed(false);
      setError(null);
      setTxHash(undefined);
      try {
        const hash = await run(writes, signer);
        setTxHash(hash);
        setIsConfirmed(true);
        return hash;
      } catch (e: unknown) {
        // Surface a clean, friendly message (no viem/RPC internals).
        setError(new Error(humanizeError(e as never, "Transaction failed. Please try again.")));
        return undefined;
      } finally {
        setIsPending(false);
      }
    },
    [signer]
  );

  const reset = useCallback(() => {
    setIsPending(false);
    setIsConfirmed(false);
    setTxHash(undefined);
    setError(null);
  }, []);

  return { execute, isPending, isConfirmed, txHash, error, reset };
}
