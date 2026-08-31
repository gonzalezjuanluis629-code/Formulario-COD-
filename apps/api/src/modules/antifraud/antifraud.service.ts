import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Location } from '@cod/contracts';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

/** Centroide aproximado de cada provincia de RD. Para el check de coherencia GPS. */
const CENTROIDS: Record<string, [number, number]> = {
  'DO-01': [18.486, -69.931], 'DO-32': [18.51, -69.85], 'DO-25': [19.451, -70.697],
  'DO-13': [19.222, -70.529], 'DO-18': [19.79, -70.687], 'DO-11': [18.616, -68.706],
  'DO-12': [18.427, -68.973], 'DO-23': [18.46, -69.297], 'DO-21': [18.417, -70.106],
  'DO-06': [19.3, -70.25], 'DO-28': [18.94, -70.41], 'DO-02': [18.453, -70.735],
  'DO-04': [18.212, -71.1], 'DO-27': [19.55, -71.08], 'DO-09': [19.55, -70.52],
  'DO-20': [19.206, -69.336],
};

export interface RiskInput {
  shopId: string;
  phoneHash: string;
  location: Location | null;
  declaredProvince: string | null;
}

@Injectable()
export class AntifraudService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async assertNotBlocked(shopId: string, h: { phoneHash: string; ipHash: string }) {
    const hit = await this.prisma.blocklistEntry.findFirst({
      where: {
        shopId,
        OR: [
          { type: 'PHONE', valueHash: h.phoneHash },
          { type: 'IP', valueHash: h.ipHash },
        ],
      },
    });
    if (hit) throw new ForbiddenException('No podemos procesar este pedido.');
  }

  /** Mismo teléfono + mismo carrito en 10 minutos = doble envío, no dos pedidos. */
  async assertNotDuplicate(shopId: string, phoneHash: string, cartHash: string) {
    const key = this.redis.key(shopId, 'dedup', phoneHash, cartHash);
    const first = await this.redis.client.set(key, '1', 'EX', 600, 'NX');
    if (!first) throw new ConflictException('Ya recibimos este pedido hace un momento.');
  }

  /**
   * Límite duro configurable de pedidos por teléfono en 24 h.
   * Distinto del scoring: esto SÍ bloquea. Frena al que hace 20 pedidos falsos.
   */
  async assertUnderDailyLimit(shopId: string, phoneHash: string, max: number) {
    if (max <= 0) return; // 0 = sin límite
    const count = await this.prisma.submission.count({
      where: {
        shopId, phoneHash,
        status: { notIn: ['REJECTED', 'CANCELLED'] },
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (count >= max) {
      throw new ConflictException('Alcanzaste el máximo de pedidos por hoy.');
    }
  }

  /**
   * Scoring 0-100. No bloquea: etiqueta.
   * El check estrella: si el GPS dice que estás a 200 km de la provincia que
   * declaraste, algo no cuadra — y eso es RTO puro.
   */
  async score(input: RiskInput): Promise<{ score: number; flags: string[] }> {
    const flags: string[] = [];
    let score = 0;

    if (!input.location) {
      score += 10;
      flags.push('NO_GPS');
    } else {
      if (input.location.source === 'MANUAL') score += 5;
      if ((input.location.accuracyMeters ?? 0) > 1000) {
        score += 15;
        flags.push('LOW_ACCURACY');
      }

      const c = input.declaredProvince ? CENTROIDS[input.declaredProvince] : undefined;
      if (c) {
        const km = haversine(input.location.lat, input.location.lng, c[0], c[1]);
        if (km > 150) {
          score += 35;
          flags.push('GPS_PROVINCE_MISMATCH');
        }
      }
    }

    // Velocidad: muchos pedidos del mismo teléfono en 24 h.
    const recent = await this.prisma.submission.count({
      where: {
        shopId: input.shopId,
        phoneHash: input.phoneHash,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (recent >= 3) {
      score += 20;
      flags.push('HIGH_VELOCITY');
    }

    return { score: Math.min(100, score), flags };
  }
}

function haversine(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371;
  const dLa = ((la2 - la1) * Math.PI) / 180;
  const dLo = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
