import { Award, BarChart3, Crown, Loader2, Trophy } from "lucide-react";
import { useAccount } from "wagmi";
import BackButton from "@/components/BackButton";
import EmptyState from "@/components/EmptyState";
import { usePoints } from "@/hooks/usePoints";
import { usePointsLeaderboard } from "@/hooks/usePointsLeaderboard";

const actionLabels: Record<string, string> = {
  swap: "Swaps",
  liquidity: "Liquidity",
  vault: "Vaults",
  bridge: "Bridge",
  sdk: "SDK",
  pay: "Pay",
  stream: "Streams",
  limit_order: "Limit Orders",
};

const Points = () => {
  const { isConnected, address } = useAccount();
  const points = usePoints();
  const leaderboard = usePointsLeaderboard();
  const byAction = points.events.reduce<Record<string, number>>((acc, event) => {
    acc[event.action] = (acc[event.action] || 0) + event.points;
    return acc;
  }, {});

  return (
    <div className="container max-w-6xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <Trophy className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Lunex Points</h1>
        </div>
        <p className="text-muted-foreground text-sm font-mono mt-1">Onchain contribution score for protocol activity</p>
      </div>

      {!isConnected ? (
        <div className="border border-border bg-card">
          <EmptyState variant="deposits" title="Wallet not connected" description="Connect your wallet to view protocol points and contribution history." />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
          <div className="space-y-8">
            <section className="border border-border bg-card rounded-sm overflow-hidden">
              <div className="p-8 bg-primary/5 border-b border-primary/20">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary mb-3">Season 1 score</p>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                  <div>
                    <p className="text-5xl font-black font-mono tracking-tighter">{points.totalPoints.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-2">Non-transferable wallet credential</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 min-w-[220px]">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Interactions</p>
                      <p className="text-lg font-bold font-mono">{points.interactions}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Volume</p>
                      <p className="text-lg font-bold font-mono">${points.totalVolume.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
                {Object.entries(actionLabels).map(([key, label]) => (
                  <div key={key} className="p-5">
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">{label}</p>
                    <p className="text-lg font-black font-mono">{(byAction[key] || 0).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-border bg-card rounded-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Recent point events</h2>
              </div>
              {points.events.length > 0 ? (
                <div className="divide-y divide-border">
                  {points.events.slice(0, 12).map((event) => (
                    <div key={event.id} className="p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold">{event.description}</p>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                          {new Date(event.createdAt).toLocaleString()} · {event.action.replace("_", " ")}
                        </p>
                      </div>
                      <p className="text-sm font-black font-mono text-primary">+{event.points}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-xs text-muted-foreground">No point events recorded for {address?.slice(0, 6)}…{address?.slice(-4)}.</div>
              )}
            </section>
          </div>

          <section className="border border-border bg-card rounded-sm overflow-hidden h-fit">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Onchain leaderboard</h2>
            </div>
            {leaderboard.loading ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {leaderboard.leaderboard.slice(0, 10).map((entry) => (
                  <div key={entry.address} className="p-4 flex items-center gap-3">
                    <div className="h-8 w-8 border border-border bg-muted/20 flex items-center justify-center text-xs font-black">
                      {entry.rank === 1 ? <Crown className="h-4 w-4 text-primary" /> : entry.rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono truncate">{entry.address}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest">{entry.interactions} interactions</p>
                    </div>
                    <p className="text-xs font-black font-mono text-primary">{entry.points}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Points;
