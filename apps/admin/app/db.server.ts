import { PrismaClient } from '@prisma/client';

// Una sola instancia en dev (el HMR de Vite recarga el módulo).
declare global { var __prisma: PrismaClient | undefined }
export const db = global.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = db;
