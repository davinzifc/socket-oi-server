interface BadgeProps {
  count: number;
  className?: string;
}

export function Badge({ count, className = '' }: BadgeProps) {
  if (count === 0) return null;

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-500 text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
