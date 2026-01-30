import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    const token = request?.headers?.authorization;
    if (!token) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    return true;
  }
}

