import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      if (params.amountUsd <= 0) return;
      try {
        await supabase.from("protocol_volume").insert({
          tx_hash: params.txHash,
          event_type: params.eventType,
          amount_usd: params.amountUsd,
          contract: params.contract,
          block_number: params.blockNumber ?? 0,
        });
      } catch {
        // non-critical
      }
    },
    []
  );

  return { recordVolume };
}
