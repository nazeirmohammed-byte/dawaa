import type { ReactNode } from 'react';

export function PageHeader({
  title,
  hint,
  actions,
  breadcrumbs,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      {breadcrumbs ? <nav className="ds-breadcrumbs" aria-label="Breadcrumb">{breadcrumbs}</nav> : null}
      <div className="ds-page-header-row">
        <div>
          <h1 className="ds-page-title">{title}</h1>
          {hint ? <p className="ds-page-hint">{hint}</p> : null}
        </div>
        {actions ? <div className="ds-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}

export function StatCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <article className={`ds-stat ds-stat-${tone}`}>
      <span className="ds-stat-label">{label}</span>
      <strong className="ds-stat-value">{value}</strong>
      {detail ? <span className="ds-stat-detail">{detail}</span> : null}
    </article>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  title?: string;
}) {
  return (
    <span className={`ds-badge ds-badge-${tone}`} title={title}>
      <i className="ds-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="ds-empty">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ds-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ds-error-state" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
