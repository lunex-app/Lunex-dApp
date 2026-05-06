import { createPublicClient, http, parseAbi } from 'viem';

async function checkDecimals() {
  const client = createPublicClient({
    transport: http('https://rpc.testnet.arc.network')
  });

  const abi = parseAbi(['function decimals() view returns (uint8)']);
  const usdc = '0x3600000000000000000000000000000000000000';

  try {
    const d = await client.readContract({
      address: usdc,
      abi,
      functionName: 'decimals'
    });
    console.log('Arc USDC Decimals:', d);
  } catch (e) {
    console.error('Failed to get Arc USDC decimals:', e);
  }
}

checkDecimals();
