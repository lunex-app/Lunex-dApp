import BackButton from "@/components/BackButton";
import { SendTokenCard } from "@/components/dashboard/SendTokenCard";

const Send = () => {
  return (
    <div className="container max-w-xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Send Tokens</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">
          Transfer USDC & EURC to any address — from a passkey, email, or connected wallet
        </p>
      </div>
      <SendTokenCard />
    </div>
  );
};

export default Send;
