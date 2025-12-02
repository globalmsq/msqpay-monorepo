import { FastifyInstance } from 'fastify';
import { RelayService } from '../services/relay.service';

export async function healthRoutes(
  fastify: FastifyInstance,
  options: { relayService: RelayService }
): Promise<void> {
  const { relayService } = options;

  /**
   * GET /health
   * Health check endpoint
   */
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              version: { type: 'string' },
              timestamp: { type: 'string' },
              relayer: {
                type: 'object',
                properties: {
                  address: { type: 'string' },
                  connected: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      let relayerInfo = { address: 'unknown', connected: false };

      try {
        const info = await relayService.getRelayerInfo();
        relayerInfo = {
          address: info.address,
          connected: true,
        };
      } catch {
        relayerInfo.connected = false;
      }

      return {
        status: 'healthy',
        service: 'simple-defender',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        relayer: relayerInfo,
      };
    }
  );

  /**
   * GET /ready
   * Readiness check endpoint
   */
  fastify.get(
    '/ready',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
            },
          },
          503: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await relayService.getRelayerInfo();
        return { ready: true };
      } catch (error) {
        reply.status(503);
        return {
          ready: false,
          reason: 'Relayer not connected',
        };
      }
    }
  );
}
