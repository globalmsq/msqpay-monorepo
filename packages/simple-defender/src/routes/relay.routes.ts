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
 * ERC2771 ForwardRequest를 포함한 릴레이 요청 바디
 */
interface ForwardRelayRequestBody {
  forwardRequest: {
    from: string;
    to: string;
    value: string;
    gas: string;
    deadline: string;
    data: string;
    signature: string;
  };
  gasLimit?: string;
  speed?: 'safeLow' | 'average' | 'fast' | 'fastest';
}

interface GetTransactionParams {
  transactionId: string;
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
   * POST /relay
   * Submit a relay transaction (OZ Defender compatible)
   */
  fastify.post<{ Body: RelayRequestBody }>(
    '/relay',
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
   * POST /relay/forward
   * Submit ERC2771 ForwardRequest (Meta-transaction)
   *
   * This endpoint receives a ForwardRequest with signature and calls
   * Forwarder.execute(ForwardRequestData) on the blockchain.
   */
  fastify.post<{ Body: ForwardRelayRequestBody }>(
    '/relay/forward',
    {
      schema: {
        body: {
          type: 'object',
          required: ['forwardRequest'],
          properties: {
            forwardRequest: {
              type: 'object',
              required: ['from', 'to', 'value', 'gas', 'deadline', 'data', 'signature'],
              properties: {
                from: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                to: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                value: { type: 'string' },
                gas: { type: 'string' },
                deadline: { type: 'string' },
                data: { type: 'string', pattern: '^0x[a-fA-F0-9]*$' },
                signature: { type: 'string', pattern: '^0x[a-fA-F0-9]+$' },
              },
            },
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
        const { forwardRequest, gasLimit, speed } = request.body;

        const forwardRelayRequest: ForwardRelayRequest = {
          forwardRequest: {
            from: forwardRequest.from as `0x${string}`,
            to: forwardRequest.to as `0x${string}`,
            value: forwardRequest.value,
            gas: forwardRequest.gas,
            deadline: forwardRequest.deadline,
            data: forwardRequest.data as `0x${string}`,
            signature: forwardRequest.signature as `0x${string}`,
          },
          gasLimit,
          speed,
        };

        const result = await relayService.submitForwardRequest(forwardRelayRequest);

        return {
          transactionId: result.transactionId,
          hash: result.hash,
          status: result.status,
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to submit forward relay transaction');
        reply.status(500);
        return {
          error: 'Failed to submit forward transaction',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /relay/:transactionId
   * Get transaction status (OZ Defender compatible)
   */
  fastify.get<{ Params: GetTransactionParams }>(
    '/relay/:transactionId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['transactionId'],
          properties: {
            transactionId: { type: 'string' },
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
        const { transactionId } = request.params;
        const result = await relayService.getTransaction(transactionId);

        return {
          transactionId: result.transactionId,
          hash: result.hash,
          status: result.status,
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
   * GET /relayer
   * Get relayer info (OZ Defender compatible)
   */
  fastify.get(
    '/relayer',
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
   * GET /nonce/:address
   * Get current nonce for address from Forwarder contract
   */
  fastify.get<{ Params: GetNonceParams }>(
    '/nonce/:address',
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
