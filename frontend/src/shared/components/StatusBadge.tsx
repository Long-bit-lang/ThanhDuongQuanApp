import React from 'react';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info';

interface StatusBadgeProps {
  status: StatusVariant;
  label: string;
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, showDot = true }) => {
  return (
    <span className={`status-pill ${status}`}>
      {showDot && <span className="status-dot" />}
      {label}
    </span>
  );
};
