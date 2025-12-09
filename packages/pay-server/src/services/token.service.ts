import { PrismaClient, Token } from '@prisma/client';

export interface CreateTokenInput {
  chain_id: number;
  address: string;
  symbol: string;
  decimals: number;
}

export interface UpdateTokenInput {
  symbol?: string;
  decimals?: number;
  is_enabled?: boolean;
}

export class TokenService {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreateTokenInput): Promise<Token> {
    return this.prisma.token.create({
      data: {
        chain_id: input.chain_id,
        address: input.address.toLowerCase(),
        symbol: input.symbol,
        decimals: input.decimals,
        is_enabled: true,
        is_deleted: false,
      },
    });
  }

  async findById(id: number): Promise<Token | null> {
    return this.prisma.token.findFirst({
      where: {
        id,
        is_deleted: false,
      },
    });
  }

  async findByAddress(chainId: number, address: string): Promise<Token | null> {
    return this.prisma.token.findFirst({
      where: {
        chain_id: chainId,
        address: address.toLowerCase(),
        is_deleted: false,
      },
    });
  }

  async findAllOnChain(chainId: number, includeDisabled: boolean = false): Promise<Token[]> {
    const whereClause: any = {
      chain_id: chainId,
      is_deleted: false,
    };

    if (!includeDisabled) {
      whereClause.is_enabled = true;
    }

    return this.prisma.token.findMany({
      where: whereClause,
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: number, input: UpdateTokenInput): Promise<Token> {
    return this.prisma.token.update({
      where: { id },
      data: {
        ...(input.symbol !== undefined && { symbol: input.symbol }),
        ...(input.decimals !== undefined && { decimals: input.decimals }),
        ...(input.is_enabled !== undefined && { is_enabled: input.is_enabled }),
      },
    });
  }

  async softDelete(id: number): Promise<Token> {
    return this.prisma.token.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });
  }
}
