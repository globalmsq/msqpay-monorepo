import { createPublicClient, http, Address } from 'viem';

/**
 * Nonce 관리 서비스
 *
 * ERC2771Forwarder에서 사용자의 현재 nonce를 조회합니다.
 * Nonce는 메타트랜잭션의 재생 공격을 방지하기 위해 사용됩니다.
 */
export class NonceService {
  private publicClient: ReturnType<typeof createPublicClient>;
  private forwarderAddress: Address;

  constructor(rpcUrl: string, forwarderAddress: Address) {
    if (!rpcUrl) {
      throw new Error('RPC URL is required');
    }

    if (!forwarderAddress || !forwarderAddress.startsWith('0x') || forwarderAddress.length !== 42) {
      throw new Error('Invalid forwarder address');
    }

    this.publicClient = createPublicClient({
      transport: http(rpcUrl),
    });
    this.forwarderAddress = forwarderAddress;
  }

  /**
   * 사용자의 현재 nonce 조회
   *
   * ERC2771Forwarder의 nonces() 메서드를 호출하여 현재 nonce를 조회합니다.
   */
  async getNonce(address: Address): Promise<string> {
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      throw new Error('Invalid address format');
    }

    try {
      // ERC2771Forwarder의 nonces() 메서드 호출
      // nonces(address) -> uint256
      const nonce = await this.publicClient.readContract({
        address: this.forwarderAddress,
        abi: FORWARDER_ABI,
        functionName: 'nonces',
        args: [address],
      });

      return String(nonce);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('The contract function "nonces" does not exist')
      ) {
        // Forwarder contract not deployed or wrong address
        throw new Error(`Forwarder contract not found at ${this.forwarderAddress}`);
      }

      throw new Error(
        `Failed to get nonce for ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 여러 주소의 nonce를 일괄 조회
   */
  async getNonceBatch(addresses: Address[]): Promise<Record<Address, string>> {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses must be a non-empty array');
    }

    const result: Record<Address, string> = {};

    for (const address of addresses) {
      try {
        result[address] = await this.getNonce(address);
      } catch {
        throw new Error(`Failed to get nonce for address ${address}`);
      }
    }

    return result;
  }
}

// ERC2771Forwarder ABI (simplified - only nonces function)
const FORWARDER_ABI = [
  {
    constant: true,
    inputs: [
      {
        name: 'account',
        type: 'address',
      },
    ],
    name: 'nonces',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
] as const;
