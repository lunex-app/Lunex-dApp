import { network } from "hardhat";

const DEFAULT_KEEPER = "0x206D5E8f126ba083b8274fd46834801aF8CB9451";

async function main() {
  const { ethers } = await network.create();
  const keeperAddress = process.env.LUNEX_LIMIT_ORDER_KEEPER || DEFAULT_KEEPER;
  const start = BigInt(process.env.START_ORDER_ID || "1");
  const pollMs = Number(process.env.POLL_MS || "15000");

  if (!Number.isFinite(pollMs) || pollMs < 1000) {
    throw new Error("POLL_MS must be at least 1000");
  }

  const keeper = await ethers.getContractAt("LunexLimitOrderKeeper", keeperAddress);
  console.log(`keeper=${keeperAddress} start=${start.toString()} pollMs=${pollMs}`);

  for (;;) {
    const nextOrderId = await keeper.nextOrderId();
    for (let orderId = start; orderId <= nextOrderId; orderId++) {
      try {
        const order = await keeper.orders(orderId);
        if (!order.active) continue;

        const [executable, quote, rateE18] = await keeper.canExecute(orderId);
        console.log(
          `order=${orderId.toString()} active=true executable=${executable} quote=${quote.toString()} rateE18=${rateE18.toString()}`
        );

        if (!executable) continue;
        const tx = await keeper.executeOrder(orderId);
        console.log(`executed order=${orderId.toString()} tx=${tx.hash}`);
        await tx.wait();
      } catch (error: any) {
        console.error(`order=${orderId.toString()} error=${error?.shortMessage || error?.message || error}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
