import { getInitials } from '../../utils/helpers';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  const initials = getInitials(name);

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-indigo-500 text-white flex items-center justify-center font-semibold ${className}`}
    >
      {initials}
    </div>
  );
}
