import { network } from "hardhat";

const DEFAULT_KEEPER = "0x206D5E8f126ba083b8274fd46834801aF8CB9451";

function parseOrderIds() {
  const raw = process.env.ORDER_IDS || "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => BigInt(value));
}

async function main() {
  const { ethers } = await network.create();
  const keeperAddress = process.env.LUNEX_LIMIT_ORDER_KEEPER || DEFAULT_KEEPER;
  const orderIds = parseOrderIds();

  if (orderIds.length === 0) {
    throw new Error("Set ORDER_IDS as a comma-separated list, e.g. ORDER_IDS=1,2,3");
  }

  const keeper = await ethers.getContractAt("LunexLimitOrderKeeper", keeperAddress);

  for (const orderId of orderIds) {
    const [executable, quote, rateE18] = await keeper.canExecute(orderId);
    console.log(
      `order=${orderId.toString()} executable=${executable} quote=${quote.toString()} rateE18=${rateE18.toString()}`
    );

    if (!executable) continue;

    const tx = await keeper.executeOrder(orderId);
    console.log(`execute tx=${tx.hash}`);
    await tx.wait();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
