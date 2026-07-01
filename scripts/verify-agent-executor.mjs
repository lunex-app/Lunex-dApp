import { readFileSync } from "fs";

const CONTRACT_ADDRESS = "0x175C815f3ba66D1aaA82fa7120728341164198E8";
const API_URL = "https://testnet.arcscan.app/api";

// Constructor args ABI-encoded: (lpToken, swapPool, vaultUsdc, usdc)
const CONSTRUCTOR_ARGS = [
  "0x090BBEb2690eC75633f1804865D99a3143DB8042", // LP_TOKEN
  "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8", // SWAP_POOL
  "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496", // VAULT_USDC
  "0x3600000000000000000000000000000000000000", // USDC
].map(a => a.toLowerCase().replace("0x","").padStart(64,"0")).join("");

const source = readFileSync("contracts/AgentExecutor.sol", "utf8");

// Build standard JSON input (supports viaIR flag)
const standardJsonInput = JSON.stringify({
  language: "Solidity",
  sources: { "AgentExecutor.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi","evm.bytecode","evm.deployedBytecode"] } },
  },
});

const params = new URLSearchParams({
  module:              "contract",
  action:              "verifysourcecode",
  contractaddress:     CONTRACT_ADDRESS,
  sourceCode:          standardJsonInput,
  codeformat:          "solidity-standard-json-input",
  contractname:        "AgentExecutor.sol:AgentExecutor",
  compilerversion:     "v0.8.24+commit.e11b9ed9",
  constructorArguements: CONSTRUCTOR_ARGS,
  licenseType:         "3",
});

console.log("Submitting verification to ArcScan...");
const res  = await fetch(API_URL, { method: "POST", body: params });
const data = await res.json();
console.log("Response:", JSON.stringify(data, null, 2));

if (data.status === "1") {
  const guid = data.result;
  console.log("\nVerification submitted. GUID:", guid);
  console.log("Polling for result...");

  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await fetch(`${API_URL}?module=contract&action=checkverifystatus&guid=${guid}`);
    const status = await check.json();
    console.log(`[${i+1}]`, status.result);
    if (status.result === "Pass - Verified") { console.log("\n✓ Contract verified!"); break; }
    if (status.result?.includes("Fail")) { console.log("\n✗ Verification failed:", status.result); break; }
  }
} else {
  console.log("Submission failed:", data.result);
}
