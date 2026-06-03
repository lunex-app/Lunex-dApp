import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getPointSummary, loadPointEvents, recordPointEvent, type PointAction } from "@/lib/points";

export function usePoints() {
  const { address } = useAccount();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener("lunex_points_updated", refresh);
    return () => window.removeEventListener("lunex_points_updated", refresh);
  }, []);

  const addPoints = useCallback(
    (action: PointAction, description: string, volumeUsd = 0, txHash?: string) =>
      recordPointEvent({ wallet: address, action, description, volumeUsd, txHash }),
    [address]
  );

  return {
    ...getPointSummary(address),
    events: loadPointEvents(address),
    addPoints,
    version,
  };
}
