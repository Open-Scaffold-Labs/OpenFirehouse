const statusConfig = {
  'In Service':     'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 ring-emerald-600/20',
  'Out of Service': 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 ring-red-500/20',
  'Reserve':        'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-500/20',
  'Maintenance':    'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 ring-amber-600/20',
};

export default function ApparatusStatusBadge({ status }) {
  const classes = statusConfig[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ring-gray-500/20';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}>
      {status}
    </span>
  );
}
