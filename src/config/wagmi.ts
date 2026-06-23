import { createConfig, http } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { defineChain } from "viem";
import { baseSepolia as viemBaseSepolia, sepolia, arbitrumSepolia, avalancheFuji, polygonAmoy } from "viem/chains";

// RPC endpoint comes from env (set VITE_ARC_RPC_URL to your dedicated QuickNode
// endpoint). Falls back to Arc's public RPC — a public, non-secret URL.
const ARC_RPC_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_ARC_RPC_URL ||
  "https://rpc.testnet.arc.network";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        ARC_RPC_URL,
        "https://rpc.testnet.arc.network",
      ],
      webSocket: ["wss://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  testnet: true,
});

export const TOKENS = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000" as `0x${string}`,
    decimals: 6,
    symbol: "USDC",
    name: "USDC",
  },
  EURC: {
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as `0x${string}`,
    decimals: 6,
    symbol: "EURC",
    name: "Euro",
  },
} as const;

export const CONTRACTS = {
  LUNEX_SWAP_POOL: "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8" as `0x${string}`,
  LUNEX_LP: "0x090BBEb2690eC75633f1804865D99a3143DB8042" as `0x${string}`,
  LUNE_VAULT_USDC: "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496" as `0x${string}`,
  LUNE_VAULT_EURC: "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713" as `0x${string}`,
  LUNEX_LIMIT_ORDER_KEEPER: "0x206D5E8f126ba083b8274fd46834801aF8CB9451" as `0x${string}`,
  LUNEX_STREAM: "0x131212B79e47C94Bce428509B4372EA85Be7B304" as `0x${string}`,
  LUNEX_NATIVE_TOP_UP_RELAYER: "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64" as `0x${string}`,
} as const;

export const TOKEN_INDEX: Record<string, number> = { USDC: 0, EURC: 1 };

export const EXPLORER_URL = "https://testnet.arcscan.app";
export const getExplorerTxUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const getExplorerAddressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;

// Circle wallets (passkey + email/PIN) are the primary app login. For the Gateway
// (and cross-chain bridge) we need a real multi-chain EOA, so wagmi uses
// RainbowKit's connector set — injected + WalletConnect (mobile QR) — via
// getDefaultConfig. The WalletConnect projectId is a public, non-secret value
// (it ships in the bundle); read from env, with the registered id as a fallback.
const WC_PROJECT_ID =
  (import.meta as { env?: Record<string, string> }).env?.VITE_WALLETCONNECT_PROJECT_ID ||
  "f0d6f8162be1beccf221b4e2f8bd7026";

// RainbowKit wallets (injected/MetaMask via EIP-6963 + WalletConnect QR for
// mobile) built with connectorsForWallets. We compose the wagmi config by hand
// (instead of getDefaultConfig) so the connector list is explicit; RainbowKit's
// RainbowKitProvider + useConnectModal still work against it.
const rainbowConnectors = connectorsForWallets(
  [
    {
      groupName: "Connect a wallet",
      wallets: [injectedWallet, metaMaskWallet, walletConnectWallet],
    },
  ],
  { appName: "Lunex", projectId: WC_PROJECT_ID },
);

export const wagmiConfig = createConfig({
  chains: [arcTestnet, viemBaseSepolia, sepolia, arbitrumSepolia, avalancheFuji, polygonAmoy],
  connectors: rainbowConnectors,
  transports: {
    [arcTestnet.id]: http(),
    [viemBaseSepolia.id]: http(),
    [sepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [avalancheFuji.id]: http(),
    [polygonAmoy.id]: http(),
  },
  ssr: false,
});
