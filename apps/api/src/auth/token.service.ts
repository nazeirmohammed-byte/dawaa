import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_CONFIG, type AppConfig } from '../config';

export type AccessClaims = {
  sub: string;
  tid: string;
  bid: string | null;
  typ: 'access';
};

export type RefreshClaims = {
  sub: string;
  tid: string;
  jti: string;
  typ: 'refresh';
};

@Injectable()
export class TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.accessKey = new TextEncoder().encode(config.accessSecret);
    this.refreshKey = new TextEncoder().encode(config.refreshSecret);
  }

  signAccess(claims: Omit<AccessClaims, 'typ'>): Promise<string> {
    return new SignJWT({ tid: claims.tid, bid: claims.bid, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.accessKey);
  }

  signRefresh(claims: Omit<RefreshClaims, 'typ'>): Promise<string> {
    return new SignJWT({ tid: claims.tid, typ: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setJti(claims.jti)
      .setIssuedAt()
      .setExpirationTime(`${this.config.refreshTtlSeconds}s`)
      .sign(this.refreshKey);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.accessKey);
    if (payload.typ !== 'access' || !payload.sub || typeof payload.tid !== 'string') {
      throw new Error('invalid access token');
    }
    return {
      sub: payload.sub,
      tid: payload.tid,
      bid: typeof payload.bid === 'string' ? payload.bid : null,
      typ: 'access',
    };
  }

  signPlatform(userId: string): Promise<string> {
    return new SignJWT({ typ: 'platform' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.accessKey);
  }

  async verifyPlatform(token: string): Promise<{ sub: string; typ: 'platform' }> {
    const { payload } = await jwtVerify(token, this.accessKey);
    if (payload.typ !== 'platform' || !payload.sub) throw new Error('invalid platform token');
    return { sub: payload.sub, typ: 'platform' };
  }

  async verifyRefresh(token: string): Promise<RefreshClaims> {
    const { payload } = await jwtVerify(token, this.refreshKey);
    if (payload.typ !== 'refresh' || !payload.sub || typeof payload.tid !== 'string' || !payload.jti) {
      throw new Error('invalid refresh token');
    }
    return { sub: payload.sub, tid: payload.tid, jti: payload.jti, typ: 'refresh' };
  }
}
