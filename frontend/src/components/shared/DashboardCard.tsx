import type { ReactNode } from 'react';

interface DashboardCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtitle?: string;
  readonly subtitleColor?: string;
  readonly icon: ReactNode;
  readonly iconBg?: string;
  readonly pulse?: boolean;
}

export default function DashboardCard({
  title,
  value,
  subtitle,
  subtitleColor = 'text-text-secondary',
  icon,
  iconBg = 'bg-border',
  pulse = false,
}: DashboardCardProps) {
  return (
    <div className="glass-panel-solid rounded-md p-4 group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-text-muted tracking-wide mb-1.5">
            {title}
          </p>
          <p className="text-2xl font-bold text-text-primary tracking-tight">{value}</p>
          {subtitle && (
            <p className={`text-[11px] mt-1 font-medium ${subtitleColor}`}>{subtitle}</p>
          )}
        </div>
        <div className={`relative w-8 h-8 rounded shrink-0 ${iconBg} flex items-center justify-center opacity-80`}>
          {icon}
          {pulse && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-accent-red rounded-full animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
