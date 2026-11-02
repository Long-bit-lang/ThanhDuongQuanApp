import React from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  icon,
  action,
  highlight = false,
  children,
  className = '',
}) => {
  return (
    <div className={`glass-panel ${highlight ? 'highlight' : ''} ${className}`} style={{ padding: '1.5rem' }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {icon && <div style={{ color: 'var(--accent-gold)' }}>{icon}</div>}
            <div>
              {title && <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>}
              {subtitle && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</p>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};
