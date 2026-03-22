import type { Severity } from '../../types/telemetry';

const severityConfig: Record<Severity, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: 'bg-accent-red/10', text: 'text-accent-red', label: 'Critical' },
  ERROR: { bg: 'bg-accent-orange/10', text: 'text-accent-orange', label: 'Error' },
  WARNING: { bg: 'bg-accent-amber/10', text: 'text-accent-amber', label: 'Warning' },
  INFO: { bg: 'bg-signal-primary/10', text: 'text-signal-primary', label: 'Info' },
};

interface SeverityBadgeProps {
  readonly severity: Severity;
  readonly size?: 'sm' | 'md';
}

export default function SeverityBadge({ severity, size = 'sm' }: SeverityBadgeProps) {
  const config = severityConfig[severity];
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-[4px] font-bold uppercase tracking-wider ${config.bg} ${config.text} ${sizeClasses}`}
    >
      {config.label}
    </span>
  );
}
