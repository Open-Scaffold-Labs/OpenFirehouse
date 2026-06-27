const statusConfig = {
  Active: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 ring-emerald-600/20',
  Inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ring-gray-500/20',
  'On Leave': 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 ring-amber-600/20',
  Probationary: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-500/20',
};

export default function StatusBadge({ status }) {
  const classes = statusConfig[status] || statusConfig.Inactive;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {status}
    </span>
  );
}
