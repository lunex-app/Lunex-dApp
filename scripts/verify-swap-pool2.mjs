import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const API  = "https://testnet.arcscan.app/api";
const CONTRACT = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";

// Collect all transitive OZ imports
const sources = {};
function collectImports(filePath, virtualKey) {
  if (sources[virtualKey]) return;
  const content = readFileSync(filePath, "utf8");
  sources[virtualKey] = { content };
  const re = /^\s*import\s+(?:{[^}]*}\s+from\s+)?["']([^"']+)["']/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    const imp = m[1];
    if (imp.startsWith("@openzeppelin/")) {
      const abs = join(ROOT, "node_modules", imp);
      if (existsSync(abs)) collectImports(abs, imp);
    } else if (!imp.startsWith("http")) {
      const abs = resolve(dirname(filePath), imp);
      const vk  = virtualKey.replace(/\/[^/]+$/, "/") + imp.replace(/^\.\//,"");
      if (existsSync(abs)) collectImports(abs, vk);
    }
  }
}
collectImports(join(ROOT, "contracts/LunexSwapPool.sol"), "LunexSwapPool.sol");
console.log("Source files:", Object.keys(sources).length);

// Correct constructor args: (address[2] _coins, uint256 _A, uint256 _fee, address _admin)
// address[2] is a static fixed-size array → 2×32 bytes inline (no offset pointer)
function pad32(val) {
  return val.replace("0x","").toLowerCase().padStart(64,"0");
}
const constructorArgs =
  pad32("0x3600000000000000000000000000000000000000") +  // coin0 = USDC
  pad32("0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") +  // coin1 = EURC
  pad32((200n).toString(16)) +                            // _A = 200
  pad32((4_000_000n).toString(16)) +                      // _fee = 4000000
  pad32("0xC81b2328f7f04DC667428DA9a84CE627338873fd");    // _admin = treasury

console.log("Constructor args (first 64 chars):", constructorArgs.slice(0,64));
const sel = { "*": { "*": ["abi","evm.bytecode","evm.deployedBytecode"] } };

async function verify(label, compiler, settings) {
  console.log(`\n── ${label} ──`);
  const params = new URLSearchParams({
    module:"contract", action:"verifysourcecode",
    contractaddress: CONTRACT,
    sourceCode: JSON.stringify({ language:"Solidity", sources, settings }),
    codeformat: "solidity-standard-json-input",
    contractname: "LunexSwapPool.sol:LunexSwapPool",
    compilerversion: compiler,
    constructorArguements: constructorArgs,
    licenseType: "3",
  });
  const res  = await fetch(API, { method:"POST", body:params });
  const data = await res.json();
  if (data.status !== "1") { console.log("  ✗ Submission:", data.result); return false; }
  console.log("  GUID:", data.result);
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const s = await (await fetch(`${API}?module=contract&action=checkverifystatus&guid=${data.result}`)).json();
    console.log(`  [${i+1}] ${s.result}`);
    if (s.result === "Pass - Verified") { console.log("  ✓ Verified!"); return true; }
    if (s.result?.includes("Fail") || s.result?.includes("Already")) return false;
  }
  return false;
}

// Try both compiler settings
const ok1 = await verify("v0.8.31 no-optimizer", "v0.8.31+commit.fd3a2265",
  { optimizer:{enabled:false,runs:200}, outputSelection:sel });

if (!ok1) {
  const ok2 = await verify("v0.8.24 viaIR+optimizer", "v0.8.24+commit.e11b9ed9",
    { optimizer:{enabled:true,runs:200}, viaIR:true, outputSelection:sel });

  if (!ok2) {
    await verify("v0.8.31 opt-200", "v0.8.31+commit.fd3a2265",
      { optimizer:{enabled:true,runs:200}, outputSelection:sel });
  }
}
