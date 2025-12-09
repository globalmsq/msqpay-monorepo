import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'path';

import { loadChainsConfig } from './config/chains.config';
import { BlockchainService } from './services/blockchain.service';
import { DefenderService } from './services/defender.service';
import { PaymentService } from './services/payment.service';
import { MerchantService } from './services/merchant.service';
import { ChainService } from './services/chain.service';
import { TokenService } from './services/token.service';
import { PaymentMethodService } from './services/payment-method.service';
import { RelayService } from './services/relay.service';
import { getPrismaClient, disconnectPrisma } from './db/client';
import { getRedisClient, disconnectRedis } from './db/redis';
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

// Load chain configuration from JSON file
// Environment variables: CHAINS_CONFIG_PATH (default: ./chains.json)
const configPath = process.env.CHAINS_CONFIG_PATH || path.join(process.cwd(), 'chains.json');
console.log(`📋 Loading chain config from: ${configPath}`);

let chainsConfig;
try {
  chainsConfig = loadChainsConfig(configPath);
  console.log(`🔗 Supported chains: ${chainsConfig.chains.map(c => `${c.name}(${c.chainId})`).join(', ')}`);
} catch (error) {
  console.error(`❌ Failed to load chain configuration from ${configPath}`);
  console.error(error);
  process.exit(1);
}

// Initialize database clients
const prisma = getPrismaClient();
getRedisClient();

// Initialize BlockchainService with multi-chain config
const blockchainService = new BlockchainService(chainsConfig);

// Initialize Defender service for gasless transactions
// Production: https://api.defender.openzeppelin.com
// Local: http://simple-defender:3001
const defenderApiUrl = process.env.DEFENDER_API_URL || 'http://localhost:3001';
const defenderApiKey = process.env.DEFENDER_API_KEY || '';
const defenderApiSecret = process.env.DEFENDER_API_SECRET || '';
const relayerAddress = process.env.RELAYER_ADDRESS || '0x0000000000000000000000000000000000000000';
const defenderService = new DefenderService(defenderApiUrl, defenderApiKey, defenderApiSecret, relayerAddress);

// Initialize database services
const paymentService = new PaymentService(prisma);
const merchantService = new MerchantService(prisma);
const chainService = new ChainService(prisma);
const tokenService = new TokenService(prisma);
const paymentMethodService = new PaymentMethodService(prisma);
const relayService = new RelayService(prisma);

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
    supportedChains: blockchainService.getSupportedChainIds(),
  };
});

// Register routes
const registerRoutes = async () => {
  await createPaymentRoute(
    server,
    blockchainService,
    merchantService,
    chainService,
    tokenService,
    paymentMethodService,
    paymentService
  );
  await getPaymentStatusRoute(server, blockchainService, paymentService);
  await submitGaslessRoute(server, defenderService, relayService, paymentService);
  await executeRelayRoute(server, defenderService);
  await getRelayStatusRoute(server, defenderService);
  await getPaymentHistoryRoute(server, blockchainService, paymentService, relayService);
  await getTokenBalanceRoute(server, blockchainService);
  await getTokenAllowanceRoute(server, blockchainService);
  await getTransactionStatusRoute(server, blockchainService);
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n📢 Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    await disconnectPrisma();
    await disconnectRedis();
    console.log('✅ Server closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

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
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(1);
  }
};

start();
