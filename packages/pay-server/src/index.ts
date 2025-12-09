import Fastify from 'fastify';
import cors from '@fastify/cors';

import { createLogger } from './lib/logger';
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

const logger = createLogger('Server');

// Initialize database clients
const prisma = getPrismaClient();
getRedisClient();

// Initialize database services (ChainService needed for BlockchainService initialization)
const chainService = new ChainService(prisma);

// BlockchainService will be initialized after loading chains from DB
let blockchainService: BlockchainService;

// Initialize Defender service for gasless transactions
// Production: https://api.defender.openzeppelin.com
// Local: http://simple-defender:3001
const defenderApiUrl = process.env.DEFENDER_API_URL || 'http://localhost:3001';
const defenderApiKey = process.env.DEFENDER_API_KEY || '';
const defenderApiSecret = process.env.DEFENDER_API_SECRET || '';
const relayerAddress = process.env.RELAYER_ADDRESS || '0x0000000000000000000000000000000000000000';
const defenderService = new DefenderService(defenderApiUrl, defenderApiKey, defenderApiSecret, relayerAddress);

// Initialize other database services
const paymentService = new PaymentService(prisma);
const merchantService = new MerchantService(prisma);
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
  logger.info(`\n📢 Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    await disconnectPrisma();
    await disconnectRedis();
    logger.info('✅ Server closed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Load chain configuration from database
    logger.info('📋 Loading chain configuration from database...');
    const chainsWithTokens = await chainService.findAllWithTokens();

    if (chainsWithTokens.length === 0) {
      logger.error('❌ No chains with contract addresses found in database');
      logger.error('💡 Make sure chains table has gateway_address and forwarder_address set');
      process.exit(1);
    }

    // Initialize BlockchainService with DB data
    blockchainService = new BlockchainService(chainsWithTokens);
    logger.info(`🔗 Supported chains: ${blockchainService.getSupportedChainIds().join(', ')}`);

    await registerRoutes();

    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info(`🚀 Server running on http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(1);
  }
};

start();
