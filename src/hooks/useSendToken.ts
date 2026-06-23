import { useCallback, useState } from "react";
import { useSwitchChain } from "wagmi";
import { writeContract, waitForTransactionReceipt } from "wagmi/actions";
import { isAddress, parseUnits, type Hash } from "viem";
import { toast } from "sonner";
import { useWallet } from "@/context/WalletProvider";
import { run, type Write } from "@/lib/circleTx";
import { wagmiConfig, TOKENS } from "@/config/wagmi";
import { erc20Abi } from "@/config/abis";
import { BRIDGE_CHAINS, type BridgeChainKey } from "@/features/bridge/config/bridgeConfig";
import { humanizeError } from "@/lib/errors";

export type SendFromKind = "passkey" | "email" | "eoa";
export type SendToken = "USDC" | "EURC";

export interface SendParams {
  fromKind: SendFromKind;
  token: SendToken;
  chainKey: BridgeChainKey;
  to: string;
  amount: string;
}

/**
 * Resolve a token's address + decimals on a given chain.
 *  - Arc uses the app's canonical TOKENS (Arc has no EURC entry in BRIDGE_CHAINS).
 *  - Other chains use the bridge config's per-chain USDC/EURC. Returns null when
 *    the token doesn't exist on that chain (e.g. EURC on Arbitrum/Polygon).
 */
export function resolveToken(token: SendToken, chainKey: BridgeChainKey): { address: `0x${string}`; decimals: number } | null {
  if (chainKey === "arc") {
    return {
      address: token === "USDC" ? TOKENS.USDC.address : TOKENS.EURC.address,
      decimals: token === "USDC" ? TOKENS.USDC.decimals : TOKENS.EURC.decimals,
    };
  }
  const c = BRIDGE_CHAINS[chainKey];
  const address = token === "USDC" ? c.usdc : c.eurc;
  return address ? { address, decimals: c.usdcDecimals } : null;
}

/**
 * Send USDC/EURC to any address from the chosen wallet:
 *  - passkey (Circle Modular) → gasless user-op on Arc;
 *  - email (Circle UC) → PIN-signed transfer on Arc;
 *  - eoa (WalletConnect / injected) → wagmi tx on the selected chain
 *    (multi-chain), auto-switching the wallet's network first.
 */
export function useSendToken() {
  const { circle, uc } = useWallet();
  const { switchChainAsync } = useSwitchChain();
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState<Hash | undefined>();
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async ({ fromKind, token, chainKey, to, amount }: SendParams): Promise<Hash | undefined> => {
      setError(null);
      setTxHash(undefined);

      if (!isAddress(to)) {
        const msg = "Enter a valid recipient address (0x…).";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (!(Number(amount) > 0)) {
        const msg = "Enter an amount greater than zero.";
        setError(msg);
        toast.error(msg);
        return;
      }

      // Circle smart accounts are Arc-only.
      const effectiveChain: BridgeChainKey = fromKind === "eoa" ? chainKey : "arc";
      const resolved = resolveToken(token, effectiveChain);
      if (!resolved) {
        const msg = `${token} isn't available on ${BRIDGE_CHAINS[effectiveChain].label}.`;
        setError(msg);
        toast.error(msg);
        return;
      }

      const value = parseUnits(amount, resolved.decimals);
      const transfer: Write = {
        address: resolved.address,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to as `0x${string}`, value],
      };

      setIsPending(true);
      try {
        let hash: Hash = "0x" as Hash;
        if (fromKind === "passkey") {
          if (!circle) throw new Error("Connect your passkey wallet first.");
          hash = await run([transfer], circle);
        } else if (fromKind === "email") {
          if (!uc) throw new Error("Connect your email wallet first.");
          hash = await run([transfer], uc); // PIN challenge; settles async
        } else {
          // EOA path: send on the selected chain (multi-chain), not just Arc.
          const chain = BRIDGE_CHAINS[effectiveChain];
          await switchChainAsync({ chainId: chain.chainId });
          hash = await writeContract(wagmiConfig, {
            address: resolved.address,
            abi: erc20Abi,
            functionName: "transfer",
            args: [to as `0x${string}`, value],
            chainId: chain.chainId,
          } as never);
          await waitForTransactionReceipt(wagmiConfig, { hash, chainId: chain.chainId as never });
        }
        setTxHash(hash);
        toast.success("Transfer sent", {
          description: `${amount} ${token} → ${to.slice(0, 6)}…${to.slice(-4)} on ${BRIDGE_CHAINS[effectiveChain].label}`,
        });
        return hash;
      } catch (e: unknown) {
        const msg = humanizeError(e as never, "Transfer failed. Please try again.");
        setError(msg);
        toast.error("Transfer failed", { description: msg.slice(0, 200) });
        return;
      } finally {
        setIsPending(false);
      }
    },
    [circle, uc, switchChainAsync],
  );

  return { send, isPending, txHash, error };
}
