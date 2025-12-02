import Fastify, { FastifyInstance } from 'fastify';
import { RelayService, RelayServiceConfig } from './services/relay.service';
import { relayRoutes } from './routes/relay.routes';
import { healthRoutes } from './routes/health.routes';

export interface ServerConfig {
  host: string;
  port: number;
  relayerPrivateKey: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  forwarderAddress: `0x${string}`;
}

export async function buildServer(config: ServerConfig): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
  });

  const relayServiceConfig: RelayServiceConfig = {
    relayerPrivateKey: config.relayerPrivateKey,
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    forwarderAddress: config.forwarderAddress,
  };

  const relayService = new RelayService(relayServiceConfig);

  await fastify.register(relayRoutes, { relayService });
  await fastify.register(healthRoutes, { relayService });

  fastify.addHook('onClose', async () => {
    fastify.log.info('Server shutting down...');
  });

  return fastify;
}

export async function startServer(): Promise<void> {
  const config: ServerConfig = {
    host: process.env.HOST ?? '0.0.0.0',
    port: parseInt(process.env.PORT ?? '3001', 10),
    relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY as `0x${string}`,
    rpcUrl: process.env.RPC_URL ?? 'http://localhost:8545',
    chainId: parseInt(process.env.CHAIN_ID ?? '31337', 10),
    forwarderAddress: process.env.FORWARDER_ADDRESS as `0x${string}`,
  };

  if (!config.relayerPrivateKey) {
    console.error('RELAYER_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (!config.forwarderAddress) {
    console.error('FORWARDER_ADDRESS environment variable is required');
    process.exit(1);
  }

  try {
    const server = await buildServer(config);

    await server.listen({ host: config.host, port: config.port });

    console.log(`
╔══════════════════════════════════════════════════════════╗
║                   SimpleDefender Server                  ║
╠══════════════════════════════════════════════════════════╣
║  Status:    Running                                      ║
║  Host:      ${config.host.padEnd(44)}║
║  Port:      ${String(config.port).padEnd(44)}║
║  Chain ID:  ${String(config.chainId).padEnd(44)}║
║  RPC URL:   ${config.rpcUrl.substring(0, 40).padEnd(44)}║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║    POST /relay          - Submit relay transaction       ║
║    GET  /relay/:id      - Get transaction status         ║
║    GET  /relayer        - Get relayer info               ║
║    GET  /nonce/:address - Get nonce for address          ║
║    GET  /health         - Health check                   ║
║    GET  /ready          - Readiness check                ║
╚══════════════════════════════════════════════════════════╝
    `);

    const signals = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        await server.close();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}
