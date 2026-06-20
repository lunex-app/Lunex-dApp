import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type EventType = "swap" | "add_liquidity" | "remove_liquidity" | "vault_deposit" | "vault_withdraw";

/**
 * Records protocol volume to Supabase (`protocol_volume`) so the landing/stats
 * pages can show real cumulative volume. Best-effort: never throws into the tx
 * flow (a storage/RLS failure must not flip a confirmed swap to "failed").
 */
export function useVolumeTracker() {
  const recordVolume = useCallback(
    async (params: {
      txHash: string;
      eventType: EventType;
      amountUsd: number;
      contract: string;
      blockNumber?: number;
    }) => {
      if (!params.txHash || params.txHash === "0x" || !(params.amountUsd > 0)) return;
      try {
        await supabase.from("protocol_volume").insert({
          tx_hash: params.txHash,
          event_type: params.eventType,
          amount_usd: params.amountUsd,
          contract: params.contract,
          block_number: params.blockNumber ?? 0,
        });
      } catch {
        /* best-effort — ignore */
      }
    },
    []
  );

  return { recordVolume };
}

/** Sum all recorded protocol volume (USD). Returns 0 if unavailable. */
export async function fetchTotalVolumeUsd(): Promise<number> {
  try {
    const { data } = await supabase.from("protocol_volume").select("amount_usd");
    return (data ?? []).reduce((sum, row) => sum + Number((row as { amount_usd?: number }).amount_usd ?? 0), 0);
  } catch {
    return 0;
  }
}
