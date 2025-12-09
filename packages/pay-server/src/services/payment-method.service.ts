import { PrismaClient, MerchantPaymentMethod } from '@prisma/client';

export interface CreatePaymentMethodInput {
  merchant_id: number;
  token_id: number;
  recipient_address: string;
}

export interface UpdatePaymentMethodInput {
  recipient_address?: string;
  is_enabled?: boolean;
}

export class PaymentMethodService {
  constructor(private prisma: PrismaClient) {}

  async create(input: CreatePaymentMethodInput): Promise<MerchantPaymentMethod> {
    return this.prisma.merchantPaymentMethod.create({
      data: {
        merchant_id: input.merchant_id,
        token_id: input.token_id,
        recipient_address: input.recipient_address.toLowerCase(),
        is_enabled: true,
        is_deleted: false,
      },
    });
  }

  async findById(id: number): Promise<MerchantPaymentMethod | null> {
    return this.prisma.merchantPaymentMethod.findFirst({
      where: {
        id,
        is_deleted: false,
      },
    });
  }

  async findByMerchantAndToken(merchantId: number, tokenId: number): Promise<MerchantPaymentMethod | null> {
    return this.prisma.merchantPaymentMethod.findFirst({
      where: {
        merchant_id: merchantId,
        token_id: tokenId,
        is_deleted: false,
      },
    });
  }

  async findAllForMerchant(merchantId: number, includeDisabled: boolean = false): Promise<MerchantPaymentMethod[]> {
    const whereClause: any = {
      merchant_id: merchantId,
      is_deleted: false,
    };

    if (!includeDisabled) {
      whereClause.is_enabled = true;
    }

    return this.prisma.merchantPaymentMethod.findMany({
      where: whereClause,
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: number, input: UpdatePaymentMethodInput): Promise<MerchantPaymentMethod> {
    return this.prisma.merchantPaymentMethod.update({
      where: { id },
      data: {
        ...(input.recipient_address !== undefined && {
          recipient_address: input.recipient_address.toLowerCase(),
        }),
        ...(input.is_enabled !== undefined && { is_enabled: input.is_enabled }),
      },
    });
  }

  async softDelete(id: number): Promise<MerchantPaymentMethod> {
    return this.prisma.merchantPaymentMethod.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });
  }
}
