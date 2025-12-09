import { PrismaClient, Merchant } from '@prisma/client';
import crypto from 'crypto';

export interface CreateMerchantInput {
  merchant_key: string;
  name: string;
  api_key: string;
  webhook_url?: string;
}

export interface UpdateMerchantInput {
  name?: string;
  webhook_url?: string;
  is_enabled?: boolean;
}

export class MerchantService {
  constructor(private prisma: PrismaClient) {}

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  async create(input: CreateMerchantInput): Promise<Merchant> {
    const apiKeyHash = this.hashApiKey(input.api_key);

    return this.prisma.merchant.create({
      data: {
        merchant_key: input.merchant_key,
        name: input.name,
        api_key_hash: apiKeyHash,
        webhook_url: input.webhook_url,
        is_enabled: true,
        is_deleted: false,
      },
    });
  }

  async findById(id: number): Promise<Merchant | null> {
    return this.prisma.merchant.findFirst({
      where: {
        id,
        is_deleted: false,
      },
    });
  }

  async findByMerchantKey(merchantKey: string): Promise<Merchant | null> {
    return this.prisma.merchant.findFirst({
      where: {
        merchant_key: merchantKey,
        is_deleted: false,
      },
    });
  }

  async findAll(includeDisabled: boolean = false): Promise<Merchant[]> {
    const whereClause: any = {
      is_deleted: false,
    };

    if (!includeDisabled) {
      whereClause.is_enabled = true;
    }

    return this.prisma.merchant.findMany({
      where: whereClause,
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: number, input: UpdateMerchantInput): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.webhook_url !== undefined && { webhook_url: input.webhook_url }),
        ...(input.is_enabled !== undefined && { is_enabled: input.is_enabled }),
      },
    });
  }

  async verifyApiKey(merchantId: number, apiKey: string): Promise<boolean> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return false;
    }

    const apiKeyHash = this.hashApiKey(apiKey);
    return merchant.api_key_hash === apiKeyHash;
  }

  async softDelete(id: number): Promise<Merchant> {
    return this.prisma.merchant.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });
  }
}
