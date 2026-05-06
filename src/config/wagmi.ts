import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { baseSepolia as viemBaseSepolia, sepolia, arbitrumSepolia, avalancheFuji, polygonAmoy } from "viem/chains";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://arc-testnet.g.alchemy.com/v2/p5FjSqrtO_veTslnfRbDr",
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
  LUNEX_LP: "0x9fD18A3dCbcb8238f7426E888bA73aFfbF9F3b69" as `0x${string}`,
  LUNE_VAULT_USDC: "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496" as `0x${string}`,
  LUNE_VAULT_EURC: "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713" as `0x${string}`,
} as const;

export const TOKEN_INDEX: Record<string, number> = { USDC: 0, EURC: 1 };

export const EXPLORER_URL = "https://testnet.arcscan.app";
export const getExplorerTxUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const getExplorerAddressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;

export const wagmiConfig = getDefaultConfig({
  appName: "Lunex Finance",
  projectId: "lunex-protocol-demo",
  chains: [arcTestnet, viemBaseSepolia, sepolia, arbitrumSepolia, avalancheFuji, polygonAmoy],
});
