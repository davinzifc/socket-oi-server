import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  extractBearerToken,
  getUserIdFromJwtPayload,
  verifyJwtHs256,
} from '../auth/jwt';

/**
 * Guard mínimo para la especificación.
 * - En producción debes validar JWT (firma, expiración, scopes/roles).
 * - Aquí sólo exigimos presencia de Authorization si AUTH_REQUIRED=true.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) { }

  canActivate(context: ExecutionContext): boolean {
    const required = this.configService.get<boolean>('auth.required') ?? true;
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const rawAuth = request?.headers?.authorization;
    const token = extractBearerToken(rawAuth);
    if (!token) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const secret = this.configService.get<string>('auth.jwt.secret') || '';
    const issuer = this.configService.get<string | undefined>('auth.jwt.issuer');
    const audience = this.configService.get<string | undefined>('auth.jwt.audience');
    try {
      const payload = verifyJwtHs256(token, secret, { issuer, audience });
      const userId = getUserIdFromJwtPayload(payload);
      if (!userId) throw new Error('missing_userId_claim');
      // Convención típica de Nest: request.user
      request.user = { userId, claims: payload };
      return true;
    } catch (e: any) {
      throw new UnauthorizedException(e?.message || 'Invalid token');
    }
  }
}

