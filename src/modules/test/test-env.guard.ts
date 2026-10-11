import {
  CanActivate,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const ALLOWED_ENVIRONMENTS = ['development', 'dev', 'qa'];

@Injectable()
export class TestEnvGuard implements CanActivate {
  canActivate(): boolean {
    const environment = process.env.NODE_ENV ?? 'development';

    if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
      throw new ForbiddenException(
        `El reset de la base de datos solo está disponible en dev/qa (NODE_ENV=${environment})`,
      );
    }

    return true;
  }
}
