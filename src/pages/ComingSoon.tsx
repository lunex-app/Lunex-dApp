import { Crown } from "lucide-react";
import BackButton from "@/components/BackButton";

const ComingSoon = ({ title = "Lunex Points", subtitle = "Earn rewards for swapping, providing liquidity, and bridging on Lunex." }: { title?: string; subtitle?: string }) => (
  <div className="container max-w-4xl mx-auto py-16 px-4">
    <BackButton />
    <div className="mt-10 flex flex-col items-center justify-center text-center min-h-[50vh] gap-6">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Crown className="h-8 w-8" />
      </div>
      <div>
        <span className="inline-block rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-4">
          Coming Soon
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
    </div>
  </div>
);

export default ComingSoon;
