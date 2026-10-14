import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { TokenService } from '../auth/token.service';
import { Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { DomainError } from '../http/domain-error';
import { ZodValidationPipe } from '../http/zod.pipe';
import { clearPlatformCookie, setPlatformCookie } from './platform.cookies';
import { PlatformGuard, type PlatformRequest } from './platform.guard';
import { PlatformService } from './platform.service';

const reason = z.string().trim().min(3).max(500);
const openPharmacySchema = z.object({
  tradeNameAr: z.string().trim().min(2).max(200),
  tradeNameEn: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(20).optional().default(''),
  password: z.string().min(10).max(200),
  branchCount: z.number().int().min(1).max(20),
  management: z.enum(['INDEPENDENT', 'SHARED']),
  branchNameAr: z.string().trim().min(2).max(200),
  branchNameEn: z.string().trim().min(2).max(200),
});
const uuid = z.string().uuid();

const requestSchema = z.object({
  tradeNameAr: z.string().trim().min(2).max(200),
  tradeNameEn: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(2).max(200),
  ownerPhone: z.string().trim().min(6).max(20),
  ownerEmail: z.string().trim().email().max(320),
  pharmacistName: z.string().trim().min(2).max(200),
  pharmacistLicense: z.string().trim().min(2).max(100),
  pharmacyLicense: z.string().trim().min(2).max(100),
  stateName: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  addressLine: z.string().trim().min(2).max(300),
  planCode: z.string().trim().min(2).max(32),
  billingCycle: z.enum(['MONTHLY', 'DAILY', 'YEARLY', 'PAYG']).optional().default('MONTHLY'),
  branchCount: z.number().int().min(1).max(50),
  userCount: z.number().int().min(1).max(500),
  deviceCount: z.number().int().min(1).max(200),
  note: z.string().trim().max(1000).optional().default(''),
  pharmacyFile: z.string().max(1_500_000).optional().default(''),
  pharmacyFileName: z.string().max(200).optional().default(''),
  pharmacistFile: z.string().max(1_500_000).optional().default(''),
  pharmacistFileName: z.string().max(200).optional().default(''),
  pharmacyExpiry: z.string().optional().default(''),
  pharmacistExpiry: z.string().optional().default(''),
});

@ApiTags('platform')
@Controller('platform')
export class PlatformPublicController {
  constructor(
    private readonly platform: PlatformService,
    private readonly tokens: TokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(z.object({ email: z.string().trim().email(), password: z.string().min(10).max(200) })))
    body: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const profile = await this.platform.authenticate(body.email, body.password);
    setPlatformCookie(response, await this.tokens.signPlatform(profile.id), this.config);
    return profile;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    clearPlatformCookie(response);
    return { ok: true };
  }

  @Post('requests')
  submit(@Body(new ZodValidationPipe(requestSchema)) body: z.infer<typeof requestSchema>) {
    return this.platform.submitRequest(body);
  }

  @Get('plans/public')
  plans() {
    return this.platform.publicPlans();
  }
}

@ApiTags('platform')
@Controller('platform')
@UseGuards(PlatformGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('me')
  me(@Req() request: PlatformRequest) {
    return request.platform;
  }

  @Get('dashboard')
  dashboard(@Req() request: PlatformRequest) {
    return this.platform.dashboard(this.actor(request));
  }

  @Get('tenants')
  tenants(@Req() request: PlatformRequest, @Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string) {
    return this.platform.listTenants(this.actor(request), { q, status, page: Math.max(1, Number(page) || 1) });
  }

  @Post('tenants')
  openPharmacy(
    @Req() request: PlatformRequest,
    @Body(new ZodValidationPipe(openPharmacySchema)) body: z.infer<typeof openPharmacySchema>,
  ) {
    return this.platform.openPharmacy(this.actor(request), body);
  }

  @Get('tenants/:id')
  tenant(@Req() request: PlatformRequest, @Param('id') id: string) {
    return this.platform.tenantDetail(this.actor(request), this.id(id));
  }

  @Post('tenants/:id/suspend')
  suspend(@Req() request: PlatformRequest, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason }))) body: { reason: string }) {
    return this.platform.setTenantStatus(this.actor(request), this.id(id), 'SUSPENDED', body.reason);
  }

  @Get('signups')
  signups(@Req() request: PlatformRequest) {
    return this.platform.listPendingSignups(this.actor(request));
  }

  @Post('signups/:id/approve')
  approveSignup(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().max(500).optional().default('') }))) body: { reason: string },
  ) {
    return this.platform.approveSignIn(this.actor(request), this.id(id), body.reason);
  }

  @Post('signups/:id/reject')
  rejectSignup(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().max(500).optional().default('') }))) body: { reason: string },
  ) {
    return this.platform.rejectSignIn(this.actor(request), this.id(id), body.reason);
  }

  @Post('tenants/:id/approve')
  approve(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().max(500).optional().default('') }))) body: { reason: string },
  ) {
    return this.platform.approveSignIn(this.actor(request), this.id(id), body.reason);
  }

  @Post('tenants/:id/reactivate')
  reactivate(@Req() request: PlatformRequest, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ reason }))) body: { reason: string }) {
    return this.platform.setTenantStatus(this.actor(request), this.id(id), 'ACTIVE', body.reason);
  }

  @Post('tenants/:id/trial')
  trial(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ days: z.number().int().min(1).max(90), reason }))) body: { days: number; reason: string },
  ) {
    return this.platform.extendTrial(this.actor(request), this.id(id), body.days, body.reason);
  }

  @Post('tenants/:id/plan')
  plan(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ planCode: z.string().min(2).max(32), reason }))) body: { planCode: string; reason: string },
  ) {
    return this.platform.changePlan(this.actor(request), this.id(id), body.planCode, body.reason);
  }

  @Post('tenants/:id/reset-password')
  resetPassword(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ userId: uuid }))) body: { userId: string },
  ) {
    return this.platform.resetPassword(this.actor(request), this.id(id), body.userId);
  }

  @Post('tenants/:id/reset-pin')
  resetPin(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ userId: uuid, pin: z.string().regex(/^\d{4,6}$/) }))) body: { userId: string; pin: string },
  ) {
    return this.platform.resetPin(this.actor(request), this.id(id), body.userId, body.pin);
  }

  @Post('tenants/:id/user-state')
  userState(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ userId: uuid, action: z.enum(['disable', 'lock', 'otp', 'enable']), reason })))
    body: { userId: string; action: 'disable' | 'lock' | 'otp' | 'enable'; reason: string },
  ) {
    return this.platform.setUserState(this.actor(request), this.id(id), body.userId, body.action, body.reason);
  }

  @Post('tenants/:id/admins')
  createAdmin(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          displayName: z.string().trim().min(2).max(200),
          email: z.string().trim().email(),
          phone: z.string().trim().max(20).optional().default(''),
          branchId: uuid,
        }),
      ),
    )
    body: { displayName: string; email: string; phone: string; branchId: string },
  ) {
    return this.platform.createAdmin(this.actor(request), this.id(id), body);
  }

  @Post('tenants/:id/read-only')
  readOnly(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ readOnly: z.boolean(), reason }))) body: { readOnly: boolean; reason: string },
  ) {
    return this.platform.setReadOnly(this.actor(request), this.id(id), body.readOnly, body.reason);
  }

  @Post('tenants/:id/impersonate')
  impersonate(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ userId: uuid, reason }))) body: { userId: string; reason: string },
  ) {
    return this.platform.impersonate(this.actor(request), this.id(id), body.userId, body.reason);
  }

  @Post('tenants/:id/notes')
  notes(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ supportNotes: z.string().max(1000) }))) body: { supportNotes: string },
  ) {
    return this.platform.notes(this.actor(request), this.id(id), body.supportNotes);
  }

  @Get('tenants/:id/export')
  exportTenant(@Req() request: PlatformRequest, @Param('id') id: string) {
    return this.platform.tenantDetail(this.actor(request), this.id(id));
  }

  @Get('requests')
  requests(@Req() request: PlatformRequest, @Query('status') status?: string) {
    return this.platform.listRequests(this.actor(request), status);
  }

  @Get('requests/:id')
  requestDetail(@Req() request: PlatformRequest, @Param('id') id: string) {
    return this.platform.requestDetail(this.actor(request), this.id(id));
  }

  @Post('requests/:id/status')
  requestStatus(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ status: z.string().min(3).max(32), reason: z.string().max(500).optional().default('') })))
    body: { status: string; reason: string },
  ) {
    return this.platform.moveRequest(this.actor(request), this.id(id), body.status, body.reason);
  }

  @Post('requests/:id/verify')
  verify(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          documentId: uuid,
          status: z.enum(['PENDING', 'VALID', 'EXPIRED', 'REJECTED', 'NEEDS_RENEWAL']),
          reason: z.string().max(500).optional().default(''),
          expiresOn: z.string().optional().default(''),
        }),
      ),
    )
    body: { documentId: string; status: string; reason: string; expiresOn: string },
  ) {
    return this.platform.verifyDocument(this.actor(request), this.id(id), body.documentId, body.status, body.reason, body.expiresOn);
  }

  @Get('documents/:id')
  document(@Req() request: PlatformRequest, @Param('id') id: string) {
    return this.platform.documentFile(this.actor(request), this.id(id));
  }

  @Post('requests/:id/create-tenant')
  createTenant(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ overrideReason: z.string().max(500).optional().default('') }))) body: { overrideReason: string },
  ) {
    return this.platform.createTenant(this.actor(request), this.id(id), body.overrideReason);
  }

  @Get('medicines')
  medicines(
    @Req() request: PlatformRequest,
    @Query('q') q?: string,
    @Query('form') form?: string,
    @Query('category') category?: string,
  ) {
    return this.platform.listMedicines(this.actor(request), {
      q: q ?? '',
      form: form ?? '',
      category: category ?? '',
    });
  }

  @Post('medicines/download')
  downloadMedicines(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.preprocess(
          (value) => (value && typeof value === 'object' ? value : {}),
          z.object({ mode: z.enum(['download', 'update']).optional().default('download') }),
        ),
      ),
    )
    body: { mode: 'download' | 'update' },
  ) {
    return this.platform.downloadMedicineLibrary(this.actor(request), body.mode);
  }

  @Get('catalog')
  catalog(@Req() request: PlatformRequest, @Query('q') q?: string) {
    return this.platform.listCatalog(this.actor(request), q ?? '');
  }

  @Post('catalog')
  saveCatalog(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          id: uuid.optional(),
          code: z.string().trim().min(2).max(64),
          itemType: z.enum(['Medicine', 'Medical supplies', 'OTC', 'Cosmetics', 'Consumables', 'Medical devices', 'Service item']),
          nameAr: z.string().trim().min(2).max(200),
          nameEn: z.string().trim().min(2).max(200),
          genericName: z.string().trim().min(2).max(200),
          strength: z.string().max(80).optional().default(''),
          dosageForm: z.string().max(80).optional().default('TABLET'),
          manufacturer: z.string().max(200).optional().default(''),
          country: z.string().max(80).optional().default(''),
          categoryName: z.string().max(200).optional().default(''),
          atcCode: z.string().max(16).optional().default(''),
          barcode: z.string().max(32).optional().default(''),
          unitName: z.string().max(40).optional().default('علبة'),
          factorToBase: z.number().int().positive().optional().default(1),
          isControlled: z.boolean().optional().default(false),
          requiresPrescription: z.boolean().optional().default(false),
          storageCondition: z.string().max(200).optional().default(''),
          status: z.enum(['draft', 'active', 'inactive', 'duplicate', 'needs review']),
        }),
      ),
    )
    body: {
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
    return this.platform.saveCatalog(this.actor(request), body);
  }

  @Post('catalog/:id/push')
  push(@Req() request: PlatformRequest, @Param('id') id: string) {
    return this.platform.pushCatalog(this.actor(request), this.id(id));
  }

  @Get('catalog-requests')
  itemRequests(@Req() request: PlatformRequest) {
    return this.platform.listItemRequests(this.actor(request));
  }

  @Post('catalog-requests/:id/decide')
  decide(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          status: z.enum(['APPROVED', 'REJECTED', 'MERGED_WITH_EXISTING', 'DUPLICATE_SUSPECTED']),
          reason: z.string().max(500).optional().default(''),
          mergedItemId: z.string().optional().default(''),
        }),
      ),
    )
    body: { status: string; reason: string; mergedItemId: string },
  ) {
    return this.platform.decideItem(this.actor(request), this.id(id), body.status, body.reason, body.mergedItemId);
  }

  @Get('partners')
  partners(@Req() request: PlatformRequest) {
    return this.platform.listPartners(this.actor(request));
  }

  @Post('partners')
  savePartner(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          name: z.string().trim().min(2).max(200),
          partnerType: z.enum([
            'Pharmacy group',
            'Individual pharmacy',
            'Supplier/distributor',
            'Insurance company',
            'Payment provider',
            'Implementation/support partner',
            'Reseller/agent',
          ]),
          contactName: z.string().trim().min(2).max(200),
          phone: z.string().trim().min(6).max(20),
          email: z.string().trim().email(),
          licenseNumber: z.string().trim().min(2).max(100),
          issuedOn: z.string().optional().default(''),
          expiresOn: z.string().min(8),
          modules: z.string().max(500).optional().default(''),
          notes: z.string().max(1000).optional().default(''),
        }),
      ),
    )
    body: {
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
    return this.platform.savePartner(this.actor(request), body);
  }

  @Post('partners/:id/link')
  linkPartner(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ tenantId: uuid, reason: z.string().max(500).optional().default('') })))
    body: { tenantId: string; reason: string },
  ) {
    return this.platform.linkPartner(this.actor(request), this.id(id), body.tenantId, body.reason);
  }

  @Get('plans')
  plans(@Req() request: PlatformRequest) {
    return this.platform.listPlans(this.actor(request));
  }

  @Post('plans/prices')
  savePlanPrices(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          plans: z.array(z.object({
            code: z.string().trim().min(2).max(32),
            monthlyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
            dailyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
            yearlyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
            paygPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
          })).min(1).max(20),
        }),
      ),
    )
    body: { plans: { code: string; monthlyPrice: string; dailyPrice: string; yearlyPrice: string; paygPrice: string }[] },
  ) {
    return this.platform.savePlanPrices(this.actor(request), body.plans);
  }

  @Post('plans')
  savePlan(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          code: z.string().trim().min(2).max(32),
          nameAr: z.string().trim().min(2).max(200),
          nameEn: z.string().trim().min(2).max(200),
          monthlyPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
          tenantType: z.enum(['INDIVIDUAL', 'GROUP']),
        }),
      ),
    )
    body: { code: string; nameAr: string; nameEn: string; monthlyPrice: string; tenantType: string },
  ) {
    return this.platform.savePlan(this.actor(request), body);
  }

  @Get('invoices')
  invoices(@Req() request: PlatformRequest) {
    return this.platform.listInvoices(this.actor(request));
  }

  @Post('invoices/:id/credit')
  credit(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), reason })))
    body: { amount: string; reason: string },
  ) {
    return this.platform.creditInvoice(this.actor(request), this.id(id), body.amount, body.reason);
  }

  @Get('proofs')
  proofs(@Req() request: PlatformRequest) {
    return this.platform.listProofs(this.actor(request));
  }

  @Post('proofs')
  addProof(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          invoiceId: uuid,
          method: z.enum(['BANKAK', 'TRANSFER', 'CASH', 'OTHER']),
          note: z.string().max(500).optional().default(''),
          fileName: z.string().max(200).optional().default(''),
        }),
      ),
    )
    body: { invoiceId: string; method: string; note: string; fileName: string },
  ) {
    return this.platform.addProof(this.actor(request), body.invoiceId, body.method, body.note, body.fileName);
  }

  @Post('proofs/:id/review')
  reviewProof(
    @Req() request: PlatformRequest,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional().default('') })))
    body: { status: 'APPROVED' | 'REJECTED'; reason: string },
  ) {
    return this.platform.reviewProof(this.actor(request), this.id(id), body.status, body.reason);
  }

  @Get('users')
  users(@Req() request: PlatformRequest) {
    return this.platform.listUsers(this.actor(request));
  }

  @Post('users')
  saveUser(
    @Req() request: PlatformRequest,
    @Body(
      new ZodValidationPipe(
        z.object({
          email: z.string().trim().email(),
          displayName: z.string().trim().min(2).max(200),
          password: z.string().min(10).max(200),
          roleCode: z.enum([
            'SUPER_ADMIN',
            'TENANT_APPROVAL_MANAGER',
            'CATALOG_MANAGER',
            'BILLING_MANAGER',
            'SUPPORT_ADMIN',
            'COMPLIANCE_AUDITOR',
          ]),
        }),
      ),
    )
    body: { email: string; displayName: string; password: string; roleCode: string },
  ) {
    return this.platform.saveUser(this.actor(request), body);
  }

  @Get('pharmacy-accounts')
  accounts(@Req() request: PlatformRequest) {
    return this.platform.pharmacyAccounts(this.actor(request));
  }

  @Get('audit')
  audit(@Req() request: PlatformRequest) {
    return this.platform.audits(this.actor(request));
  }

  @Get('settings')
  settings() {
    return this.platform.settings();
  }

  private actor(request: PlatformRequest) {
    if (!request.platform) throw new DomainError('UNAUTHORIZED', 401);
    return request.platform;
  }

  private id(value: string): string {
    const parsed = uuid.safeParse(value);
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', 400);
    return parsed.data;
  }
}
