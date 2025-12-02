import Fastify from 'fastify';
import cors from '@fastify/cors';

import { BlockchainService } from './services/blockchain.service';
import { DefenderService } from './services/defender.service';
import { createPaymentRoute } from './routes/payments/create';
import { getPaymentStatusRoute } from './routes/payments/status';
import { submitGaslessRoute } from './routes/payments/gasless';
import { executeRelayRoute } from './routes/payments/relay';
import { getRelayStatusRoute } from './routes/payments/relay-status';
import { getPaymentHistoryRoute } from './routes/payments/history';
import { getTokenBalanceRoute } from './routes/tokens/balance';
import { getTokenAllowanceRoute } from './routes/tokens/allowance';
import { getTransactionStatusRoute } from './routes/transactions/status';

const server = Fastify({
  logger: true,
});

// Initialize services
// Environment variables: BLOCKCHAIN_RPC_URL, GATEWAY_ADDRESS (see .env.example)
const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'https://polygon-rpc.com';
const gatewayAddress = process.env.GATEWAY_ADDRESS;

if (!gatewayAddress) {
  console.error('❌ GATEWAY_ADDRESS environment variable is required');
  process.exit(1);
}
const blockchainService = new BlockchainService(rpcUrl, gatewayAddress);

// Initialize Defender service for gasless transactions
// Production: https://api.defender.openzeppelin.com
// Local: http://simple-defender:3001
const defenderApiUrl = process.env.DEFENDER_API_URL || 'http://localhost:3001';
const defenderApiKey = process.env.DEFENDER_API_KEY || '';
const defenderApiSecret = process.env.DEFENDER_API_SECRET || '';
const relayerAddress = process.env.RELAYER_ADDRESS || '0x0000000000000000000000000000000000000000';
const defenderService = new DefenderService(defenderApiUrl, defenderApiKey, defenderApiSecret, relayerAddress);

// Register CORS
server.register(cors, {
  origin: true, // Allow all origins in development
});

// Health check endpoint
server.get('/health', async (_request, _reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Root endpoint
server.get('/', async (_request, _reply) => {
  return {
    service: 'MSQ Pay Server',
    version: '0.1.0',
    status: 'running',
  };
});

// Register routes
const registerRoutes = async () => {
  await createPaymentRoute(server, blockchainService);
  await getPaymentStatusRoute(server, blockchainService);
  await submitGaslessRoute(server, defenderService);
  await executeRelayRoute(server, defenderService);
  await getRelayStatusRoute(server, defenderService);
  await getPaymentHistoryRoute(server, blockchainService);
  await getTokenBalanceRoute(server, blockchainService);
  await getTokenAllowanceRoute(server, blockchainService);
  await getTransactionStatusRoute(server, blockchainService);
};

// Start server
const start = async () => {
  try {
    await registerRoutes();

    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    console.log(`🚀 Server running on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
