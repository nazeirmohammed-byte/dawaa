import { cloneElement, FormEvent, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from './api';
import { Logo, useUi } from './ui';

const DEMO_EMAIL = 'owner@demo.dawaa.local';
const DEMO_PASSWORD = 'Dawaa-Dev-2026!';
const OPEN_SCREENS = [
  ['/app', 'home'],
  ['/app/pos', 'quickPos'],
  ['/app/receipt', 'receipt'],
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

function applyServerFields(
  caught: unknown,
  explain: (field: string, code: string) => string,
): FieldMap | null {
  if (!(caught instanceof ApiError) || Object.keys(caught.fields).length === 0) return null;
  const bag: FieldMap = {};
  for (const [field, code] of Object.entries(caught.fields)) bag[field] = explain(field, code);
  return bag;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ui = useUi();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<FieldMap>({});
  const [busy, setBusy] = useState(false);
  const [openAt, setOpenAt] = useState(() => localStorage.getItem('dawaa.open') || '/app');
  const [registering, setRegistering] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [tab, setTab] = useState<'pharmacy' | 'admin'>(
    new URLSearchParams(window.location.search).get('tab') === 'admin' ? 'admin' : 'pharmacy',
  );
  const [adminEmail, setAdminEmail] = useState('admin@dawaa.local');
  const [adminPassword, setAdminPassword] = useState('');
  const [signup, setSignup] = useState({
    tradeNameAr: '',
    tradeNameEn: '',
    displayName: '',
    email: '',
    phone: '',
    password: '',
    branchCount: '1',
    management: 'INDEPENDENT',
    branchNameAr: 'الفرع الرئيسي',
    branchNameEn: 'Main branch',
  });

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('impersonate');
    if (!code) return;
    setBusy(true);
    api('/api/v1/auth/impersonate', { method: 'POST', body: JSON.stringify({ code }) })
      .then(() => {
        localStorage.setItem('dawaa.impersonating', '1');
        navigate('/app');
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('empty')))
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

  function explain(field: string, code: string): string {
    const labels: Record<string, string> = {
      tradeNameAr: t('nameAr'),
      tradeNameEn: t('nameEn'),
      displayName: t('ownerName'),
      email: t('email'),
      phone: t('phone'),
      password: t('password'),
      branchCount: t('branchCount'),
      branchNameAr: t('branches'),
      identifier: t('identifier'),
    };
    if (code === 'required') return t('fieldRequired', { label: labels[field] ?? field });
    if (code === 'short') return t('fieldShort', { count: 10 });
    if (code === 'email') return t('fieldEmail');
    if (code === 'taken' && field === 'phone') return t('fieldTakenPhone');
    if (code === 'taken') return t('fieldTakenEmail');
    if (code === 'range') return t('fieldRange');
    return t('fieldInvalid');
  }

  function showProblems(bag: FieldMap) {
    setFields(bag);
    const first = Object.keys(bag)[0];
    if (first) focusField(first);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const bag: FieldMap = {};
    if (!identifier.trim()) bag.identifier = t('fieldRequired', { label: t('identifier') });
    if (!password) bag.password = t('fieldRequired', { label: t('password') });
    if (Object.keys(bag).length) {
      setError('');
      showProblems(bag);
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      ui.push({ tone: 'ok', title: t('welcomeTitle'), body: t('welcomeBody') });
      navigate(ui.touch && OPEN_SCREENS.some(([path]) => path === openAt) ? openAt : '/app');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('empty'));
    } finally {
      setBusy(false);
    }
  }

  async function adminSubmit(event: FormEvent) {
    event.preventDefault();
    const bag: FieldMap = {};
    if (!adminEmail.trim()) bag.email = t('fieldRequired', { label: t('email') });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) bag.email = t('fieldEmail');
    if (!adminPassword) bag.password = t('fieldRequired', { label: t('password') });
    if (Object.keys(bag).length) {
      setError('');
      showProblems(bag);
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      await api('/api/v1/platform/login', {
        method: 'POST',
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      navigate('/admin/dashboard');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('empty'));
    } finally {
      setBusy(false);
    }
  }

  function checkSignup(): FieldMap {
    const bag: FieldMap = {};
    const need = (key: 'tradeNameAr' | 'tradeNameEn' | 'displayName' | 'branchNameAr', label: string) => {
      if (signup[key].trim().length < 2) bag[key] = t('fieldRequired', { label });
    };
    need('tradeNameAr', t('nameAr'));
    need('tradeNameEn', t('nameEn'));
    need('displayName', t('ownerName'));
    if (!signup.email.trim()) bag.email = t('fieldRequired', { label: t('email') });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signup.email.trim())) bag.email = t('fieldEmail');
    if (signup.password.length < 10) {
      bag.password = signup.password ? t('fieldShort', { count: 10 }) : t('fieldRequired', { label: t('password') });
    }
    const count = Number(signup.branchCount);
    if (!Number.isInteger(count) || count < 1 || count > 20) bag.branchCount = t('fieldRange');
    need('branchNameAr', t('branches'));
    return bag;
  }

  async function openPharmacy(event: FormEvent) {
    event.preventDefault();
    const local = checkSignup();
    if (Object.keys(local).length) {
      setError('');
      showProblems(local);
      return;
    }
    setBusy(true);
    setError('');
    setFields({});
    try {
      const created = await api<{ pending: boolean; email: string }>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...signup, branchCount: Number(signup.branchCount) }),
      });
      setPendingEmail(created.email || signup.email);
    } catch (caught) {
      const server = applyServerFields(caught, explain);
      if (server) showProblems(server);
      else setError(caught instanceof Error ? caught.message : t('empty'));
    } finally {
      setBusy(false);
    }
  }

  function editSignup<K extends keyof typeof signup>(key: K, value: (typeof signup)[K]) {
    setSignup((current) => ({ ...current, [key]: value }));
    clearField(key);
  }

  if (registering) {
    return (
      <div className="login">
        <section className="brand">
          <div>
            <Logo light />
            <h1>{t('product')}</h1>
            <p>{t('branchHelp')}</p>
          </div>
        </section>
        <section className="panel">
          {pendingEmail ? (
            <div className="card">
              <div className="tools">
                <button type="button" className="ghost" onClick={() => { setRegistering(false); setPendingEmail(''); setFields({}); setError(''); }}>
                  {t('haveAccount')}
                </button>
                <button type="button" className="ghost" onClick={ui.toggleLanguage}>
                  {t('language')}
                </button>
              </div>
              <h2>{t('awaitingTitle')}</h2>
              <div className="notice">
                <p>{t('awaitingBody')}</p>
                <p dir="ltr"><b>{pendingEmail}</b></p>
              </div>
            </div>
          ) : (
          <form className="card" noValidate onSubmit={openPharmacy}>
            <div className="tools">
              <button type="button" className="ghost" onClick={() => { setRegistering(false); setFields({}); setError(''); }}>
                {t('haveAccount')}
              </button>
              <button type="button" className="ghost" onClick={ui.toggleLanguage}>
                {t('language')}
              </button>
            </div>
            <h2>{t('openPharmacy')}</h2>
            <p className="lede">{t('branchHelp')}</p>
            {error ? <div className="error">{error}</div> : null}
            <Field name="tradeNameAr" label={t('nameAr')} message={fields.tradeNameAr}>
              <input value={signup.tradeNameAr} onChange={(event) => editSignup('tradeNameAr', event.target.value)} />
            </Field>
            <Field name="tradeNameEn" label={t('nameEn')} message={fields.tradeNameEn}>
              <input value={signup.tradeNameEn} onChange={(event) => editSignup('tradeNameEn', event.target.value)} />
            </Field>
            <Field name="displayName" label={t('ownerName')} message={fields.displayName}>
              <input value={signup.displayName} onChange={(event) => editSignup('displayName', event.target.value)} />
            </Field>
            <Field name="email" label={t('email')} message={fields.email}>
              <input type="email" dir="ltr" value={signup.email} onChange={(event) => editSignup('email', event.target.value)} />
            </Field>
            <Field name="phone" label={t('phone')} message={fields.phone}>
              <input dir="ltr" value={signup.phone} onChange={(event) => editSignup('phone', event.target.value)} />
            </Field>
            <Field name="password" label={t('password')} message={fields.password}>
              <input type="password" value={signup.password} onChange={(event) => editSignup('password', event.target.value)} />
            </Field>
            <Field name="branchCount" label={t('branchCount')} message={fields.branchCount}>
              <input
                type="number"
                min={1}
                max={20}
                value={signup.branchCount}
                onChange={(event) => editSignup('branchCount', event.target.value)}
              />
            </Field>
            <Field name="management" label={t('management')} message={fields.management}>
              <select value={signup.management} onChange={(event) => editSignup('management', event.target.value)}>
                <option value="INDEPENDENT">{t('independent')}</option>
                <option value="SHARED">{t('shared')}</option>
              </select>
            </Field>
            <Field name="branchNameAr" label={t('branches')} message={fields.branchNameAr}>
              <input value={signup.branchNameAr} onChange={(event) => editSignup('branchNameAr', event.target.value)} />
            </Field>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t('pleaseWait') : t('openPharmacy')}
            </button>
          </form>
          )}
        </section>
      </div>
    );
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
              <Field name="email" label={t('email')} message={fields.email}>
                <input value={adminEmail} onChange={(event) => { setAdminEmail(event.target.value); clearField('email'); }} autoComplete="username" />
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
              <p className="lede">
                <a href="/subscribe">{t('openPharmacy')}</a>
              </p>
            </>
          ) : null}
          {tab === 'pharmacy' ? (
            <>
              <Field name="identifier" label={t('identifier')} message={fields.identifier}>
                <input value={identifier} onChange={(event) => { setIdentifier(event.target.value); clearField('identifier'); }} autoComplete="username" />
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
                <div>
                  {DEMO_EMAIL}
                  <br />
                  <b>{DEMO_PASSWORD}</b>
                </div>
                <button
                  className="brass"
                  type="button"
                  onClick={() => {
                    setIdentifier(DEMO_EMAIL);
                    setPassword(DEMO_PASSWORD);
                    setFields({});
                  }}
                >
                  {t('fillDemo')}
                </button>
                <button className="ghost" type="button" onClick={() => { setRegistering(true); setFields({}); setError(''); }}>
                  {t('openPharmacy')}
                </button>
              </div>
            </>
          ) : null}
        </form>
      </section>
    </div>
  );
}
