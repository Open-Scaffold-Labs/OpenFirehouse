/**
 * FieldTooltip.jsx
 *
 * A small ⓘ icon that renders a popover tooltip when hovered (desktop)
 * or tapped (mobile). Place it inline next to any form field label to
 * give users context without cluttering the UI.
 *
 * Usage:
 *   import FieldTooltip from './FieldTooltip';
 *
 *   <label className="...">
 *     Incident Type Code <FieldTooltip text="The 3–5 digit NFIRS code that classifies the type of incident." />
 *   </label>
 *
 * Props
 * ─────
 *  text      – string  Tooltip text (required)
 *  maxWidth  – string  Tailwind max-w class (default 'max-w-xs')
 *  position  – 'top' | 'bottom' | 'left' | 'right'  (default 'top')
 */

import { useState, useRef, useEffect } from 'react';

export default function FieldTooltip({ text, maxWidth = 'max-w-xs', position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  // Close on outside click (mobile support)
  useEffect(() => {
    if (!visible) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setVisible(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [visible]);

  const positionClasses = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left:   'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right:  'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  const arrowClasses = {
    top:    'top-full left-1/2 -translate-x-1/2 border-t-gray-700 border-t-4 border-x-4 border-x-transparent border-b-0',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-700 border-b-4 border-x-4 border-x-transparent border-t-0',
    left:   'left-full top-1/2 -translate-y-1/2 border-l-gray-700 border-l-4 border-y-4 border-y-transparent border-r-0',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-gray-700 border-r-4 border-y-4 border-y-transparent border-l-0',
  };

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center ml-1 align-middle"
      style={{ verticalAlign: 'middle' }}
    >
      {/* Icon button */}
      <button
        type="button"
        aria-label="Field help"
        onClick={() => setVisible(v => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="w-3.5 h-3.5 rounded-full bg-gray-300 hover:bg-gray-400 text-white flex items-center justify-center text-[9px] font-bold leading-none focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-gray-400 transition-colors"
        style={{ fontSize: '9px', lineHeight: 1 }}
      >
        i
      </button>

      {/* Popover */}
      {visible && (
        <span
          className={`absolute z-50 ${positionClasses[position]} ${maxWidth} bg-gray-700 text-white text-[11px] leading-snug rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-normal`}
          style={{ minWidth: '140px' }}
        >
          {text}
          {/* Arrow */}
          <span className={`absolute w-0 h-0 ${arrowClasses[position]}`} />
        </span>
      )}
    </span>
  );
}
