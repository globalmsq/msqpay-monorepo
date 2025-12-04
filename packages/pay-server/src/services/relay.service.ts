import { PrismaClient, RelayRequest, RelayStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreateRelayInput {
  relay_ref: string;
  payment_id: string;
  gas_estimate?: Decimal;
}

export class RelayService {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreateRelayInput): Promise<RelayRequest> {
    return this.prisma.relayRequest.create({
      data: {
        relay_ref: input.relay_ref,
        payment_id: input.payment_id,
        status: 'QUEUED' as RelayStatus,
        gas_estimate: input.gas_estimate,
      },
    });
  }

  async findById(id: string): Promise<RelayRequest | null> {
    return this.prisma.relayRequest.findUnique({
      where: { id },
    });
  }

  async findByRelayRef(relayRef: string): Promise<RelayRequest | null> {
    return this.prisma.relayRequest.findUnique({
      where: { relay_ref: relayRef },
    });
  }

  async findByPaymentId(paymentId: string): Promise<RelayRequest[]> {
    return this.prisma.relayRequest.findMany({
      where: { payment_id: paymentId },
      orderBy: { created_at: 'desc' },
    });
  }

  async findByStatus(status: RelayStatus, limit: number = 100): Promise<RelayRequest[]> {
    return this.prisma.relayRequest.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  async updateStatus(id: string, newStatus: RelayStatus): Promise<RelayRequest> {
    return this.prisma.relayRequest.update({
      where: { id },
      data: {
        status: newStatus,
        ...(newStatus === 'SUBMITTED' && { submitted_at: new Date() }),
        ...(newStatus === 'CONFIRMED' && { confirmed_at: new Date() }),
      },
    });
  }

  async setTxHash(id: string, txHash: string): Promise<RelayRequest> {
    return this.prisma.relayRequest.update({
      where: { id },
      data: { tx_hash: txHash },
    });
  }

  async setGasUsed(id: string, gasUsed: Decimal): Promise<RelayRequest> {
    return this.prisma.relayRequest.update({
      where: { id },
      data: { gas_used: gasUsed },
    });
  }

  async setErrorMessage(id: string, errorMessage: string): Promise<RelayRequest> {
    return this.prisma.relayRequest.update({
      where: { id },
      data: { error_message: errorMessage },
    });
  }
}
