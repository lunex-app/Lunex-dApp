// Contract address set via VITE_AGENT_EXECUTOR_ADDRESS in .env.local
// Agent wallet address (public) set via VITE_AGENT_WALLET_ADDRESS
export const AGENT_EXECUTOR_ADDRESS = (
  (import.meta as { env?: Record<string, string> }).env?.VITE_AGENT_EXECUTOR_ADDRESS ?? ""
) as `0x${string}`;

export const AGENT_WALLET_ADDRESS = (
  (import.meta as { env?: Record<string, string> }).env?.VITE_AGENT_WALLET_ADDRESS ?? ""
) as `0x${string}`;

export const agentExecutorAbi = [
  {
    name: "setOperator",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "op", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "rebalanceToVault",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "rebalanceToPool",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "operators",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "op", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "OperatorSet",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "op", type: "address", indexed: true },
      { name: "allowed", type: "bool", indexed: false },
    ],
  },
  {
    name: "RebalancedToVault",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "lpIn", type: "uint256", indexed: false },
      { name: "usdcDeposited", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RebalancedToPool",
    type: "event",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "sharesIn", type: "uint256", indexed: false },
      { name: "lpOut", type: "uint256", indexed: false },
    ],
  },
] as const;
