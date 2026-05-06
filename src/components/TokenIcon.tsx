interface TokenIconProps {
  symbol: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };

const tokenConfig: Record<string, { icon: string; bg: string }> = {
  USDC: { 
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    bg: "bg-[#2775CA]/10" 
  },
  EURC: { 
    icon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png",
    bg: "bg-[#2775CA]/10" 
  },
};

export const TokenIcon = ({ symbol, size = "md", className = "" }: TokenIconProps) => {
  const config = tokenConfig[symbol];
  
  if (config) {
    return (
      <div className={`${sizeMap[size]} ${config.bg} rounded-full flex items-center justify-center p-1 ${className}`}>
        <img src={config.icon} alt={symbol} className="w-full h-full object-contain rounded-full shadow-sm shadow-[#2775CA]/10 scale-110" />
      </div>
    );
  }

  return (
    <div className={`${sizeMap[size]} bg-muted text-foreground rounded-full flex items-center justify-center font-bold ${className}`}>
      {symbol[0]}
    </div>
  );
};
