import { useState, useEffect } from "react";

export interface LeaderboardEntry {
  address: string;
  points: number;
  rank: number;
  interactions: number;
  lastSeen: string;
}

const LUNEX_CONTRACTS = [
  "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8",
  "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496",
  "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713",
];

export function usePointsLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalParticipants, setTotalParticipants] = useState(0);

  useEffect(() => {
    async function fetchLeaderboard() {
      setLoading(true);
      try {
        // Fetching directly from the blockchain via ArcScan API
        // No database/Supabase tables required
        const responses = await Promise.all(
          LUNEX_CONTRACTS.map(async (address) => {
            try {
              const url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&sort=asc`;
              const res = await fetch(url);
              if (!res.ok) return [];
              const data = await res.json();
              return Array.isArray(data?.result) ? data.result : [];
            } catch { return []; }
          })
        );

        const allTxs = responses.flat();
        const walletMap = new Map<string, { address: string; interactions: number; lastSeen: number }>();

        for (const tx of allTxs) {
          const addr = String(tx.from || "").toLowerCase();
          if (!addr) continue;
          
          const existing = walletMap.get(addr) || { address: addr, interactions: 0, lastSeen: 0 };
          existing.interactions += 1;
          const ts = Number(tx.timeStamp || 0) * 1000;
          if (ts > existing.lastSeen) existing.lastSeen = ts;
          walletMap.set(addr, existing);
        }

        const sorted = Array.from(walletMap.values())
          .sort((a, b) => b.interactions - a.interactions)
          .map((entry, index) => ({
            address: entry.address,
            interactions: entry.interactions,
            points: entry.interactions * 100, // 100 points per interaction
            rank: index + 1,
            lastSeen: new Date(entry.lastSeen).toLocaleString()
          }));

        setLeaderboard(sorted.slice(0, 50));
        setTotalParticipants(walletMap.size);
      } catch (err) {
        console.error("Failed to fetch onchain leaderboard:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, []);

  return { leaderboard, loading, totalParticipants };
}
