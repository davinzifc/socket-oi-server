import { getStatusColor } from '../../utils/helpers';

interface StatusIndicatorProps {
  status: 'ONLINE' | 'IDLE' | 'OFFLINE';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
};

export function StatusIndicator({ status, size = 'md', className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`${sizeClasses[size]} ${getStatusColor(status)} rounded-full inline-block ${className}`}
      title={status}
    />
  );
}
