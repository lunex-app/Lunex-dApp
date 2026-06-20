import { network } from "hardhat";

const LUNEX_TREASURY = "0xC81b2328f7f04DC667428DA9a84CE627338873fd";

async function main() {
  const { ethers } = await network.create();

  const TopUpRelayer = await ethers.getContractFactory("LunexNativeTopUpRelayer");
  const relayer = await TopUpRelayer.deploy(LUNEX_TREASURY);
  await relayer.waitForDeployment();

  console.log("LunexNativeTopUpRelayer", await relayer.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
