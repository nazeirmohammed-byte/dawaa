import { cloneElement, FormEvent, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatUserError } from './api';
import { Logo, useUi } from './ui';

const DEMO_TENANT_CODE = 'DW0001';
const DEMO_PHONE = '0912345678';
const DEMO_PASSWORD = 'Dawaa-Dev-2026!';
const OPEN_SCREENS = [
  ['/app', 'home'],
  ['/app/pos', 'quickPos'],
  ['/app/settings', 'settings'],
] as const;

type FieldMap = Record<string, string>;

function focusField(name: string) {
  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[data-field="${name}"] input, [data-field="${name}"] select`)?.focus();
  }, 0);
}

function Field({ name, label, message, children }: { name: string; label: string; message?: string; children: ReactNode }) {
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-invalid': message ? true : undefined,
        'aria-describedby': message ? `${name}-error` : undefined,
      })
    : children;
  return (
    <label className={message ? 'field bad' : 'field'} data-field={name}>
      <span>{label}</span>
      {control}
      {message ? <small id={`${name}-error`} className="field-error">{message}</small> : null}
    </label>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ui = useUi();
  const [tenantCode, setTenantCode] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<FieldMap>({});
  const [busy, setBusy] = useState(false);
  const [openAt, setOpenAt] = useState(() => localStorage.getItem('dawaa.open') || '/app');
  const [tab, setTab] = useState<'pharmacy' | 'admin'>(
    new URLSearchParams(window.location.search).get('tab') === 'admin' ? 'admin' : 'pharmacy',
  );
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('impersonate');
    if (!code) return;
    setBusy(true);
    api('/api/v1/auth/impersonate', { method: 'POST', body: JSON.stringify({ code }) })
      .then(() => {
        localStorage.setItem('dawaa.impersonating', '1');
        navigate('/app');
      })
      .catch((caught: unknown) => setError(formatUserError(caught, t('apiError'))))
      .finally(() => setBusy(false));
  }, [navigate, t]);

  function clearField(name: string) {
    setFields((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const bag: FieldMap = {};
    if (!tenantCode.trim()) bag.tenantCode = t('fieldRequired', { label: t('tenantCode') });
    if (!phone.trim()) bag.phone = t('fieldRequired', { label: t('mobile') });
    else if (phone.trim().length < 6) bag.phone = t('fieldShort', { count: 6 });
    if (!password) bag.password = t('fieldRequired', { label: t('password') });
    if (Object.keys(bag).length) {
      setError('');
      setFields(bag);
      const first = Object.keys(bag)[0];
      if (first) focusField(first);
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ tenantCode: tenantCode.trim(), phone: phone.trim(), password }),
      });
      ui.push({ tone: 'ok', title: t('welcomeTitle'), body: t('welcomeBody') });
      navigate(ui.touch && OPEN_SCREENS.some(([path]) => path === openAt) ? openAt : '/app');
    } catch (caught) {
      setError(formatUserError(caught, t('apiError')));
    } finally {
      setBusy(false);
    }
  }

  async function adminSubmit(event: FormEvent) {
    event.preventDefault();
    const bag: FieldMap = {};
    if (!adminPhone.trim()) bag.phone = t('fieldRequired', { label: t('mobile') });
    else if (adminPhone.trim().length < 6) bag.phone = t('fieldShort', { count: 6 });
    if (!adminPassword) bag.password = t('fieldRequired', { label: t('password') });
    if (Object.keys(bag).length) {
      setError('');
      setFields(bag);
      const first = Object.keys(bag)[0];
      if (first) focusField(first);
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api('/api/v1/platform/login', {
        method: 'POST',
        body: JSON.stringify({ phone: adminPhone.trim(), password: adminPassword }),
      });
      navigate('/admin/dashboard');
    } catch (caught) {
      setError(formatUserError(caught, t('apiError')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="brand">
        <div>
          <Logo light />
          <h1>{t('product')}</h1>
          <p>{t('hero')}</p>
        </div>
        <div className="brand-points">
          <div>{t('pointInventory')}</div>
          <div>{t('pointBuy')}</div>
          <div>{t('pointSell')}</div>
        </div>
      </section>
      <section className="panel">
        <form className="card" noValidate onSubmit={tab === 'admin' ? adminSubmit : submit}>
          <div className="tools">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                ui.toggleTouch();
                ui.push({
                  tone: 'info',
                  title: ui.touch ? t('deskTitle') : t('touchTitle'),
                  body: ui.touch ? t('deskBody') : t('touchBody'),
                });
              }}
            >
              {ui.touch ? t('touchOff') : t('touchOn')}
            </button>
            <button type="button" className="ghost" onClick={ui.toggleLanguage}>
              {t('language')}
            </button>
          </div>
          {ui.touch ? (
            <div className="screen-pick">
              <p>{t('openScreen')}</p>
              {OPEN_SCREENS.map(([path, key]) => (
                <button
                  key={path}
                  type="button"
                  className={openAt === path ? 'on' : ''}
                  onClick={() => {
                    setOpenAt(path);
                    localStorage.setItem('dawaa.open', path);
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="login-tabs">
            <button type="button" className={tab === 'pharmacy' ? 'primary fit' : 'ghost'} onClick={() => { setTab('pharmacy'); setFields({}); setError(''); }}>
              {t('pharmacyTab')}
            </button>
            <button type="button" className={tab === 'admin' ? 'primary fit' : 'ghost'} onClick={() => { setTab('admin'); setFields({}); setError(''); }}>
              {t('adminTab')}
            </button>
          </div>
          <Logo />
          <h2>{tab === 'admin' ? t('adminTab') : t('signIn')}</h2>
          <p className="lede">{tab === 'admin' ? t('adminHelp') : t('signInHelp')}</p>
          {error ? <div className="error">{error}</div> : null}
          {tab === 'admin' ? (
            <>
              <Field name="phone" label={t('mobile')} message={fields.phone}>
                <input dir="ltr" value={adminPhone} onChange={(event) => { setAdminPhone(event.target.value); clearField('phone'); }} autoComplete="username" />
              </Field>
              <Field name="password" label={t('password')} message={fields.password}>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => { setAdminPassword(event.target.value); clearField('password'); }}
                  autoComplete="current-password"
                />
              </Field>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? t('working') : t('enter')}
              </button>
            </>
          ) : null}
          {tab === 'pharmacy' ? (
            <>
              <Field name="tenantCode" label={t('tenantCode')} message={fields.tenantCode}>
                <input dir="ltr" value={tenantCode} onChange={(event) => { setTenantCode(event.target.value.toUpperCase()); clearField('tenantCode'); }} autoComplete="organization" />
              </Field>
              <Field name="phone" label={t('mobile')} message={fields.phone}>
                <input dir="ltr" value={phone} onChange={(event) => { setPhone(event.target.value); clearField('phone'); }} autoComplete="username" />
              </Field>
              <Field name="password" label={t('password')} message={fields.password}>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); clearField('password'); }}
                  autoComplete="current-password"
                />
              </Field>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? t('working') : t('enter')}
              </button>
              <div className="demo">
                <div dir="ltr">
                  {DEMO_TENANT_CODE} · {DEMO_PHONE}
                  <br />
                  <b>{DEMO_PASSWORD}</b>
                </div>
                <button
                  className="brass"
                  type="button"
                  onClick={() => {
                    setTenantCode(DEMO_TENANT_CODE);
                    setPhone(DEMO_PHONE);
                    setPassword(DEMO_PASSWORD);
                    setFields({});
                  }}
                >
                  {t('fillDemo')}
                </button>
                <Link className="ghost" to="/subscribe">{t('openPharmacy')}</Link>
              </div>
            </>
          ) : null}
        </form>
      </section>
    </div>
  );
}
