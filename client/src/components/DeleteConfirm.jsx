import { AlertTriangle } from 'lucide-react';
import useDialog from '../hooks/useDialog';

export default function DeleteConfirm({ member, onConfirm, onCancel }) {
  // Dialog semantics + focus management (see hooks/useDialog.js). NO Escape-to-close.
  const dlg = useDialog();

  if (!member) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div {...dlg.dialogProps} className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <h3 id={dlg.titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Remove Member</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Are you sure you want to remove{' '}
            <span className="font-medium text-gray-800 dark:text-gray-100">{member.name}</span>? This action cannot be
            undone.
          </p>
        </div>
        <div className="flex divide-x divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="flex-1 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(member.id)}
            className="flex-1 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
