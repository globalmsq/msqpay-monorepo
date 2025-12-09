import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient;

// DATABASE_URL 조합: 개별 환경변수로부터 생성
function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.MYSQL_HOST || 'localhost';
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER || 'msqpay';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'msqpay';

  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    // Prisma가 DATABASE_URL 환경변수를 요구하므로 설정
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = getDatabaseUrl();
    }
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
  }
}
