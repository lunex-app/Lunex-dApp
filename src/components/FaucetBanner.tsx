const FaucetBanner = () => (
  <div className="mx-4 mt-4 rounded-md bg-primary/5 border border-border text-center py-2.5 px-3 text-xs tracking-wider">
    <span className="text-primary uppercase">Lunex Finance | Live on Arc Testnet</span>
    <span className="text-muted-foreground"> | get USDC/EURC at </span>
    <a
      href="https://faucet.circle.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      faucet.circle.com
    </a>
  </div>
);

export default FaucetBanner;
