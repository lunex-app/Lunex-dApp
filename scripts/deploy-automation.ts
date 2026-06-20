import { network } from "hardhat";

const LUNEX_SWAP_POOL = "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8";
const LUNEX_TREASURY = "0xC81b2328f7f04DC667428DA9a84CE627338873fd";

async function main() {
  const { ethers } = await network.create();

  const LimitOrderKeeper = await ethers.getContractFactory("LunexLimitOrderKeeper");
  const keeper = await LimitOrderKeeper.deploy(LUNEX_SWAP_POOL);
  await keeper.waitForDeployment();

  const Stream = await ethers.getContractFactory("LunexStream");
  const stream = await Stream.deploy();
  await stream.waitForDeployment();

  const TopUpRelayer = await ethers.getContractFactory("LunexNativeTopUpRelayer");
  const relayer = await TopUpRelayer.deploy(LUNEX_TREASURY);
  await relayer.waitForDeployment();

  console.log("LunexLimitOrderKeeper", await keeper.getAddress());
  console.log("LunexStream", await stream.getAddress());
  console.log("LunexNativeTopUpRelayer", await relayer.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
