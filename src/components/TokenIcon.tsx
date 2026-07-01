import usdcLogo from "@/assets/tokens/usdc.png";
import eurcLogo from "@/assets/tokens/eurc.png";
import usdtLogo from "@/assets/tokens/usdt.png";

interface TokenIconProps {
  symbol: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };

const tokenConfig: Record<string, { icon: string; bg: string }> = {
  USDC: { icon: usdcLogo, bg: "bg-[#2775CA]/10" },
  EURC: { icon: eurcLogo, bg: "bg-[#2775CA]/10" },
  USDT: { icon: usdtLogo, bg: "bg-[#26A17B]/10" },
};

export const TokenIcon = ({ symbol, size = "md", className = "" }: TokenIconProps) => {
  const config = tokenConfig[symbol];

  if (config) {
    return (
      <div className={`${sizeMap[size]} ${config.bg} rounded-full flex items-center justify-center p-1 ${className}`}>
        <img src={config.icon} alt={symbol} className="w-full h-full object-contain rounded-full" />
      </div>
    );
  }

  return (
    <div className={`${sizeMap[size]} bg-muted text-foreground rounded-full flex items-center justify-center font-bold ${className}`}>
      {symbol[0]}
    </div>
  );
};
