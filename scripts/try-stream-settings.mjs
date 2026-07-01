import { readFileSync } from "fs";
const streamSrc = readFileSync("contracts/LunexStream.sol","utf8");
const ierc20Src = readFileSync("contracts/interfaces/IERC20.sol","utf8");
const API = "https://testnet.arcscan.app/api";
const sel = {"*":{"*":["abi","evm.bytecode","evm.deployedBytecode"]}};

const VARIANTS = [
  { label:"0.8.24 noOpt noIR", compiler:"v0.8.24+commit.e11b9ed9", settings:{optimizer:{enabled:false,runs:200},outputSelection:sel} },
  { label:"0.8.24 opt noIR",   compiler:"v0.8.24+commit.e11b9ed9", settings:{optimizer:{enabled:true,runs:200},outputSelection:sel} },
  { label:"0.8.31 noOpt noIR", compiler:"v0.8.31+commit.fd3a2265", settings:{optimizer:{enabled:false,runs:200},outputSelection:sel} },
  { label:"0.8.31 opt noIR",   compiler:"v0.8.31+commit.fd3a2265", settings:{optimizer:{enabled:true,runs:200},outputSelection:sel} },
];

for (const v of VARIANTS) {
  const sourceJson = JSON.stringify({
    language:"Solidity",
    sources:{"interfaces/IERC20.sol":{content:ierc20Src},"LunexStream.sol":{content:streamSrc}},
    settings:v.settings,
  });
  const params = new URLSearchParams({
    module:"contract", action:"verifysourcecode",
    contractaddress:"0x131212B79e47C94Bce428509B4372EA85Be7B304",
    sourceCode:sourceJson, codeformat:"solidity-standard-json-input",
    contractname:"LunexStream.sol:LunexStream", compilerversion:v.compiler,
    constructorArguements:"", licenseType:"3",
  });
  const res = await fetch(API,{method:"POST",body:params});
  const d = await res.json();
  console.log(v.label,"→", d.status, d.result?.slice(0,60));
  if (d.status==="1") {
    await new Promise(r=>setTimeout(r,6000));
    const check = await fetch(`${API}?module=contract&action=checkverifystatus&guid=${d.result}`);
    const s = await check.json();
    console.log("  RESULT:", s.result);
    if (s.result==="Pass - Verified") { console.log("✓ Verified with:", v.label); break; }
  }
  await new Promise(r=>setTimeout(r,2000));
}
