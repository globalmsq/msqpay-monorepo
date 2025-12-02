export interface ForwardRequest {
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: bigint;
  data: `0x${string}`;
}

export interface TransactionResponse {
  transactionId: string;
  hash?: `0x${string}`;
  status: 'pending' | 'sent' | 'submitted' | 'mined' | 'confirmed' | 'failed';
}

export interface MockDefenderConfig {
  forwarderAddress: `0x${string}`;
  relayerPrivateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
}

export interface RelayerInfo {
  address: `0x${string}`;
  balance?: bigint;
}

export interface SendTransactionParams {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string | bigint;
  gasLimit?: string | bigint;
  speed?: 'safeLow' | 'average' | 'fast' | 'fastest';
}
