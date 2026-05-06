import lunexLogo from "@/assets/lunex-logo.png";

export const LoadingOverlay = () => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030712] animate-in fade-in duration-500">
      <div className="relative">
        <div className="relative w-10 h-10">
          <img 
            src={lunexLogo} 
            alt="Loading" 
            className="w-full h-full object-contain"
          />
          <div className="absolute inset-x-0 -bottom-3 h-0.5 bg-primary/20 rounded-full overflow-hidden">
             <div className="h-full bg-primary animate-loading-bar" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const LoadingSpinner = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const sizeClass = size === "sm" ? "w-6 h-6" : size === "lg" ? "w-16 h-16" : "w-10 h-10";
  return (
    <div className={`${sizeClass} relative animate-pulse`}>
      <img src={lunexLogo} alt="Loading" className="w-full h-full object-contain" />
    </div>
  );
};
