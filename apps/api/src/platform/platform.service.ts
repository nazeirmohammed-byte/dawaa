import { randomBytes, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { addMoney, money, subMoney } from '@dawaa/shared';
import { hashToken } from '../auth/auth.logic';
import { PasswordService } from '../auth/password.service';
import { provisionPharmacy } from '../auth/provision';
import { APP_CONFIG, type AppConfig } from '../config';
import { DomainError } from '../http/domain-error';
import { takenField } from '../http/field-errors';
import { logger } from '../logger';
import { PrismaService } from '../prisma/prisma.service';
import { MEDICINE_ENRICH, MEDICINE_LIBRARY, type LibraryMedicine } from './medicine-library';
import { plainMedicineName } from '../ops/medicine-name';
import {
  assertRequestStep,
  canActivateTenant,
  canLinkExpiredPartner,
  catalogPushPatch,
  isBillingCycle,
  licenseNeedsAlert,
  mergeLimitPrices,
  planPrices,
  subscriptionCharge,
  unitForCycle,
} from './platform.logic';

export type PlatformActor = { id: string; roleCode: string; permissions: string[] };

const PAGE = 20;

function allow(actor: PlatformActor, code: string): void {
  if (!actor.permissions.includes(code)) throw new DomainError('UNAUTHORIZED', 403);
}

function dec(value: { toString(): string }): string {
  return money(value.toString());
}

function ids(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async authenticate(email: string, password: string): Promise<{ id: string; displayName: string; roleCode: string }> {
    const user = await this.prisma.client.platformUser.findUnique({ where: { email }, include: { role: true } });
    const ok = await this.passwords.verify(user?.passwordHash ?? this.passwords.dummyHash, password);
    if (!user || !ok || !user.isActive) throw new DomainError('AUTH_INVALID_CREDENTIALS', 401);
    await this.prisma.client.platformUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0 } });
    return { id: user.id, displayName: user.displayName, roleCode: user.role.code };
  }

  async actor(userId: string): Promise<PlatformActor & { displayName: string; email: string }> {
    const user = await this.prisma.client.platformUser.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive) throw new DomainError('UNAUTHORIZED', 401);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roleCode: user.role.code,
      permissions: user.role.permissions.map((link) => link.permission.code),
    };
  }

  async dashboard(actor: PlatformActor) {
    void actor;
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [tenants, requests, docs, invoices, items, licenses, subs, plans] = await Promise.all([
      this.prisma.client.tenant.findMany({ select: { id: true, status: true, branchLimit: true } }),
      this.prisma.client.subscriptionRequest.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'NEED_MORE_INFO', 'VERIFIED'] } },
      }),
      this.prisma.client.verificationDocument.count({ where: { status: 'PENDING' } }),
      this.prisma.client.subscriptionInvoice.findMany({ where: { status: 'ISSUED', dueAt: { lt: now } } }),
      this.prisma.client.newCatalogItemRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.client.partnerLicense.findMany({ where: { expiresOn: { lte: soon } }, include: { partner: true } }),
      this.prisma.client.subscription.findMany({ where: { status: 'ACTIVE' } }),
      this.prisma.client.plan.findMany(),
    ]);
    const planByCode = new Map(plans.map((plan) => [plan.code, plan]));
    let mrr = '0.00';
    for (const sub of subs) {
      const plan = planByCode.get(sub.planCode);
      const tenant = tenants.find((row) => row.id === sub.tenantId);
      if (!plan || !tenant) continue;
      mrr = addMoney(mrr, subscriptionCharge(plan.code, dec(plan.monthlyPrice), dec(plan.headOfficeFee), tenant.branchLimit));
    }
    return {
      totalTenants: tenants.length,
      activeTenants: tenants.filter((row) => row.status === 'ACTIVE').length,
      trialTenants: tenants.filter((row) => row.status === 'TRIAL').length,
      pendingRequests: requests,
      pendingVerification: docs,
      suspendedTenants: tenants.filter((row) => row.status === 'SUSPENDED').length,
      overdueInvoices: invoices.length,
      monthlyRecurringRevenue: mrr,
      pendingItems: items,
      expiringPartners: licenses.map((row) => ({
        id: row.partnerId,
        name: row.partner.name,
        expiresOn: row.expiresOn.toISOString().slice(0, 10),
        alert: licenseNeedsAlert(row.expiresOn, now),
      })),
    };
  }

  async listTenants(actor: PlatformActor, query: { q?: string; status?: string; page: number }) {
    allow(actor, 'tenant.read');
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ tradeNameAr: { contains: query.q } }, { tradeNameEn: { contains: query.q } }, { email: { contains: query.q } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.tenant.count({ where }),
      this.prisma.client.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * PAGE,
        take: PAGE,
      }),
    ]);
    const subs = await this.prisma.client.subscription.findMany({
      where: { tenantId: { in: rows.map((row) => row.id) } },
      orderBy: { createdAt: 'desc' },
    });
    const listed = await Promise.all(
      rows.map(async (tenant) => {
        const usage = await this.usage(tenant.id);
        const sub = subs.find((row) => row.tenantId === tenant.id);
        return {
          id: tenant.id,
          tradeNameAr: tenant.tradeNameAr,
          tradeNameEn: tenant.tradeNameEn,
          type: tenant.type,
          ownerName: tenant.ownerName,
          phone: tenant.phone,
          email: tenant.email,
          plan: sub?.planCode ?? '',
          status: tenant.status,
          verificationStatus: tenant.verificationStatus,
          branchCount: usage.branches,
          userCount: usage.users,
          deviceCount: usage.devices,
          lastLoginAt: usage.lastLoginAt,
          lastSyncAt: usage.lastSyncAt,
          createdAt: tenant.createdAt.toISOString(),
        };
      }),
    );
    return { total, page: query.page, rows: listed };
  }

  async tenantDetail(actor: PlatformActor, id: string) {
    allow(actor, 'tenant.read');
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id } });
    if (!tenant) throw new DomainError('NOT_FOUND', 404);
    const [usage, people, subscription, invoices, documents, audits, plan] = await Promise.all([
      this.usage(id),
      this.people(id),
      this.prisma.client.subscription.findFirst({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.subscriptionInvoice.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.verificationDocument.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.platformAuditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'desc' }, take: 40 }),
      subscriptionPlan(this.prisma, id),
    ]);
    return {
      id: tenant.id,
      tradeNameAr: tenant.tradeNameAr,
      tradeNameEn: tenant.tradeNameEn,
      type: tenant.type,
      status: tenant.status,
      verificationStatus: tenant.verificationStatus,
      ownerName: tenant.ownerName,
      phone: tenant.phone,
      email: tenant.email,
      addressLine: tenant.addressLine,
      licenseNumber: tenant.licenseNumber,
      pharmacistName: tenant.pharmacistName,
      pharmacistLicense: tenant.pharmacistLicense,
      readOnly: tenant.readOnly,
      supportNotes: tenant.supportNotes,
      featureFlags: ids(tenant.featureFlags),
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      usage,
      limits: plan?.limits ?? '{}',
      users: people.users,
      branches: people.branches,
      subscription: subscription
        ? { id: subscription.id, planCode: subscription.planCode, status: subscription.status, cycle: subscription.cycle }
        : null,
      invoices: invoices.map((row) => ({ id: row.id, amount: dec(row.amount), status: row.status, dueAt: row.dueAt.toISOString() })),
      documents: documents.map(publicDoc),
      audits: audits.map(publicAudit),
    };
  }

  async openPharmacy(
    actor: PlatformActor,
    input: {
      tradeNameAr: string;
      tradeNameEn: string;
      displayName: string;
      email: string;
      phone: string;
      password: string;
      branchCount: number;
      management: 'INDEPENDENT' | 'SHARED';
      branchNameAr: string;
      branchNameEn: string;
    },
  ) {
    allow(actor, 'tenant.approve');
    const passwordHash = await this.passwords.hash(input.password);
    let created: { tenantId: string };
    try {
      created = await this.prisma.client.$transaction(async (tx) => {
        try {
          const result = await provisionPharmacy(tx, {
            tradeNameAr: input.tradeNameAr,
            tradeNameEn: input.tradeNameEn,
            phone: input.phone,
            email: input.email,
            displayName: input.displayName,
            passwordHash,
            branchCount: input.branchCount,
            management: input.management,
            branchNameAr: input.branchNameAr,
            branchNameEn: input.branchNameEn,
          });
          await tx.tenant.update({ where: { id: result.tenantId }, data: { ownerName: input.displayName } });
          return result;
        } finally {
          try {
            await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
          } catch (error) {
            logger.warn({ err: error }, 'failed to clear tenant session context');
          }
        }
      }, { maxWait: 20_000, timeout: 60_000 });
    } catch (error) {
      const field = takenField(error);
      if (field) throw new DomainError('VALIDATION_ERROR', 409, { fields: { [field]: 'taken' } });
      logger.error({ err: error }, 'open pharmacy failed');
      throw error;
    }
    await this.audit(actor.id, 'tenant.register', 'Tenant', created.tenantId, '', {
      email: input.email,
      branchCount: input.branchCount,
      management: input.management,
    });
    return { tenantId: created.tenantId, email: input.email };
  }

  async listPendingSignups(actor: PlatformActor) {
    allow(actor, 'tenant.read');
    const tenants = await this.prisma.client.tenant.findMany({
      where: { verificationStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(tenants.map(async (tenant) => {
      const extra = await this.prisma.withTenant(tenant.id, async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { tenantId: tenant.id, isDeleted: false },
          orderBy: { createdAt: 'asc' },
        });
        const setting = await tx.pharmacySetting.findFirst({ where: { tenantId: tenant.id, key: 'management' } });
        return { branch, management: setting?.valueEn ?? '' };
      });
      return {
        id: tenant.id,
        tradeNameAr: tenant.tradeNameAr,
        tradeNameEn: tenant.tradeNameEn,
        ownerName: tenant.ownerName,
        email: tenant.email,
        phone: tenant.phone,
        type: tenant.type,
        branchLimit: tenant.branchLimit,
        branchNameAr: extra.branch?.nameAr ?? '',
        branchNameEn: extra.branch?.nameEn ?? '',
        management: extra.management,
        createdAt: tenant.createdAt.toISOString(),
      };
    }));
  }

  async rejectSignIn(actor: PlatformActor, id: string, reason: string) {
    allow(actor, 'tenant.approve');
    const tenant = await this.mustTenant(id);
    if (tenant.verificationStatus !== 'PENDING') throw new DomainError('REQUEST_STEP', 409);
    await this.prisma.client.tenant.update({ where: { id }, data: { verificationStatus: 'REJECTED' } });
    await this.audit(actor.id, 'tenant.reject', 'Tenant', id, reason);
    return { ok: true };
  }

  async approveSignIn(actor: PlatformActor, id: string, reason: string) {
    allow(actor, 'tenant.approve');
    await this.mustTenant(id);
    await this.prisma.client.tenant.update({ where: { id }, data: { verificationStatus: 'VALID' } });
    await this.audit(actor.id, 'tenant.approve', 'Tenant', id, reason);
    return { ok: true };
  }

  async setTenantStatus(actor: PlatformActor, id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) {
    allow(actor, 'tenant.suspend');
    const tenant = await this.mustTenant(id);
    if (status === 'ACTIVE' && !canActivateTenant(tenant.verificationStatus, actor.roleCode, reason)) {
      throw new DomainError('VERIFICATION_REQUIRED', 409);
    }
    await this.prisma.client.tenant.update({
      where: { id },
      data: { status, readOnly: status === 'SUSPENDED' },
    });
    await this.audit(actor.id, status === 'SUSPENDED' ? 'tenant.suspend' : 'tenant.reactivate', 'Tenant', id, reason);
    return { ok: true };
  }

  async extendTrial(actor: PlatformActor, id: string, days: number, reason: string) {
    allow(actor, 'tenant.approve');
    const tenant = await this.mustTenant(id);
    const base = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await this.prisma.client.tenant.update({ where: { id }, data: { trialEndsAt, status: 'TRIAL' } });
    await this.audit(actor.id, 'tenant.trial', 'Tenant', id, reason, { days });
    return { trialEndsAt: trialEndsAt.toISOString() };
  }

  async changePlan(actor: PlatformActor, id: string, planCode: string, reason: string) {
    allow(actor, 'billing.write');
    const plan = await this.prisma.client.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new DomainError('NOT_FOUND', 404);
    await this.mustTenant(id);
    const current = await this.prisma.client.subscription.findFirst({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } });
    if (current) {
      await this.prisma.client.subscription.update({ where: { id: current.id }, data: { planCode } });
    } else {
      await this.prisma.client.subscription.create({ data: { tenantId: id, planCode, status: 'TRIAL', cycle: 'MONTHLY' } });
    }
    await this.prisma.client.tenant.update({ where: { id }, data: { featureFlags: plan.features } });
    await this.audit(actor.id, 'tenant.plan', 'Tenant', id, reason, { planCode });
    return { ok: true };
  }

  async resetPassword(actor: PlatformActor, tenantId: string, userId: string) {
    allow(actor, 'user.manage');
    const password = randomBytes(12).toString('base64url');
    const passwordHash = await this.passwords.hash(password);
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.updateMany({ where: { id: userId, tenantId }, data: { passwordHash, failedLogins: 0, lockedAt: null } }),
    );
    if (updated.count !== 1) throw new DomainError('NOT_FOUND', 404);
    await this.audit(actor.id, 'tenant.reset_password', 'User', userId, '', { tenantId });
    return { password };
  }

  async resetPin(actor: PlatformActor, tenantId: string, userId: string, pin: string) {
    allow(actor, 'user.manage');
    const pinHash = await this.passwords.hash(pin);
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.updateMany({ where: { id: userId, tenantId }, data: { pinHash } }),
    );
    if (updated.count !== 1) throw new DomainError('NOT_FOUND', 404);
    await this.audit(actor.id, 'tenant.reset_pin', 'User', userId, '', { tenantId });
    return { ok: true };
  }

  async setUserState(actor: PlatformActor, tenantId: string, userId: string, action: 'disable' | 'lock' | 'otp' | 'enable', reason: string) {
    allow(actor, 'user.manage');
    let otp = '';
    const data =
      action === 'disable'
        ? { isActive: false }
        : action === 'lock'
          ? { isActive: false, lockedAt: new Date() }
          : action === 'enable'
            ? { isActive: true, lockedAt: null, failedLogins: 0 }
            : { forceOtp: true, otpHash: '', otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000) };
    if (action === 'otp') {
      otp = String(randomInt(100000, 999999));
      data.otpHash = await this.passwords.hash(otp);
    }
    const updated = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.updateMany({ where: { id: userId, tenantId }, data }),
    );
    if (updated.count !== 1) throw new DomainError('NOT_FOUND', 404);
    await this.audit(actor.id, `tenant.user_${action}`, 'User', userId, reason, { tenantId });
    return { ok: true, otp };
  }

  async createAdmin(
    actor: PlatformActor,
    tenantId: string,
    input: { displayName: string; email: string; phone: string; branchId: string },
  ) {
    allow(actor, 'user.manage');
    const password = randomBytes(12).toString('base64url');
    const passwordHash = await this.passwords.hash(password);
    const userId = await this.prisma.withTenant(tenantId, async (tx) => {
      const role = await tx.role.findFirst({ where: { tenantId, code: 'OWNER' } });
      const branch = await tx.branch.findFirst({ where: { tenantId, id: input.branchId, isDeleted: false } });
      if (!role || !branch) throw new DomainError('NOT_FOUND', 404);
      const user = await tx.user.create({
        data: {
          tenantId,
          email: input.email,
          phone: input.phone || null,
          displayName: input.displayName,
          passwordHash,
          createdBy: null,
        },
      });
      await tx.userBranchRole.create({
        data: { tenantId, userId: user.id, branchId: branch.id, roleId: role.id },
      });
      return user.id;
    }).catch((error: unknown) => {
      const field = takenField(error);
      if (field) throw new DomainError('VALIDATION_ERROR', 409, { fields: { [field]: 'taken' } });
      throw error;
    });
    await this.prisma.client.tenantAdminInvite.create({
      data: { tenantId, email: input.email, displayName: input.displayName, status: 'CREATED' },
    });
    await this.audit(actor.id, 'tenant.create_admin', 'User', userId, '', { tenantId });
    return { userId, password };
  }

  async setReadOnly(actor: PlatformActor, id: string, readOnly: boolean, reason: string) {
    allow(actor, 'tenant.suspend');
    await this.mustTenant(id);
    await this.prisma.client.tenant.update({ where: { id }, data: { readOnly } });
    await this.audit(actor.id, readOnly ? 'tenant.readonly' : 'tenant.writable', 'Tenant', id, reason);
    return { ok: true };
  }

  async impersonate(actor: PlatformActor, tenantId: string, userId: string, reason: string) {
    allow(actor, 'tenant.impersonate');
    const user = await this.prisma.withTenant(tenantId, (tx) =>
      tx.user.findFirst({ where: { id: userId, tenantId, isActive: true, isDeleted: false } }),
    );
    if (!user) throw new DomainError('NOT_FOUND', 404);
    const code = randomBytes(24).toString('hex');
    await this.prisma.client.impersonationGrant.create({
      data: {
        codeHash: hashToken(code),
        tenantId,
        userId,
        reason,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    await this.audit(actor.id, 'tenant.impersonate', 'Tenant', tenantId, reason, { userId });
    return { url: `${this.config.webOrigin}/?impersonate=${code}` };
  }

  async notes(actor: PlatformActor, id: string, supportNotes: string) {
    allow(actor, 'tenant.read');
    await this.mustTenant(id);
    await this.prisma.client.tenant.update({ where: { id }, data: { supportNotes } });
    await this.audit(actor.id, 'tenant.notes', 'Tenant', id);
    return { ok: true };
  }

  async submitRequest(input: RequestInput) {
    const plan = await this.prisma.client.plan.findUnique({ where: { code: input.planCode } });
    if (!plan || !plan.isActive) throw new DomainError('VALIDATION_ERROR', 400);
    const request = await this.prisma.client.subscriptionRequest.create({
      data: {
        status: 'SUBMITTED',
        tradeNameAr: input.tradeNameAr,
        tradeNameEn: input.tradeNameEn,
        ownerName: input.ownerName,
        ownerPhone: input.ownerPhone,
        ownerEmail: input.ownerEmail,
        pharmacistName: input.pharmacistName,
        pharmacistLicense: input.pharmacistLicense,
        pharmacyLicense: input.pharmacyLicense,
        stateName: input.stateName,
        city: input.city,
        addressLine: input.addressLine,
        planCode: input.planCode,
        branchCount: input.branchCount,
        userCount: input.userCount,
        deviceCount: input.deviceCount,
        note: input.note,
      },
    });
    await this.prisma.client.verificationDocument.createMany({
      data: [
        {
          requestId: request.id,
          kind: 'PHARMACY_LICENSE',
          licenseNumber: input.pharmacyLicense,
          status: 'PENDING',
          fileName: input.pharmacyFileName,
          content: input.pharmacyFile || null,
          expiresOn: input.pharmacyExpiry ? new Date(input.pharmacyExpiry) : null,
        },
        {
          requestId: request.id,
          kind: 'PHARMACIST_LICENSE',
          licenseNumber: input.pharmacistLicense,
          status: 'PENDING',
          fileName: input.pharmacistFileName,
          content: input.pharmacistFile || null,
          expiresOn: input.pharmacistExpiry ? new Date(input.pharmacistExpiry) : null,
        },
      ],
    });
    const prices = planPrices({ monthlyPrice: dec(plan.monthlyPrice), yearlyPrice: dec(plan.yearlyPrice), limits: plan.limits });
    const billingCycle = isBillingCycle(input.billingCycle) ? input.billingCycle : 'MONTHLY';
    const amount = subscriptionCharge(
      plan.code,
      unitForCycle(prices, billingCycle),
      billingCycle === 'MONTHLY' ? dec(plan.headOfficeFee) : '0.00',
      input.branchCount,
    );
    await this.audit(null, 'request.submit', 'SubscriptionRequest', request.id, '', { billingCycle, amount });
    return { id: request.id, status: request.status };
  }

  async listRequests(actor: PlatformActor, status: string | undefined) {
    allow(actor, 'request.review');
    const rows = await this.prisma.client.subscriptionRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      tradeNameAr: row.tradeNameAr,
      tradeNameEn: row.tradeNameEn,
      ownerName: row.ownerName,
      ownerPhone: row.ownerPhone,
      ownerEmail: row.ownerEmail,
      city: row.city,
      planCode: row.planCode,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async requestDetail(actor: PlatformActor, id: string) {
    allow(actor, 'request.review');
    const row = await this.prisma.client.subscriptionRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 404);
    const documents = await this.prisma.client.verificationDocument.findMany({ where: { requestId: id } });
    const quote = await this.submittedQuote(id);
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt?.toISOString() ?? null,
      billingCycle: quote.billingCycle,
      quotedAmount: quote.amount,
      documents: documents.map(publicDoc),
    };
  }

  async moveRequest(actor: PlatformActor, id: string, status: string, reason: string) {
    allow(actor, 'request.review');
    const row = await this.mustRequest(id);
    try {
      assertRequestStep(row.status, status);
    } catch {
      throw new DomainError('REQUEST_STEP', 409);
    }
    if ((status === 'REJECTED' || status === 'NEED_MORE_INFO') && reason.trim().length < 3) {
      throw new DomainError('VALIDATION_ERROR', 400);
    }
    if (status === 'VERIFIED') await this.requireValidDocs(id);
    await this.prisma.client.subscriptionRequest.update({
      where: { id },
      data: { status, rejectionReason: status === 'REJECTED' ? reason : row.rejectionReason, updatedAt: new Date() },
    });
    await this.audit(actor.id, 'request.status', 'SubscriptionRequest', id, reason, { status });
    return { ok: true };
  }

  async verifyDocument(actor: PlatformActor, id: string, documentId: string, status: string, reason: string, expiresOn: string) {
    allow(actor, 'request.review');
    const doc = await this.prisma.client.verificationDocument.findFirst({ where: { id: documentId, requestId: id } });
    if (!doc) throw new DomainError('NOT_FOUND', 404);
    if ((status === 'REJECTED' || status === 'NEEDS_RENEWAL') && reason.trim().length < 3) {
      throw new DomainError('VALIDATION_ERROR', 400);
    }
    await this.prisma.client.verificationDocument.update({
      where: { id: documentId },
      data: {
        status,
        rejectionReason: reason,
        verifiedBy: actor.id,
        verifiedAt: new Date(),
        expiresOn: expiresOn ? new Date(expiresOn) : doc.expiresOn,
      },
    });
    await this.audit(actor.id, 'document.verify', 'VerificationDocument', documentId, reason, { status });
    return { ok: true };
  }

  async documentFile(actor: PlatformActor, id: string) {
    if (!actor.permissions.includes('request.review') && !actor.permissions.includes('audit.read')) {
      throw new DomainError('UNAUTHORIZED', 403);
    }
    const doc = await this.prisma.client.verificationDocument.findUnique({ where: { id } });
    if (!doc) throw new DomainError('NOT_FOUND', 404);
    return { fileName: doc.fileName, content: doc.content ?? '' };
  }

  async createTenant(actor: PlatformActor, id: string, overrideReason: string) {
    allow(actor, 'tenant.approve');
    const row = await this.mustRequest(id);
    if (row.status !== 'APPROVED') throw new DomainError('REQUEST_STEP', 409);
    const docsOk = await this.docsValid(id);
    if (!docsOk && !canActivateTenant('PENDING', actor.roleCode, overrideReason)) {
      throw new DomainError('VERIFICATION_REQUIRED', 409);
    }
    const plan = await this.prisma.client.plan.findUnique({ where: { code: row.planCode } });
    if (!plan) throw new DomainError('NOT_FOUND', 404);
    const password = randomBytes(12).toString('base64url');
    const passwordHash = await this.passwords.hash(password);
    let created: { tenantId: string };
    try {
      created = await this.prisma.client.$transaction(async (tx) => {
      try {
        const result = await provisionPharmacy(tx, {
          tradeNameAr: row.tradeNameAr,
          tradeNameEn: row.tradeNameEn,
          phone: row.ownerPhone,
          email: row.ownerEmail,
          displayName: row.ownerName,
          passwordHash,
          branchCount: row.branchCount,
          management: row.branchCount > 1 ? 'SHARED' : 'INDEPENDENT',
          branchNameAr: 'الفرع الرئيسي',
          branchNameEn: 'Main branch',
        });
        await tx.tenant.update({
          where: { id: result.tenantId },
          data: {
            ownerName: row.ownerName,
            addressLine: `${row.stateName} - ${row.city} - ${row.addressLine}`,
            pharmacistName: row.pharmacistName,
            pharmacistLicense: row.pharmacistLicense,
            licenseNumber: row.pharmacyLicense,
            verificationStatus: docsOk ? 'VALID' : 'PENDING',
            featureFlags: plan.features,
          },
        });
        const quote = await this.submittedQuote(id);
        const prices = planPrices({ monthlyPrice: dec(plan.monthlyPrice), yearlyPrice: dec(plan.yearlyPrice), limits: plan.limits });
        const amount = quote.amount || subscriptionCharge(
          plan.code,
          unitForCycle(prices, quote.billingCycle),
          quote.billingCycle === 'MONTHLY' ? dec(plan.headOfficeFee) : '0.00',
          row.branchCount,
        );
        const subscription = await tx.subscription.create({
          data: { tenantId: result.tenantId, planCode: plan.code, status: 'TRIAL', cycle: quote.billingCycle, trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
        });
        await tx.subscriptionInvoice.create({
          data: {
            tenantId: result.tenantId,
            subscriptionId: subscription.id,
            amount,
            status: 'ISSUED',
            dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        await tx.verificationDocument.updateMany({ where: { requestId: id }, data: { tenantId: result.tenantId } });
        await tx.subscriptionRequest.update({
          where: { id },
          data: { status: 'TENANT_CREATED', tenantId: result.tenantId, updatedAt: new Date() },
        });
        return result;
      } finally {
        try {
          await tx.$executeRaw`EXEC sp_set_session_context @key = N'TenantId', @value = NULL, @read_only = 0`;
        } catch (error) {
          logger.warn({ err: error }, 'failed to clear tenant session context');
        }
      }
    }, { maxWait: 20_000, timeout: 60_000 });
    } catch (error) {
      const field = takenField(error);
      if (field) throw new DomainError('VALIDATION_ERROR', 409, { fields: { [field]: 'taken' } });
      logger.error({ err: error }, 'create tenant failed');
      throw error;
    }
    await this.audit(actor.id, 'request.create_tenant', 'Tenant', created.tenantId, overrideReason, { requestId: id });
    return { tenantId: created.tenantId, email: row.ownerEmail, password };
  }

  async listMedicines(actor: PlatformActor, query: { q: string; form: string; category: string }) {
    allow(actor, 'catalog.write');
    const needle = query.q.trim();
    const rows = await this.prisma.client.standardMedicine.findMany({
      where: {
        ...(query.form ? { form: query.form } : {}),
        ...(query.category ? { atcCode: { startsWith: query.category } } : {}),
        ...(needle
          ? {
              OR: [
                { code: { contains: needle } },
                { nameAr: { contains: needle } },
                { nameEn: { contains: needle } },
                { genericName: { contains: needle } },
                { manufacturer: { contains: needle } },
                { ingredients: { contains: needle } },
                { categoryAr: { contains: needle } },
                { categoryEn: { contains: needle } },
              ],
            }
          : {}),
      },
      orderBy: { nameEn: 'asc' },
      take: 200,
    });
    const total = await this.prisma.client.standardMedicine.count({
      where: {
        ...(query.form ? { form: query.form } : {}),
        ...(query.category ? { atcCode: { startsWith: query.category } } : {}),
        ...(needle
          ? {
              OR: [
                { code: { contains: needle } },
                { nameAr: { contains: needle } },
                { nameEn: { contains: needle } },
                { genericName: { contains: needle } },
                { manufacturer: { contains: needle } },
                { ingredients: { contains: needle } },
                { categoryAr: { contains: needle } },
                { categoryEn: { contains: needle } },
              ],
            }
          : {}),
      },
    });
    return {
      total,
      rows: rows.map((row) => ({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      genericName: row.genericName,
      strength: row.strength,
      form: row.form,
      manufacturer: row.manufacturer,
      ingredients: row.ingredients,
      categoryAr: row.categoryAr,
      categoryEn: row.categoryEn,
      atcCode: row.atcCode,
      route: row.route,
    })),
    };
  }

  async downloadMedicineLibrary(actor: PlatformActor, mode: 'download' | 'update' = 'download') {
    allow(actor, 'catalog.write');
    const world = JSON.parse(readFileSync(join(__dirname, 'data', 'medicine-catalog.json'), 'utf8')) as LibraryMedicine[];
    const [knownMedicines, knownItems] = await Promise.all([
      this.prisma.client.standardMedicine.findMany({ select: { code: true } }),
      this.prisma.client.globalCatalogItem.findMany({ select: { code: true } }),
    ]);
    const medicineCodes = new Set(knownMedicines.map((row) => row.code));
    const itemCodes = new Set(knownItems.map((row) => row.code));
    const freshMedicines = world.filter((row) => !medicineCodes.has(row.code));
    const freshItems = mode === 'download' ? world.filter((row) => !itemCodes.has(row.code)) : [];
    let created = 0;
    let updated = 0;
    if (mode === 'update') {
      updated += await this.refreshKnown(world.filter((row) => medicineCodes.has(row.code)));
    }
    const incoming = mode === 'download' ? freshMedicines : [];
    for (let index = 0; index < incoming.length; index += 40) {
      const slice = incoming.slice(index, index + 40);
      const inserted = await this.prisma.client.standardMedicine.createMany({
        data: slice.map((row) => ({
          code: row.code,
          nameAr: plainMedicineName(row.nameAr),
          nameEn: plainMedicineName(row.nameEn),
          genericName: plainMedicineName(row.genericName),
          form: row.form,
          strength: row.strength,
          categoryAr: row.categoryAr,
          categoryEn: row.categoryEn,
          route: row.route,
          manufacturer: row.manufacturer,
          country: row.country,
          ingredients: row.ingredients,
          atcCode: row.atcCode,
          status: 'PUBLISHED',
          isControlled: row.isControlled,
          requiresPrescription: row.requiresPrescription,
        })),
      });
      created += inserted.count;
    }
    for (let index = 0; index < freshItems.length; index += 40) {
      const slice = freshItems.slice(index, index + 40);
      await this.prisma.client.globalCatalogItem.createMany({
        data: slice.map((row) => ({
          code: row.code,
          itemType: row.form === 'DEVICE' ? 'Medical devices' : row.form === 'CONSUMABLE' ? 'Consumables' : 'Medicine',
          nameAr: plainMedicineName(row.nameAr),
          nameEn: plainMedicineName(row.nameEn),
          genericName: plainMedicineName(row.genericName),
          strength: row.strength,
          dosageForm: row.form,
          manufacturer: row.manufacturer,
          country: row.country,
          categoryName: row.categoryEn,
          atcCode: row.atcCode,
          isControlled: row.isControlled,
          requiresPrescription: row.requiresPrescription,
          storageCondition: '',
          status: 'active',
        })),
      });
    }
    for (const row of MEDICINE_LIBRARY) {
      const exists = await this.prisma.client.standardMedicine.findUnique({ where: { code: row.code } });
      await this.upsertLibraryRow(row);
      if (!exists) created += 1;
      else if (!medicineCodes.has(row.code)) updated += 1;
    }
    let enriched = 0;
    for (const row of MEDICINE_ENRICH) {
      const exists = await this.prisma.client.standardMedicine.findUnique({ where: { code: row.code } });
      if (!exists) continue;
      await this.prisma.client.standardMedicine.update({
        where: { code: row.code },
        data: {
          form: row.form,
          manufacturer: row.manufacturer,
          ingredients: row.ingredients,
          atcCode: row.atcCode,
          categoryAr: row.categoryAr,
          categoryEn: row.categoryEn,
          strength: row.strength,
        },
      });
      enriched += 1;
    }
    await this.audit(actor.id, 'catalog.library', 'StandardMedicine', 'library', '', { created, updated, enriched });
    return {
      created,
      updated,
      enriched,
      total: world.length,
      withArabic: world.filter((row) => /[\u0600-\u06FF]/.test(row.nameAr)).length,
      categories: new Set(world.map((row) => row.atcCode.charAt(0)).filter((letter) => letter)).size,
      forms: new Set([...world, ...MEDICINE_LIBRARY].map((row) => row.form)).size,
    };
  }

  async listCatalog(actor: PlatformActor, q = '') {
    allow(actor, 'catalog.write');
    const needle = q.trim();
    const where = needle
      ? {
          OR: [
            { code: { contains: needle } },
            { nameAr: { contains: needle } },
            { nameEn: { contains: needle } },
            { genericName: { contains: needle } },
            { manufacturer: { contains: needle } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.client.globalCatalogItem.count({ where }),
      this.prisma.client.globalCatalogItem.findMany({
        where,
        orderBy: { nameEn: 'asc' },
        take: 40,
        include: { barcodes: true, units: true },
      }),
    ]);
    return { total, rows };
  }

  async saveCatalog(
    actor: PlatformActor,
    input: {
      id?: string;
      code: string;
      itemType: string;
      nameAr: string;
      nameEn: string;
      genericName: string;
      strength: string;
      dosageForm: string;
      manufacturer: string;
      country: string;
      categoryName: string;
      atcCode: string;
      barcode: string;
      unitName: string;
      factorToBase: number;
      isControlled: boolean;
      requiresPrescription: boolean;
      storageCondition: string;
      status: string;
    },
  ) {
    allow(actor, 'catalog.write');
    const data = {
      code: input.code,
      itemType: input.itemType,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      genericName: input.genericName,
      strength: input.strength,
      dosageForm: input.dosageForm,
      manufacturer: input.manufacturer,
      country: input.country,
      categoryName: input.categoryName,
      atcCode: input.atcCode,
      isControlled: input.isControlled,
      requiresPrescription: input.requiresPrescription,
      storageCondition: input.storageCondition,
      status: input.status,
    };
    const item = input.id
      ? await this.prisma.client.globalCatalogItem.update({ where: { id: input.id }, data })
      : await this.prisma.client.globalCatalogItem.create({ data });
    if (input.barcode) {
      await this.prisma.client.globalCatalogBarcode.deleteMany({ where: { itemId: item.id } });
      await this.prisma.client.globalCatalogBarcode.create({ data: { itemId: item.id, code: input.barcode } });
    }
    if (input.unitName) {
      await this.prisma.client.globalCatalogUnit.deleteMany({ where: { itemId: item.id } });
      await this.prisma.client.globalCatalogUnit.create({
        data: { itemId: item.id, unitName: input.unitName, factorToBase: input.factorToBase },
      });
    }
    if (input.status === 'active') await this.publishStandard(item.id);
    await this.audit(actor.id, input.id ? 'catalog.update' : 'catalog.create', 'GlobalCatalogItem', item.id);
    return { id: item.id };
  }

  async pushCatalog(actor: PlatformActor, id: string) {
    allow(actor, 'catalog.write');
    await this.publishStandard(id);
    await this.audit(actor.id, 'catalog.push', 'GlobalCatalogItem', id);
    return { ok: true };
  }

  async listItemRequests(actor: PlatformActor) {
    allow(actor, 'catalog.write');
    const rows = await this.prisma.client.newCatalogItemRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    const catalog = await this.prisma.client.globalCatalogItem.findMany({ take: 200 });
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      suggestions: catalog
        .filter((item) => item.nameAr.includes(row.nameAr) || item.genericName.toLowerCase().includes(row.genericName.toLowerCase()))
        .slice(0, 5)
        .map((item) => ({ id: item.id, code: item.code, nameAr: item.nameAr })),
    }));
  }

  async decideItem(actor: PlatformActor, id: string, status: string, reason: string, mergedItemId: string) {
    allow(actor, 'catalog.write');
    const row = await this.prisma.client.newCatalogItemRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 404);
    if (status === 'REJECTED' && reason.trim().length < 3) throw new DomainError('VALIDATION_ERROR', 400, { fields: { reason: 'required' } });
    let nextStatus = status;
    let createdId = mergedItemId;
    if (status === 'APPROVED') {
      const code = `REQ-${id.slice(0, 8)}`;
      const existing = await this.prisma.client.globalCatalogItem.findFirst({
        where: { OR: [{ code }, { nameAr: row.nameAr, nameEn: row.nameEn }] },
      });
      if (existing) {
        nextStatus = 'DUPLICATE_SUSPECTED';
        createdId = existing.id;
      } else {
        try {
          const saved = await this.saveCatalog(actor, {
            code,
            itemType: 'Medicine',
            nameAr: row.nameAr,
            nameEn: row.nameEn,
            genericName: row.genericName,
            strength: '',
            dosageForm: 'TABLET',
            manufacturer: '',
            country: '',
            categoryName: 'عام',
            atcCode: '',
            barcode: row.barcode,
            unitName: 'علبة',
            factorToBase: 1,
            isControlled: false,
            requiresPrescription: false,
            storageCondition: '',
            status: 'active',
          });
          createdId = saved.id;
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (!message.includes('Unique constraint')) throw error;
          const match = await this.prisma.client.globalCatalogItem.findFirst({
            where: { OR: [{ code }, { nameAr: row.nameAr }] },
          });
          nextStatus = 'DUPLICATE_SUSPECTED';
          createdId = match?.id ?? createdId;
        }
      }
    }
    if (nextStatus === 'DUPLICATE_SUSPECTED' && !createdId) {
      const match = await this.prisma.client.globalCatalogItem.findFirst({
        where: {
          OR: [
            { nameAr: row.nameAr },
            { nameEn: row.nameEn },
            ...(row.barcode ? [{ barcodes: { some: { code: row.barcode } } }] : []),
          ],
        },
      });
      createdId = match?.id ?? '';
    }
    await this.prisma.client.newCatalogItemRequest.update({
      where: { id },
      data: { status: nextStatus, decisionNote: reason, mergedItemId: createdId || null },
    });
    await this.audit(actor.id, 'catalog.decide', 'NewCatalogItemRequest', id, reason, { status: nextStatus });
    return { ok: true, status: nextStatus };
  }

  async listPartners(actor: PlatformActor) {
    allow(actor, 'partner.write');
    const now = new Date();
    const rows = await this.prisma.client.partner.findMany({ include: { licenses: true }, orderBy: { name: 'asc' } });
    return rows.map((row) => ({
      ...row,
      tenantIds: ids(row.tenantIds),
      licenses: row.licenses.map((license) => ({
        ...license,
        issuedOn: license.issuedOn?.toISOString().slice(0, 10) ?? null,
        expiresOn: license.expiresOn.toISOString().slice(0, 10),
        alert: licenseNeedsAlert(license.expiresOn, now),
      })),
    }));
  }

  async savePartner(
    actor: PlatformActor,
    input: {
      name: string;
      partnerType: string;
      contactName: string;
      phone: string;
      email: string;
      licenseNumber: string;
      issuedOn: string;
      expiresOn: string;
      modules: string;
      notes: string;
    },
  ) {
    allow(actor, 'partner.write');
    const partner = await this.prisma.client.partner.create({
      data: {
        name: input.name,
        partnerType: input.partnerType,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        status: 'ACTIVE',
        modules: input.modules,
        notes: input.notes,
      },
    });
    await this.prisma.client.partnerLicense.create({
      data: {
        partnerId: partner.id,
        licenseNumber: input.licenseNumber,
        issuedOn: input.issuedOn ? new Date(input.issuedOn) : null,
        expiresOn: new Date(input.expiresOn),
        status: 'VALID',
      },
    });
    await this.audit(actor.id, 'partner.create', 'Partner', partner.id);
    return { id: partner.id };
  }

  async linkPartner(actor: PlatformActor, id: string, tenantId: string, reason: string) {
    allow(actor, 'partner.write');
    const partner = await this.prisma.client.partner.findUnique({ where: { id }, include: { licenses: true } });
    if (!partner) throw new DomainError('NOT_FOUND', 404);
    const license = partner.licenses[0];
    if (license && license.expiresOn.getTime() < Date.now() && !canLinkExpiredPartner(actor.roleCode, reason)) {
      throw new DomainError('PARTNER_EXPIRED', 409);
    }
    const linked = ids(partner.tenantIds);
    if (!linked.includes(tenantId)) linked.push(tenantId);
    await this.prisma.client.partner.update({ where: { id }, data: { tenantIds: JSON.stringify(linked) } });
    await this.audit(actor.id, 'partner.link', 'Partner', id, reason, { tenantId });
    return { ok: true };
  }

  async listPlans(actor: PlatformActor) {
    allow(actor, 'billing.write');
    return this.planOffers(false);
  }

  async publicPlans() {
    return this.planOffers(true);
  }

  async savePlanPrices(
    actor: PlatformActor,
    plans: { code: string; monthlyPrice: string; dailyPrice: string; yearlyPrice: string; paygPrice: string }[],
  ) {
    allow(actor, 'billing.write');
    for (const input of plans) {
      const row = await this.prisma.client.plan.findUnique({ where: { code: input.code } });
      if (!row) throw new DomainError('NOT_FOUND', 404);
      await this.prisma.client.plan.update({
        where: { code: input.code },
        data: {
          monthlyPrice: money(input.monthlyPrice),
          yearlyPrice: money(input.yearlyPrice),
          limits: mergeLimitPrices(row.limits, input.dailyPrice, input.paygPrice),
        },
      });
      await this.audit(actor.id, 'plan.price', 'Plan', row.id, '', {
        monthlyPrice: money(input.monthlyPrice),
        dailyPrice: money(input.dailyPrice),
        yearlyPrice: money(input.yearlyPrice),
        paygPrice: money(input.paygPrice),
      });
    }
    return { ok: true };
  }

  async savePlan(actor: PlatformActor, input: { code: string; nameAr: string; nameEn: string; monthlyPrice: string; tenantType: string }) {
    allow(actor, 'billing.write');
    const row = await this.prisma.client.plan.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        tenantType: input.tenantType,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        monthlyPrice: input.monthlyPrice,
        yearlyPrice: input.monthlyPrice,
        setupFee: '0.00',
        headOfficeFee: '0.00',
        features: '[]',
        limits: '{}',
      },
      update: { nameAr: input.nameAr, nameEn: input.nameEn, monthlyPrice: input.monthlyPrice },
    });
    await this.audit(actor.id, 'plan.save', 'Plan', row.id);
    return { id: row.id };
  }

  async listInvoices(actor: PlatformActor) {
    allow(actor, 'billing.write');
    const rows = await this.prisma.client.subscriptionInvoice.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((row) => ({ id: row.id, tenantId: row.tenantId, amount: dec(row.amount), status: row.status, dueAt: row.dueAt.toISOString() }));
  }

  async creditInvoice(actor: PlatformActor, id: string, amount: string, reason: string) {
    allow(actor, 'billing.write');
    const row = await this.prisma.client.subscriptionInvoice.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 404);
    const next = subMoney(dec(row.amount), money(amount));
    if (next.startsWith('-')) throw new DomainError('VALIDATION_ERROR', 400);
    await this.prisma.client.subscriptionInvoice.update({ where: { id }, data: { amount: next } });
    await this.audit(actor.id, 'invoice.credit', 'SubscriptionInvoice', id, reason, { amount });
    return { amount: next };
  }

  async addProof(actor: PlatformActor, invoiceId: string, method: string, note: string, fileName: string) {
    allow(actor, 'billing.write');
    const invoice = await this.prisma.client.subscriptionInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new DomainError('NOT_FOUND', 404);
    const proof = await this.prisma.client.paymentProof.create({
      data: { invoiceId, method, note, fileName, status: 'SUBMITTED' },
    });
    await this.audit(actor.id, 'proof.submit', 'PaymentProof', proof.id);
    return { id: proof.id };
  }

  async listProofs(actor: PlatformActor) {
    allow(actor, 'billing.write');
    return this.prisma.client.paymentProof.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async reviewProof(actor: PlatformActor, id: string, status: 'APPROVED' | 'REJECTED', reason: string) {
    allow(actor, 'billing.write');
    const proof = await this.prisma.client.paymentProof.findUnique({ where: { id } });
    if (!proof) throw new DomainError('NOT_FOUND', 404);
    if (status === 'REJECTED' && reason.trim().length < 3) throw new DomainError('VALIDATION_ERROR', 400);
    const invoice = await this.prisma.client.subscriptionInvoice.findUnique({ where: { id: proof.invoiceId } });
    if (!invoice) throw new DomainError('NOT_FOUND', 404);
    if (status === 'APPROVED') {
      const tenant = await this.mustTenant(invoice.tenantId);
      if (!canActivateTenant(tenant.verificationStatus, actor.roleCode, reason)) {
        throw new DomainError('VERIFICATION_REQUIRED', 409);
      }
      await this.prisma.client.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });
      await this.prisma.client.subscription.updateMany({ where: { tenantId: invoice.tenantId }, data: { status: 'ACTIVE' } });
      await this.prisma.client.tenant.update({ where: { id: invoice.tenantId }, data: { status: 'ACTIVE', readOnly: false } });
      await this.prisma.client.subscriptionRequest.updateMany({
        where: { tenantId: invoice.tenantId, status: 'TENANT_CREATED' },
        data: { status: 'ACTIVE', updatedAt: new Date() },
      });
    }
    await this.prisma.client.paymentProof.update({
      where: { id },
      data: { status, reviewedBy: actor.id, reviewedAt: new Date(), note: reason || proof.note },
    });
    await this.audit(actor.id, 'proof.review', 'PaymentProof', id, reason, { status });
    return { ok: true };
  }

  async listUsers(actor: PlatformActor) {
    allow(actor, 'user.manage');
    const rows = await this.prisma.client.platformUser.findMany({ include: { role: true }, orderBy: { displayName: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      roleCode: row.role.code,
      isActive: row.isActive,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    }));
  }

  async saveUser(actor: PlatformActor, input: { email: string; displayName: string; password: string; roleCode: string }) {
    allow(actor, 'user.manage');
    const role = await this.prisma.client.platformRole.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new DomainError('NOT_FOUND', 404);
    const row = await this.prisma.client.platformUser.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await this.passwords.hash(input.password),
        roleId: role.id,
      },
    });
    await this.audit(actor.id, 'platform.user', 'PlatformUser', row.id);
    return { id: row.id };
  }

  async pharmacyAccounts(actor: PlatformActor) {
    allow(actor, 'tenant.read');
    const tenants = await this.prisma.client.tenant.findMany({ orderBy: { tradeNameAr: 'asc' }, take: 40 });
    const accounts = [];
    for (const tenant of tenants) {
      const users = await this.people(tenant.id);
      for (const user of users.users) {
        accounts.push({ tenantId: tenant.id, tenantName: tenant.tradeNameAr, ...user });
      }
    }
    return accounts;
  }

  async audits(actor: PlatformActor) {
    allow(actor, 'audit.read');
    const rows = await this.prisma.client.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(publicAudit);
  }

  settings() {
    return {
      adminOrigin: this.config.adminOrigin,
      webOrigin: this.config.webOrigin,
      verificationRequired: true,
    };
  }

  private async usage(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [users, branches, devices, lastUser, lastDevice] = await Promise.all([
        tx.user.count({ where: { tenantId, isDeleted: false } }),
        tx.branch.count({ where: { tenantId, isDeleted: false } }),
        tx.device.count({ where: { tenantId, isDeleted: false } }),
        tx.user.findFirst({ where: { tenantId }, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } }),
        tx.device.findFirst({ where: { tenantId }, orderBy: { lastSyncAt: 'desc' }, select: { lastSyncAt: true } }),
      ]);
      return {
        users,
        branches,
        devices,
        lastLoginAt: lastUser?.lastLoginAt?.toISOString() ?? null,
        lastSyncAt: lastDevice?.lastSyncAt?.toISOString() ?? null,
      };
    });
  }

  private async people(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const [users, branches, sessions] = await Promise.all([
        tx.user.findMany({ where: { tenantId, isDeleted: false }, include: { branchRoles: { include: { role: true } } } }),
        tx.branch.findMany({ where: { tenantId, isDeleted: false } }),
        tx.refreshSession.findMany({ where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } }, take: 20 }),
      ]);
      return {
        branches: branches.map((row) => ({ id: row.id, nameAr: row.nameAr, nameEn: row.nameEn, code: row.code })),
        users: users.map((user) => ({
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: user.phone,
          isActive: user.isActive,
          failedLogins: user.failedLogins,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          lockedAt: user.lockedAt?.toISOString() ?? null,
          forceOtp: user.forceOtp,
          role: user.branchRoles[0]?.role.code ?? '',
          sessions: sessions.filter((row) => row.userId === user.id).length,
        })),
      };
    });
  }

  private async mustTenant(id: string) {
    const tenant = await this.prisma.client.tenant.findUnique({ where: { id } });
    if (!tenant) throw new DomainError('NOT_FOUND', 404);
    return tenant;
  }

  private async mustRequest(id: string) {
    const row = await this.prisma.client.subscriptionRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError('NOT_FOUND', 404);
    return row;
  }

  private async docsValid(requestId: string): Promise<boolean> {
    const docs = await this.prisma.client.verificationDocument.findMany({ where: { requestId } });
    const pharmacy = docs.find((row) => row.kind === 'PHARMACY_LICENSE');
    const pharmacist = docs.find((row) => row.kind === 'PHARMACIST_LICENSE');
    return pharmacy?.status === 'VALID' && pharmacist?.status === 'VALID';
  }

  private async requireValidDocs(requestId: string): Promise<void> {
    if (!(await this.docsValid(requestId))) throw new DomainError('VERIFICATION_REQUIRED', 409);
  }

  private async refreshKnown(rows: LibraryMedicine[]): Promise<number> {
    let updated = 0;
    for (let index = 0; index < rows.length; index += 15) {
      const slice = rows.slice(index, index + 15);
      await Promise.all(
        slice.map(async (row) => {
          const shared = {
            nameAr: plainMedicineName(row.nameAr),
            nameEn: plainMedicineName(row.nameEn),
            genericName: plainMedicineName(row.genericName),
            strength: row.strength,
            manufacturer: row.manufacturer,
            country: row.country,
            atcCode: row.atcCode,
            isControlled: row.isControlled,
            requiresPrescription: row.requiresPrescription,
          };
          const itemType =
            row.form === 'CONSUMABLE' ? 'Consumables'
            : row.form === 'COSMETIC' ? 'Cosmetics'
            : row.form === 'DEVICE' ? 'Medical devices'
            : row.form === 'SUPPLEMENT' ? 'OTC'
            : 'Medicine';
          await this.prisma.client.standardMedicine.update({
            where: { code: row.code },
            data: {
              ...shared,
              form: row.form,
              categoryAr: row.categoryAr,
              categoryEn: row.categoryEn,
              route: row.route,
              ingredients: row.ingredients,
              status: 'PUBLISHED',
            },
          });
          await this.prisma.client.globalCatalogItem.updateMany({
            where: { code: row.code },
            data: { ...shared, itemType, dosageForm: row.form, categoryName: row.categoryEn, status: 'active' },
          });
        }),
      );
      updated += slice.length;
    }
    return updated;
  }

  private async upsertLibraryRow(row: LibraryMedicine): Promise<void> {
    const shared = {
      nameAr: plainMedicineName(row.nameAr),
      nameEn: plainMedicineName(row.nameEn),
      genericName: plainMedicineName(row.genericName),
      strength: row.strength,
      manufacturer: row.manufacturer,
      country: row.country,
      atcCode: row.atcCode,
      isControlled: row.isControlled,
      requiresPrescription: row.requiresPrescription,
    };
    await this.prisma.client.standardMedicine.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        ...shared,
        form: row.form,
        categoryAr: row.categoryAr,
        categoryEn: row.categoryEn,
        route: row.route,
        ingredients: row.ingredients,
        status: 'PUBLISHED',
      },
      update: {
        ...shared,
        form: row.form,
        categoryAr: row.categoryAr,
        categoryEn: row.categoryEn,
        route: row.route,
        ingredients: row.ingredients,
        status: 'PUBLISHED',
      },
    });
    const itemType =
      row.form === 'CONSUMABLE' ? 'Consumables'
      : row.form === 'COSMETIC' ? 'Cosmetics'
      : row.form === 'DEVICE' ? 'Medical devices'
      : row.form === 'SUPPLEMENT' ? 'OTC'
      : 'Medicine';
    await this.prisma.client.globalCatalogItem.upsert({
      where: { code: row.code },
      create: {
        code: row.code,
        itemType,
        ...shared,
        dosageForm: row.form,
        categoryName: row.categoryEn,
        storageCondition: '',
        status: 'active',
      },
      update: {
        itemType,
        ...shared,
        dosageForm: row.form,
        categoryName: row.categoryEn,
        status: 'active',
      },
    });
  }

  private async publishStandard(id: string): Promise<void> {
    const item = await this.prisma.client.globalCatalogItem.findUnique({ where: { id }, include: { barcodes: true } });
    if (!item) throw new DomainError('NOT_FOUND', 404);
    const forms = new Set((await this.prisma.client.dosageForm.findMany()).map((row) => row.code));
    const patch = catalogPushPatch({
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      genericName: item.genericName,
      form: forms.has(item.dosageForm) ? item.dosageForm : 'TABLET',
      strength: item.strength,
      manufacturer: item.manufacturer,
      country: item.country,
      atcCode: item.atcCode,
      gtin: item.barcodes[0]?.code ?? '',
      isControlled: item.isControlled,
      requiresPrescription: item.requiresPrescription,
    });
    const data = {
      ...patch,
      categoryAr: item.categoryName || 'عام',
      categoryEn: item.categoryName || 'General',
      status: 'PUBLISHED',
    };
    await this.prisma.client.standardMedicine.upsert({
      where: { code: item.code },
      create: { code: item.code, ...data },
      update: data,
    });
  }

  private async planOffers(activeOnly: boolean) {
    const rows = await this.prisma.client.plan.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { monthlyPrice: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      tenantType: row.tenantType,
      ...planPrices({ monthlyPrice: dec(row.monthlyPrice), yearlyPrice: dec(row.yearlyPrice), limits: row.limits }),
      headOfficeFee: dec(row.headOfficeFee),
      isActive: row.isActive,
    }));
  }

  private async submittedQuote(id: string): Promise<{ billingCycle: string; amount: string }> {
    const row = await this.prisma.client.platformAuditLog.findFirst({
      where: { action: 'request.submit', entityType: 'SubscriptionRequest', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) return { billingCycle: 'MONTHLY', amount: '' };
    try {
      const details = JSON.parse(row.details) as { billingCycle?: unknown; amount?: unknown };
      const billingCycle = typeof details.billingCycle === 'string' && isBillingCycle(details.billingCycle) ? details.billingCycle : 'MONTHLY';
      const amount = typeof details.amount === 'string' ? details.amount : '';
      return { billingCycle, amount };
    } catch {
      return { billingCycle: 'MONTHLY', amount: '' };
    }
  }

  private async audit(actorId: string | null, action: string, entityType: string, entityId: string, reason = '', details: unknown = {}) {
    await this.prisma.client.platformAuditLog.create({
      data: { actorId, action, entityType, entityId, reason, details: JSON.stringify(details) },
    });
  }
}

function publicDoc(row: { id: string; kind: string; licenseNumber: string; status: string; fileName: string; content: string | null; expiresOn: Date | null; verifiedAt: Date | null; rejectionReason: string }) {
  return {
    id: row.id,
    kind: row.kind,
    licenseNumber: row.licenseNumber,
    status: row.status,
    fileName: row.fileName,
    hasFile: Boolean(row.content),
    expiresOn: row.expiresOn?.toISOString().slice(0, 10) ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
  };
}

function publicAudit(row: { id: string; actorId: string | null; action: string; entityType: string; entityId: string; reason: string; createdAt: Date }) {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

async function subscriptionPlan(prisma: PrismaService, tenantId: string) {
  const sub = await prisma.client.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  if (!sub) return null;
  return prisma.client.plan.findUnique({ where: { code: sub.planCode } });
}

export type RequestInput = {
  tradeNameAr: string;
  tradeNameEn: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  pharmacistName: string;
  pharmacistLicense: string;
  pharmacyLicense: string;
  stateName: string;
  city: string;
  addressLine: string;
  planCode: string;
  branchCount: number;
  userCount: number;
  deviceCount: number;
  note: string;
  pharmacyFile: string;
  pharmacyFileName: string;
  pharmacistFile: string;
  pharmacistFileName: string;
  pharmacyExpiry: string;
  pharmacistExpiry: string;
  billingCycle: string;
};
