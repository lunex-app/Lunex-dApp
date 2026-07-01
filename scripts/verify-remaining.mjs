/**
 * Verify the remaining unverified contracts (twins + path-fixed versions).
 */
import { readFileSync } from "fs";

const API_URL   = "https://testnet.arcscan.app/api";
const COMPILER  = "v0.8.24+commit.e11b9ed9";
const SETTINGS  = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  outputSelection: { "*": { "*": ["abi","evm.bytecode","evm.deployedBytecode"] } },
};

const lpTokenSrc     = readFileSync("contracts/LunexLPToken.sol", "utf8");
const stableSwapSrc  = readFileSync("contracts/LunexStableSwap.sol", "utf8");
const limitOrderSrc  = readFileSync("contracts/LunexLimitOrderKeeper.sol", "utf8");
const streamSrc      = readFileSync("contracts/LunexStream.sol", "utf8");
const relayerSrc     = readFileSync("contracts/LunexNativeTopUpRelayer.sol", "utf8");
const ierc20Src      = readFileSync("contracts/interfaces/IERC20.sol", "utf8");
const istableswapSrc = readFileSync("contracts/interfaces/IStableSwap.sol", "utf8");

function pad32(hex) { return hex.replace("0x","").padStart(64,"0"); }
function encodeAddress(addr) { return pad32(addr); }

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
  if (data.status !== "1") { console.log("  ✗ Submission failed:", data.result); return false; }

  const guid = data.result;
  console.log("  Submitted. GUID:", guid);

  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check  = await fetch(`${API_URL}?module=contract&action=checkverifystatus&guid=${guid}`);
    const status = await check.json();
    const result = status.result;
    console.log(`  [${i+1}] ${result}`);
    if (result === "Pass - Verified") { console.log("  ✓ Verified!"); return true; }
    if (result?.includes("Fail") || result?.includes("Already")) { console.log("  ✗", result); return false; }
  }
  return false;
}

// ── 1. LP_EURC_USDT (same source as LP_USDC_USDT) ────────────────────────────
await verify(
  "LP_EURC_USDT (LunexLPToken)",
  "0x1693084fA4CEC8abD2159F0a97eC167DF1a0fe0e",
  JSON.stringify({ language:"Solidity", sources:{ "LunexLPToken.sol":{ content: lpTokenSrc } }, settings: SETTINGS }),
  "LunexLPToken.sol", "LunexLPToken",
);

// ── 2. POOL_EURC_USDT (same source as POOL_USDC_USDT) ────────────────────────
await verify(
  "POOL_EURC_USDT (LunexStableSwap)",
  "0xF04E8D25BF97cda82147596ba887bdF793F574DD",
  JSON.stringify({ language:"Solidity", sources:{ "LunexLPToken.sol":{ content: lpTokenSrc }, "LunexStableSwap.sol":{ content: stableSwapSrc } }, settings: SETTINGS }),
  "LunexStableSwap.sol", "LunexStableSwap",
);

// ── 3. LUNEX_LIMIT_ORDER_KEEPER — fixed import paths ─────────────────────────
//  LunexLimitOrderKeeper.sol imports ./interfaces/IERC20.sol + ./interfaces/IStableSwap.sol
//  So in std-json, use key "interfaces/..." relative to contract root
await verify(
  "LUNEX_LIMIT_ORDER_KEEPER",
  "0x206D5E8f126ba083b8274fd46834801aF8CB9451",
  JSON.stringify({
    language: "Solidity",
    sources: {
      "interfaces/IERC20.sol":      { content: ierc20Src },
      "interfaces/IStableSwap.sol": { content: istableswapSrc },
      "LunexLimitOrderKeeper.sol":  { content: limitOrderSrc },
    },
    settings: SETTINGS,
  }),
  "LunexLimitOrderKeeper.sol",
  "LunexLimitOrderKeeper",
  encodeAddress("0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8"), // pool = LUNEX_SWAP_POOL
);

// ── 4. LUNEX_STREAM — fixed import paths ─────────────────────────────────────
await verify(
  "LUNEX_STREAM",
  "0x131212B79e47C94Bce428509B4372EA85Be7B304",
  JSON.stringify({
    language: "Solidity",
    sources: {
      "interfaces/IERC20.sol": { content: ierc20Src },
      "LunexStream.sol":       { content: streamSrc },
    },
    settings: SETTINGS,
  }),
  "LunexStream.sol",
  "LunexStream",
);

// ── 5. LUNEX_NATIVE_TOP_UP_RELAYER — fixed import paths ──────────────────────
await verify(
  "LUNEX_NATIVE_TOP_UP_RELAYER",
  "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64",
  JSON.stringify({
    language: "Solidity",
    sources: {
      "interfaces/IERC20.sol":      { content: ierc20Src },
      "LunexNativeTopUpRelayer.sol": { content: relayerSrc },
    },
    settings: SETTINGS,
  }),
  "LunexNativeTopUpRelayer.sol",
  "LunexNativeTopUpRelayer",
  encodeAddress("0xC81b2328f7f04dc667428da9a84ce627338873fd"), // treasury
);
