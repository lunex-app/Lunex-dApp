import { keccak256, solidityPacked } from "ethers";
import { network } from "hardhat";

const RELAYERS: Record<string, string> = {
  arcTestnet: "0xE718D60dAE94b1Cd3D680C9a731d9cAB60DD0A64",
  baseSepolia: "0x143017eDF21B9e00dc2e30748A4e331513912868",
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const connection = await network.create();
  const { ethers } = connection;
  const networkName = connection.networkName;
  const relayerAddress = process.env.LUNEX_TOPUP_RELAYER || RELAYERS[networkName];
  if (!relayerAddress) throw new Error(`No relayer configured for network ${networkName}`);

  const token = required("TOKEN");
  const recipient = required("RECIPIENT");
  const recipientTokenAmount = ethers.parseUnits(process.env.RECIPIENT_TOKEN_AMOUNT || "0", 6);
  const treasuryTokenAmount = ethers.parseUnits(process.env.TREASURY_TOKEN_AMOUNT || "0", 6);
  const nativeAmount = ethers.parseEther(process.env.NATIVE_AMOUNT || "0");
  const sourceTxHash = required("SOURCE_TX_HASH");
  const requestNonce = process.env.REQUEST_NONCE || "0";

  const requestId = keccak256(
    solidityPacked(
      ["bytes32", "address", "address", "uint256", "uint256", "uint256", "uint256"],
      [sourceTxHash, token, recipient, recipientTokenAmount, treasuryTokenAmount, nativeAmount, BigInt(requestNonce)]
    )
  );

  const relayer = await ethers.getContractAt("LunexNativeTopUpRelayer", relayerAddress);
  const alreadyDelivered = await relayer.deliveredRequests(requestId);
  if (alreadyDelivered) {
    console.log(`already delivered requestId=${requestId}`);
    return;
  }

  const tx = await relayer.deliverTopUp(
    requestId,
    token,
    recipient,
    recipientTokenAmount,
    treasuryTokenAmount,
    nativeAmount
  );
  console.log(`topup tx=${tx.hash} requestId=${requestId}`);
  await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
