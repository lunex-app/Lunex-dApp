import { defineChain } from "viem";

export const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
  },
  testnet: true,
});

export type BridgeChainKey = "base" | "arc" | "ethereum" | "arbitrum" | "avalanche" | "polygon";

export interface BridgeChainConfig {
  key: BridgeChainKey;
  label: string;
  circleName: string;
  domain: number;
  chainId: number;
  nativeSymbol: string;
  usdc: `0x${string}`;
  eurc?: `0x${string}`;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  rpcUrl: string;
  usdcDecimals: number;
  explorerUrl: string;
  topUpRelayer?: `0x${string}`;
}

export const bridgeViemChains = {
  ethereum: defineChain({
    id: 11155111,
    name: "Ethereum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://eth-sepolia.public.blastapi.io"] } },
    blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
    testnet: true,
  }),
  avalanche: defineChain({
    id: 43113,
    name: "Avalanche Fuji",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    rpcUrls: { default: { http: ["https://avalanche-fuji-c-chain-rpc.publicnode.com"] } },
    blockExplorers: { default: { name: "Snowtrace", url: "https://testnet.snowtrace.io" } },
    testnet: true,
  }),
  arbitrum: defineChain({
    id: 421614,
    name: "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://sepolia-rollup.arbitrum.io/rpc"] } },
    blockExplorers: { default: { name: "Arbiscan", url: "https://sepolia.arbiscan.io" } },
    testnet: true,
  }),
  base: defineChain({
    id: 84532,
    name: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://base-sepolia-rpc.publicnode.com"] } },
    blockExplorers: { default: { name: "BaseScan", url: "https://sepolia.basescan.org" } },
    testnet: true,
  }),
  polygon: defineChain({
    id: 80002,
    name: "Polygon Amoy",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc-amoy.polygon.technology"] } },
    blockExplorers: { default: { name: "PolygonScan", url: "https://amoy.polygonscan.com" } },
    testnet: true,
  }),
  arc: defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
    blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
    testnet: true,
  }),
} as const satisfies Record<BridgeChainKey, ReturnType<typeof defineChain>>;

export const LUNEX_TREASURY = "0xC81b2328f7f04DC667428DA9a84CE627338873fd" as `0x${string}`;

const SANDBOX_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const SANDBOX_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

export const BRIDGE_CHAINS: Record<BridgeChainKey, BridgeChainConfig> = {
  ethereum: {
    key: "ethereum",
    label: "Ethereum Sepolia",
    circleName: "Ethereum_Sepolia",
    domain: 0,
    chainId: 11155111,
    nativeSymbol: "ETH",
    usdc: "0x1c7D4B196Cb0232b3044b337424Aa9603bc1681C",
    eurc: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://eth-sepolia.public.blastapi.io", // More reliable RPC
    usdcDecimals: 6,
    explorerUrl: "https://sepolia.etherscan.io",
  },
  avalanche: {
    key: "avalanche",
    label: "Avalanche Fuji",
    circleName: "Avalanche_Fuji",
    domain: 1,
    chainId: 43113,
    nativeSymbol: "AVAX",
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
    eurc: "0x5E44db7996c682E92a960b65AC713a54AD815c6B",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    usdcDecimals: 6,
    explorerUrl: "https://testnet.snowtrace.io",
  },
  arbitrum: {
    key: "arbitrum",
    label: "Arbitrum Sepolia",
    circleName: "Arbitrum_Sepolia",
    domain: 3,
    chainId: 421614,
    nativeSymbol: "ETH",
    usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
    usdcDecimals: 6,
    explorerUrl: "https://sepolia.arbiscan.io",
  },
  base: {
    key: "base",
    label: "Base Sepolia",
    circleName: "Base_Sepolia",
    domain: 6,
    chainId: 84532,
    nativeSymbol: "ETH",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    eurc: "0x808456652fdb597867f38412077A9182bf77359F",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://base-sepolia-rpc.publicnode.com",
    usdcDecimals: 6,
    explorerUrl: "https://sepolia.basescan.org",
    topUpRelayer: "0x143017eDF21B9e00dc2e30748A4e331513912868",
  },
  polygon: {
    key: "polygon",
    label: "Polygon Amoy",
    circleName: "Polygon_Amoy_Testnet",
    domain: 7,
    chainId: 80002,
    nativeSymbol: "POL",
    usdc: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://rpc-amoy.polygon.technology",
    usdcDecimals: 6,
    explorerUrl: "https://amoy.polygonscan.com",
  },
  arc: {
    key: "arc",
    label: "Arc Testnet",
    circleName: "Arc_Testnet",
    domain: 26,
    chainId: 5042002,
    nativeSymbol: "USDC",
    usdc: "0x3600000000000000000000000000000000000000",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://rpc.testnet.arc.network",
    usdcDecimals: 6,
    explorerUrl: "https://testnet.arcscan.app",
    topUpRelayer: "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64",
  },
};

export const BRIDGE_CHAIN_KEYS = Object.keys(BRIDGE_CHAINS) as BridgeChainKey[];
export const GATEWAY_CHAIN_KEYS = BRIDGE_CHAIN_KEYS;
export const GATEWAY_CIRCLE_CHAINS = GATEWAY_CHAIN_KEYS.map((key) => BRIDGE_CHAINS[key].circleName);

export const IRIS_API_URL = "https://iris-api-sandbox.circle.com";
export const FORWARDING_SERVICE_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as `0x${string}`;

export const getExplorerTxUrl = (chain: BridgeChainKey, hash: string) =>
  `${BRIDGE_CHAINS[chain].explorerUrl}/tx/${hash}`;

export const TOKEN_MESSENGER_ABI = [
  {
    name: "depositForBurn",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
  {
    name: "depositForBurnWithHook",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
  {
    name: "receiveMessage",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "usedMessages",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "messageHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const MESSAGE_SENT_EVENT_ABI = [
  {
    name: "MessageSent",
    type: "event",
    inputs: [{ name: "message", type: "bytes", indexed: false }],
  },
] as const;
