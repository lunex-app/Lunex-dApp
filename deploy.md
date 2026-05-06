# Lunex Protocol — Smart Contract Deployment Guide (Arc Testnet)

## Overview

Lunex Protocol requires **4 smart contracts** to be deployed on the **Arc Network Testnet** (Chain ID: `5042002`).

| # | Contract | Standard | Purpose |
|---|----------|----------|---------|
| 1 | `StableSwapPool` | Custom (Curve-style) | AMM for USDC ↔ EURC swaps with low slippage |
| 2 | `LunexLP` | ERC-20 | LP token minted/burned on add/remove liquidity |
| 3 | `LuneUSDC Vault` | ERC-4626 | Auto-compounding yield vault for USDC deposits |
| 4 | `LuneEURC Vault` | ERC-4626 | Auto-compounding yield vault for EURC deposits |

---

## Pre-deployed Token Addresses (Arc Testnet)

| Token | Address | Decimals |
|-------|---------|----------|
| USDC (native gas) | `0x3600000000000000000000000000000000000000` | 6 |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 |

---

## Contract #1 — StableSwapPool

**Type:** Curve-style StableSwap AMM  
**Tokens:** USDC (index 0), EURC (index 1)

### Constructor Parameters

| Parameter | Type | Suggested Value | Description |
|-----------|------|-----------------|-------------|
| `coins` | `address[2]` | `[USDC_ADDR, EURC_ADDR]` | Token pair |
| `A` | `uint256` | `200` | Amplification coefficient |
| `fee` | `uint256` | `4000000` | Swap fee (0.04% = 4e6 / 1e10) |
| `admin` | `address` | Deployer wallet | Admin for fee collection |

### Required Functions

```solidity
function exchange(uint256 i, uint256 j, uint256 dx, uint256 minDy) external returns (uint256 dy);
function get_dy(uint256 i, uint256 j, uint256 dx) external view returns (uint256);
function add_liquidity(uint256[2] calldata amounts, uint256 minMintAmount) external returns (uint256);
function remove_liquidity(uint256 amount, uint256[2] calldata minAmounts) external returns (uint256[2]);
function remove_liquidity_one_coin(uint256 amount, uint256 i, uint256 minAmount) external returns (uint256);
function calc_token_amount(uint256[2] calldata amounts, bool isDeposit) external view returns (uint256);
function balances(uint256 i) external view returns (uint256);
```

---

## Contract #2 — LunexLP (LP Token)

**Type:** Standard ERC-20  
**Symbol:** `lunex-UE-LP`  
**Name:** `Lunex USDC/EURC LP Token`  
**Decimals:** 18

> This token is minted by the StableSwapPool on `add_liquidity` and burned on `remove_liquidity`. The pool contract must have `MINTER_ROLE` or be set as the owner of this token.

---

## Contract #3 — LuneUSDC Vault

**Type:** ERC-4626 Tokenized Vault  
**Asset:** USDC (`0x3600000000000000000000000000000000000000`)  
**Share Token Symbol:** `luneUSDC`  
**Share Token Name:** `Lunex USDC Vault`

### Constructor Parameters

| Parameter | Type | Value |
|-----------|------|-------|
| `asset` | `address` | USDC address |
| `name` | `string` | `"Lunex USDC Vault"` |
| `symbol` | `string` | `"luneUSDC"` |

### Required Functions (ERC-4626)

```solidity
function deposit(uint256 assets, address receiver) external returns (uint256 shares);
function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
function convertToShares(uint256 assets) external view returns (uint256);
function convertToAssets(uint256 shares) external view returns (uint256);
function totalAssets() external view returns (uint256);
function maxDeposit(address receiver) external view returns (uint256);
```

---

## Contract #4 — LuneEURC Vault

**Type:** ERC-4626 Tokenized Vault  
**Asset:** EURC (`0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`)  
**Share Token Symbol:** `luneEURC`  
**Share Token Name:** `Lunex EURC Vault`

Same constructor and function interface as Contract #3, but with EURC as the underlying asset.

---

## Deployment Order

1. Deploy **LunexLP** (ERC-20 LP token)
2. Deploy **StableSwapPool** with `coins = [USDC, EURC]` and LP token address
3. Set StableSwapPool as minter on LunexLP
4. Deploy **LuneUSDC Vault** with USDC as asset
5. Deploy **LuneEURC Vault** with EURC as asset

---

## Post-Deployment Steps

1. **Update `src/config/wagmi.ts`** with the deployed addresses:

```typescript
export const CONTRACTS = {
  STABLE_SWAP_POOL: "0x...", // StableSwapPool address
  LP_TOKEN: "0x...",         // LunexLP address
  VAULT_USDC: "0x...",       // LuneUSDC Vault address
  VAULT_EURC: "0x...",       // LuneEURC Vault address
};
```

2. **Seed initial liquidity** by calling `add_liquidity` with equal USDC/EURC amounts
3. **Verify contracts** on [ArcScan Testnet](https://testnet.arcscan.app)

---

## Network Configuration

| Property | Value |
|----------|-------|
| Network Name | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Block Explorer | `https://testnet.arcscan.app` |
| Native Currency | USDC (18 decimals) |

---

## Tools for Deployment

- **Hardhat** or **Foundry** with Arc Testnet RPC
- **ArcScan** for contract verification
- Example Hardhat config:

```javascript
module.exports = {
  networks: {
    arcTestnet: {
      url: "https://rpc.testnet.arc.network",
      chainId: 5042002,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
};
```
