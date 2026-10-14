import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginLookup } from './login.lookup';
import { PasswordService } from './password.service';
import { ProfileRepository } from './profile.repository';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    LoginLookup,
    PasswordService,
    TokenService,
    SessionRepository,
    ProfileRepository,
    AuditRepository,
  ],
  exports: [AuthGuard, TokenService, PasswordService],
})
export class AuthModule {}
