/**
 * Batch verification of unverified Lunex contracts on ArcScan (Blockscout).
 * All contracts compiled with: solc v0.8.24+commit.e11b9ed9, viaIR true, optimizer enabled runs 200.
 */
import { readFileSync } from "fs";

const API_URL   = "https://testnet.arcscan.app/api";
const COMPILER  = "v0.8.24+commit.e11b9ed9";
const SETTINGS  = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  outputSelection: { "*": { "*": ["abi","evm.bytecode","evm.deployedBytecode"] } },
};

// ── Source files ────────────────────────────────────────────────────────────
const lpTokenSrc      = readFileSync("contracts/LunexLPToken.sol", "utf8");
const stableSwapSrc   = readFileSync("contracts/LunexStableSwap.sol", "utf8");
const luneVaultSrc    = readFileSync("contracts/LuneVault.sol", "utf8");
const limitOrderSrc   = readFileSync("contracts/LunexLimitOrderKeeper.sol", "utf8");
const streamSrc       = readFileSync("contracts/LunexStream.sol", "utf8");
const relayerSrc      = readFileSync("contracts/LunexNativeTopUpRelayer.sol", "utf8");
const usdtSrc         = readFileSync("contracts/LunexUSDT.sol", "utf8");
const ierc20Src       = readFileSync("contracts/interfaces/IERC20.sol", "utf8");
const istableswapSrc  = readFileSync("contracts/interfaces/IStableSwap.sol", "utf8");

// ── ABI encoder helpers ──────────────────────────────────────────────────────
function pad32(hex) { return hex.replace("0x","").padStart(64,"0"); }
function encodeAddress(addr) { return pad32(addr); }
function encodeUint(n) { return BigInt(n).toString(16).padStart(64,"0"); }
function encodeString(str) {
  const bytes = Buffer.from(str,"utf8");
  const lenHex = encodeUint(bytes.length);
  const dataHex = bytes.toString("hex").padEnd(Math.ceil(bytes.length/32)*64,"0");
  return lenHex + dataHex;
}

function encodeArgs(...args) {
  // Two-pass: build head (static slots and offsets), then tail (dynamic data)
  let head = "";
  let tail = "";
  const headSize = args.length * 32;
  for (const arg of args) {
    if (arg.type === "address") {
      head += encodeAddress(arg.value);
    } else if (arg.type === "uint256") {
      head += encodeUint(arg.value);
    } else if (arg.type === "string") {
      head += encodeUint(headSize + tail.length / 2);
      tail += encodeString(arg.value);
    }
  }
  return head + tail;
}

// ── Build standard JSON input ─────────────────────────────────────────────────
function stdJson(sources, contractPath, contractName, settings = SETTINGS) {
  return JSON.stringify({
    language: "Solidity",
    sources,
    settings,
  });
}

// ── Submit verification ───────────────────────────────────────────────────────
async function verify(label, address, sourceJson, contractPath, contractName, constructorArgs = "") {
  console.log(`\n── Verifying ${label} (${address}) ──`);
  const params = new URLSearchParams({
    module:              "contract",
    action:              "verifysourcecode",
    contractaddress:     address,
    sourceCode:          sourceJson,
    codeformat:          "solidity-standard-json-input",
    contractname:        `${contractPath}:${contractName}`,
    compilerversion:     COMPILER,
    constructorArguements: constructorArgs,
    licenseType:         "3",
  });

  const res  = await fetch(API_URL, { method: "POST", body: params });
  const data = await res.json();
  if (data.status !== "1") {
    console.log("  ✗ Submission failed:", data.result);
    return false;
  }

  const guid = data.result;
  console.log("  Submitted. GUID:", guid);

  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check  = await fetch(`${API_URL}?module=contract&action=checkverifystatus&guid=${guid}`);
    const status = await check.json();
    const result = status.result;
    console.log(`  [${i+1}] ${result}`);
    if (result === "Pass - Verified") { console.log("  ✓ Verified!"); return true; }
    if (result?.includes("Fail") || result?.includes("Already")) {
      console.log("  ✗", result); return false;
    }
  }
  console.log("  ? Timed out");
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LP_USDC_USDT (LunexLPToken) — no immutables, no args
//    Also auto-verifies LP_EURC_USDT (same bytecode)
// ─────────────────────────────────────────────────────────────────────────────
await verify(
  "LP_USDC_USDT (LunexLPToken)",
  "0x360427f34b3FC6Bbbf79E32879533136BF7d84Cf",
  stdJson({ "LunexLPToken.sol": { content: lpTokenSrc } }),
  "LunexLPToken.sol",
  "LunexLPToken",
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. POOL_USDC_USDT (LunexStableSwap) — no immutables, no args
//    Also auto-verifies POOL_EURC_USDT (same bytecode)
// ─────────────────────────────────────────────────────────────────────────────
await verify(
  "POOL_USDC_USDT (LunexStableSwap)",
  "0x8e60d788955CaBb247D2c003C77AdAF44C566cD3",
  stdJson({
    "LunexLPToken.sol":    { content: lpTokenSrc },
    "LunexStableSwap.sol": { content: stableSwapSrc },
  }),
  "LunexStableSwap.sol",
  "LunexStableSwap",
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. LUNE_VAULT_USDT (LuneVault) — immutable `asset` → need constructor args
//    Args: (address asset_, string name_, string symbol_, address owner_)
//          USDT=0x59125072..., "Lunex USDT Vault", "luneUSDT", owner=0xC81b...
// ─────────────────────────────────────────────────────────────────────────────
const vaultUsdtArgs = encodeArgs(
  { type: "address", value: "0x59125072f5692DdF22c99514805D1232C3999646" },
  { type: "string",  value: "Lunex USDT Vault" },
  { type: "string",  value: "luneUSDT" },
  { type: "address", value: "0xC81b2328f7f04dc667428da9a84ce627338873fd" },
);
await verify(
  "LUNE_VAULT_USDT (LuneVault)",
  "0x60810D1a8b40B78EA82Ea16CA356DE7eD9eb19dD",
  stdJson({ "LuneVault.sol": { content: luneVaultSrc } }),
  "LuneVault.sol",
  "LuneVault",
  vaultUsdtArgs,
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. LUNEX_LIMIT_ORDER_KEEPER — immutable `pool` → need constructor arg
//    Args: (address pool_) = LUNEX_SWAP_POOL
// ─────────────────────────────────────────────────────────────────────────────
const lokArgs = encodeArgs(
  { type: "address", value: "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8" },
);
await verify(
  "LUNEX_LIMIT_ORDER_KEEPER",
  "0x206D5E8f126ba083b8274fd46834801aF8CB9451",
  stdJson({
    "contracts/interfaces/IERC20.sol":      { content: ierc20Src },
    "contracts/interfaces/IStableSwap.sol": { content: istableswapSrc },
    "LunexLimitOrderKeeper.sol":            { content: limitOrderSrc },
  }),
  "LunexLimitOrderKeeper.sol",
  "LunexLimitOrderKeeper",
  lokArgs,
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. USDT_TOKEN (LunexUSDT) — no immutables, no args needed
// ─────────────────────────────────────────────────────────────────────────────
await verify(
  "USDT_TOKEN (LunexUSDT)",
  "0x59125072f5692DdF22c99514805D1232C3999646",
  stdJson({ "LunexUSDT.sol": { content: usdtSrc } }),
  "LunexUSDT.sol",
  "LunexUSDT",
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. LUNEX_STREAM (LunexStream) — try with current settings (may not match)
// ─────────────────────────────────────────────────────────────────────────────
await verify(
  "LUNEX_STREAM",
  "0x131212B79e47C94Bce428509B4372EA85Be7B304",
  stdJson({
    "contracts/interfaces/IERC20.sol": { content: ierc20Src },
    "LunexStream.sol":                 { content: streamSrc },
  }),
  "LunexStream.sol",
  "LunexStream",
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. LUNEX_NATIVE_TOP_UP_RELAYER — try (large size mismatch, may fail)
// ─────────────────────────────────────────────────────────────────────────────
const relayerArgs = encodeArgs(
  { type: "address", value: "0xC81b2328f7f04dc667428da9a84ce627338873fd" },
);
await verify(
  "LUNEX_NATIVE_TOP_UP_RELAYER",
  "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64",
  stdJson({
    "contracts/interfaces/IERC20.sol":     { content: ierc20Src },
    "LunexNativeTopUpRelayer.sol":          { content: relayerSrc },
  }),
  "LunexNativeTopUpRelayer.sol",
  "LunexNativeTopUpRelayer",
  relayerArgs,
);

console.log("\n\nNote: LUNEX_SWAP_POOL (0xC24BFc...) uses a larger/different implementation (12725 bytes)");
console.log("and LP_EURC_USDT / POOL_EURC_USDT should auto-verify as twins of the above.");
