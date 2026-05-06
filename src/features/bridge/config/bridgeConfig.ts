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
  domain: number;
  chainId: number;
  usdc: `0x${string}`;
  eurc?: `0x${string}`;
  tokenMessenger: `0x${string}`;
  messageTransmitter: `0x${string}`;
  rpcUrl: string;
  usdcDecimals: number;
  explorerUrl: string;
}

const SANDBOX_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
const SANDBOX_MESSAGE_TRANSMITTER = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";

export const BRIDGE_CHAINS: Record<BridgeChainKey, BridgeChainConfig> = {
  ethereum: {
    key: "ethereum",
    label: "Ethereum Sepolia",
    domain: 0,
    chainId: 11155111,
    usdc: "0x1c7D4B196Cb0232b3044b337424Aa9603bc1681C",
    eurc: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    usdcDecimals: 6,
    explorerUrl: "https://sepolia.etherscan.io",
  },
  avalanche: {
    key: "avalanche",
    label: "Avalanche Fuji",
    domain: 1,
    chainId: 43113,
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
    domain: 3,
    chainId: 421614,
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
    domain: 6,
    chainId: 84532,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    eurc: "0x808456652fdb597867f38412077A9182bf77359F",
    tokenMessenger: SANDBOX_TOKEN_MESSENGER,
    messageTransmitter: SANDBOX_MESSAGE_TRANSMITTER,
    rpcUrl: "https://base-sepolia-rpc.publicnode.com",
    usdcDecimals: 6,
    explorerUrl: "https://sepolia.basescan.org",
  },
  polygon: {
    key: "polygon",
    label: "Polygon Amoy",
    domain: 7,
    chainId: 80002,
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
    domain: 26,
    chainId: 5042002,
    usdc: "0x3600000000000000000000000000000000000000",
    tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    messageTransmitter: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    rpcUrl: "https://rpc.testnet.arc.network",
    usdcDecimals: 6,
    explorerUrl: "https://testnet.arcscan.app",
  },
};

export const BRIDGE_CHAIN_KEYS = Object.keys(BRIDGE_CHAINS) as BridgeChainKey[];

export const IRIS_API_URL = "https://iris-api-sandbox.circle.com";

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
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
