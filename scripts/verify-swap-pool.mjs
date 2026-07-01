/**
 * Attempt to verify the existing LUNEX_SWAP_POOL at 0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8
 * with the LunexSwapPool.sol source using v0.8.31 + no optimizer (same settings as
 * LUNEX_LP and LUNE_VAULT_USDC that are already verified).
 *
 * If that fails, try with v0.8.24 viaIR+optimizer (current hardhat settings).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const ROOT  = resolve(__dir, "..");
const OZ    = join(ROOT, "node_modules/@openzeppelin/contracts");

const API      = "https://testnet.arcscan.app/api";
const CONTRACT = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";

// ── Recursively collect all transitive imports ───────────────────────────────
const sources = {};

function resolveOzPath(importPath) {
  // "@openzeppelin/contracts/foo/bar.sol" → OZ/foo/bar.sol
  return join(ROOT, "node_modules", importPath);
}

function collectImports(filePath, virtualKey) {
  if (sources[virtualKey]) return;
  const content = readFileSync(filePath, "utf8");
  sources[virtualKey] = { content };

  const importRe = /^\s*import\s+(?:{[^}]*}\s+from\s+)?["']([^"']+)["']/gm;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const imp = m[1];
    if (imp.startsWith("@openzeppelin/")) {
      const absPath   = resolveOzPath(imp);
      const virtKey   = imp; // keep as "@openzeppelin/..." in sources
      collectImports(absPath, virtKey);
    } else if (!imp.startsWith("http")) {
      // relative import — resolve from current file's directory
      const absPath = resolve(dirname(filePath), imp);
      const virtKey = virtualKey.replace(/\/[^/]+$/, "/") + imp.replace(/^\.\//,"");
      if (existsSync(absPath)) collectImports(absPath, virtKey);
    }
  }
}

const mainFile = join(ROOT, "contracts/LunexSwapPool.sol");
collectImports(mainFile, "LunexSwapPool.sol");

console.log("Collected", Object.keys(sources).length, "source files");

const sel = { "*": { "*": ["abi","evm.bytecode","evm.deployedBytecode"] } };

// ── ABI encoding for constructor args ────────────────────────────────────────
// constructor(address[2] _coins, uint256 _A, uint256 _fee, address _admin)
// ABI-encoding for (address[2], uint256, uint256, address):
// All static: 32+32+32+32+32+32 bytes (array is inline fixed-size)
function pad32(hex) { return hex.replace("0x","").toLowerCase().padStart(64,"0"); }

// From the existing pool: read coin0, coin1, A, fee, feeReceiver
// (we'll query them below and encode)
async function readState() {
  const RPC = "https://rpc.testnet.arc.network";
  async function call(selector) {
    const r = await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:CONTRACT,data:selector},"latest"]})});
    return (await r.json()).result;
  }
  const coin0Raw = await call("0xd3e65c4f"); // coin0()
  const coin1Raw = await call("0x1d415db7"); // coin1()
  const aRaw     = await call("0xf446c1d0"); // A() — but A includes A_PREC factor
  const feeRaw   = await call("0xddca3f43"); // fee()
  const adminRaw = await call("0x46904840"); // feeReceiver()

  const decodeAddr = h => "0x" + (h ?? "").slice(-40);
  const decodeUint = h => BigInt("0x" + (h ?? "0").replace("0x",""));

  return {
    coin0:      decodeAddr(coin0Raw),
    coin1:      decodeAddr(coin1Raw),
    A_stored:   decodeUint(aRaw),       // stored as A * A_PREC (100)
    fee:        decodeUint(feeRaw),
    feeReceiver: decodeAddr(adminRaw),
  };
}

const state = await readState();
console.log("Pool state:");
console.log("  coin0:", state.coin0);
console.log("  coin1:", state.coin1);
console.log("  A (stored, *100):", state.A_stored.toString(), " → A arg:", (state.A_stored / 100n).toString());
console.log("  fee:", state.fee.toString());
console.log("  feeReceiver:", state.feeReceiver);

// ABI-encode constructor args for (address[2] memory _coins, uint256 _A, uint256 _fee, address _admin)
// Fixed-size array (address[2]) is encoded inline (two 32-byte slots)
const constructorArgs =
  pad32(state.coin0) +        // _coins[0]
  pad32(state.coin1) +        // _coins[1]
  pad32((state.A_stored / 100n).toString(16)) + // _A (un-scaled)
  pad32(state.fee.toString(16)) +               // _fee
  pad32(state.feeReceiver);                     // _admin

console.log("\nConstructor args hex:", constructorArgs.slice(0,40), "...");

// ── Try verification with different settings ──────────────────────────────────
async function verify(label, compiler, settings) {
  console.log(`\n── Trying ${label} ──`);
  const sourceJson = JSON.stringify({ language:"Solidity", sources, settings });
  const params = new URLSearchParams({
    module:"contract", action:"verifysourcecode",
    contractaddress: CONTRACT,
    sourceCode: sourceJson,
    codeformat: "solidity-standard-json-input",
    contractname: "LunexSwapPool.sol:LunexSwapPool",
    compilerversion: compiler,
    constructorArguements: constructorArgs,
    licenseType: "3",
  });
  const res  = await fetch(API, { method:"POST", body:params });
  const data = await res.json();
  if (data.status !== "1") { console.log("  ✗ Submission:", data.result); return false; }
  console.log("  Submitted. GUID:", data.result);
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await fetch(`${API}?module=contract&action=checkverifystatus&guid=${data.result}`);
    const s = await check.json();
    console.log(`  [${i+1}] ${s.result}`);
    if (s.result === "Pass - Verified") { console.log("  ✓ Verified!"); return true; }
    if (s.result?.includes("Fail") || s.result?.includes("Already")) { return false; }
  }
  return false;
}

const ok1 = await verify(
  "v0.8.31 no-optimizer",
  "v0.8.31+commit.fd3a2265",
  { optimizer:{enabled:false,runs:200}, outputSelection:sel },
);

if (!ok1) {
  await verify(
    "v0.8.24 viaIR+optimizer",
    "v0.8.24+commit.e11b9ed9",
    { optimizer:{enabled:true,runs:200}, viaIR:true, outputSelection:sel },
  );
}
