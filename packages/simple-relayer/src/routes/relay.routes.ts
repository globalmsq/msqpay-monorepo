import { FastifyInstance } from 'fastify';
import { RelayService, RelayRequest, ForwardRelayRequest } from '../services/relay.service';

interface RelayRequestBody {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  speed?: 'safeLow' | 'average' | 'fast' | 'fastest';
}

/**
 * ERC2771 Gasless Request (msq-relayer-service 호환)
 */
interface GaslessRelayRequestBody {
  request: {
    from: string;
    to: string;
    value: string;
    gas: string;
    nonce: string;
    deadline: string;
    data: string;
  };
  signature: string;
}

interface GetNonceParams {
  address: string;
}

export async function relayRoutes(
  fastify: FastifyInstance,
  options: { relayService: RelayService }
): Promise<void> {
  const { relayService } = options;

  /**
   * POST /api/v1/relay/direct
   * Submit a relay transaction (Direct relay)
   */
  fastify.post<{ Body: RelayRequestBody }>(
    '/api/v1/relay/direct',
    {
      schema: {
        body: {
          type: 'object',
          required: ['to', 'data'],
          properties: {
            to: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            data: { type: 'string', pattern: '^0x[a-fA-F0-9]*$' },
            value: { type: 'string' },
            gasLimit: { type: 'string' },
            speed: {
              type: 'string',
              enum: ['safeLow', 'average', 'fast', 'fastest'],
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              transactionId: { type: 'string' },
              hash: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const relayRequest: RelayRequest = {
          to: request.body.to as `0x${string}`,
          data: request.body.data as `0x${string}`,
          value: request.body.value,
          gasLimit: request.body.gasLimit,
          speed: request.body.speed,
        };

        const result = await relayService.submitTransaction(relayRequest);

        return {
          transactionId: result.transactionId,
          hash: result.hash,
          status: result.status,
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to submit relay transaction');
        reply.status(500);
        return {
          error: 'Failed to submit transaction',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * POST /api/v1/relay/gasless
   * Submit ERC2771 Gasless Request (Meta-transaction)
   *
   * This endpoint receives a Gasless request with signature and calls
   * Forwarder.execute(ForwardRequestData) on the blockchain.
   */
  fastify.post<{ Body: GaslessRelayRequestBody }>(
    '/api/v1/relay/gasless',
    {
      schema: {
        body: {
          type: 'object',
          required: ['request', 'signature'],
          properties: {
            request: {
              type: 'object',
              required: ['from', 'to', 'value', 'gas', 'nonce', 'deadline', 'data'],
              properties: {
                from: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                to: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                value: { type: 'string' },
                gas: { type: 'string' },
                nonce: { type: 'string' },
                deadline: { type: 'string' },
                data: { type: 'string', pattern: '^0x[a-fA-F0-9]*$' },
              },
            },
            signature: { type: 'string', pattern: '^0x[a-fA-F0-9]+$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              transactionId: { type: 'string' },
              hash: { type: ['string', 'null'] },
              status: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { request: gaslessReq, signature } = request.body;

        const forwardRelayRequest: ForwardRelayRequest = {
          forwardRequest: {
            from: gaslessReq.from as `0x${string}`,
            to: gaslessReq.to as `0x${string}`,
            value: gaslessReq.value,
            gas: gaslessReq.gas,
            nonce: gaslessReq.nonce,
            deadline: gaslessReq.deadline,
            data: gaslessReq.data as `0x${string}`,
            signature: signature as `0x${string}`,
          },
        };

        const result = await relayService.submitForwardRequest(forwardRelayRequest);

        return {
          transactionId: result.transactionId,
          hash: result.hash ?? null,
          status: result.status,
          createdAt: new Date(result.createdAt).toISOString(),
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to submit gasless relay transaction');
        reply.status(500);
        return {
          error: 'Failed to submit gasless transaction',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /api/v1/relay/status/:txId
   * Get transaction status
   */
  fastify.get<{ Params: { txId: string } }>(
    '/api/v1/relay/status/:txId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['txId'],
          properties: {
            txId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              transactionId: { type: 'string' },
              hash: { type: ['string', 'null'] },
              status: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { txId } = request.params;
        const result = await relayService.getTransaction(txId);

        return {
          transactionId: result.transactionId,
          hash: result.hash ?? null,
          status: result.status,
          createdAt: new Date(result.createdAt).toISOString(),
        };
      } catch (error) {
        reply.status(404);
        return {
          error: 'Transaction not found',
        };
      }
    }
  );

  /**
   * GET /api/v1/health
   * Get relayer health info
   */
  fastify.get(
    '/api/v1/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              balance: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      const info = await relayService.getRelayerInfo();
      return info;
    }
  );

  /**
   * GET /api/v1/relay/gasless/nonce/:address
   * Get current nonce for address from Forwarder contract
   */
  fastify.get<{ Params: GetNonceParams }>(
    '/api/v1/relay/gasless/nonce/:address',
    {
      schema: {
        params: {
          type: 'object',
          required: ['address'],
          properties: {
            address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              nonce: { type: 'string' },
            },
          },
        },
      },
    },
    async (request) => {
      const { address } = request.params;
      const nonce = await relayService.getNonce(address as `0x${string}`);
      return { nonce: nonce.toString() };
    }
  );
}
