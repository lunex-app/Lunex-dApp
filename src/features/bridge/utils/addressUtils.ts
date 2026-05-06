import { pad } from "viem";

/** Convert a 20-byte address to a 32-byte CCTP mintRecipient */
export function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return pad(address, { size: 32 });
}
