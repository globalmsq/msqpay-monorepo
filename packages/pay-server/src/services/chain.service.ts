import { PrismaClient, Chain } from '@prisma/client';

export interface CreateChainInput {
  network_id: number;
  name: string;
  rpc_url: string;
  is_testnet?: boolean;
}

export interface UpdateChainInput {
  name?: string;
  rpc_url?: string;
  is_testnet?: boolean;
  is_enabled?: boolean;
}

export class ChainService {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreateChainInput): Promise<Chain> {
    return this.prisma.chain.create({
      data: {
        network_id: input.network_id,
        name: input.name,
        rpc_url: input.rpc_url,
        is_testnet: input.is_testnet || false,
        is_enabled: true,
        is_deleted: false,
      },
    });
  }

  async findById(id: number): Promise<Chain | null> {
    return this.prisma.chain.findFirst({
      where: {
        id,
        is_deleted: false,
      },
    });
  }

  async findByNetworkId(networkId: number): Promise<Chain | null> {
    return this.prisma.chain.findFirst({
      where: {
        network_id: networkId,
        is_deleted: false,
      },
    });
  }

  async findAll(includeDisabled: boolean = false): Promise<Chain[]> {
    const whereClause: any = {
      is_deleted: false,
    };

    if (!includeDisabled) {
      whereClause.is_enabled = true;
    }

    return this.prisma.chain.findMany({
      where: whereClause,
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: number, input: UpdateChainInput): Promise<Chain> {
    return this.prisma.chain.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.rpc_url !== undefined && { rpc_url: input.rpc_url }),
        ...(input.is_testnet !== undefined && { is_testnet: input.is_testnet }),
        ...(input.is_enabled !== undefined && { is_enabled: input.is_enabled }),
      },
    });
  }

  async softDelete(id: number): Promise<Chain> {
    return this.prisma.chain.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });
  }
}
