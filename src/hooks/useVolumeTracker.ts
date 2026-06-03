import { useCallback } from "react";

type EventType = "swap" | "add_liquidity" | "remove_liquidity" | "vault_deposit" | "vault_withdraw";

export function useVolumeTracker() {
  const recordVolume = useCallback(
    async (params: {
      txHash: string;
      eventType: EventType;
      amountUsd: number;
      contract: string;
      blockNumber?: number;
    }) => {
      void params;
    },
    []
  );

  return { recordVolume };
}
