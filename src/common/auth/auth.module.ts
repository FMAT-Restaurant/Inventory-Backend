import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthConfigService } from './auth.config.js';
import { AuthGuard } from './auth.guard.js';

@Global()
@Module({
  providers: [AuthConfigService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthConfigService],
})
export class AuthModule {}
