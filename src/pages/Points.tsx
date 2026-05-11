import { Trophy } from "lucide-react";
import BackButton from "@/components/BackButton";

const Points = () => {
  return (
    <div className="container max-w-lg mx-auto py-32 px-4 text-center">
      <BackButton />
      <div className="mt-12 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto ring-1 ring-primary/20">
          <Trophy className="h-10 w-10 text-primary" />
        </div>
        
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tighter uppercase italic">Lunex Points</h1>
          <p className="text-muted-foreground font-mono text-sm max-w-sm mx-auto leading-relaxed">
            Standardizing loyalty and protocol participation. Our upcoming reward engine is currently under development to ensure fair distribution and onchain verification.
          </p>
        </div>

        <div className="p-4 bg-primary/5 border border-primary/20 inline-block overflow-hidden relative group">
           <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
           <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary px-4">
             Protocol Feature: coming soon
           </p>
        </div>

        <div className="pt-12 grid grid-cols-3 gap-8 opacity-40 grayscale">
           {[
             { label: "Season 1", val: "Q2 2026" },
             { label: "Multiplier", val: "1.0x" },
             { label: "Status", val: "Pending" },
           ].map((item, i) => (
             <div key={i}>
                <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{item.label}</p>
                <p className="text-xs font-bold font-mono text-foreground">{item.val}</p>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default Points;
