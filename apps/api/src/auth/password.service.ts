import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ARGON2_OPTIONS } from '@dawaa/shared';

@Injectable()
export class PasswordService implements OnModuleInit {
  dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash('dawaa-dummy-password', ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password).catch(() => false);
  }

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }
}
