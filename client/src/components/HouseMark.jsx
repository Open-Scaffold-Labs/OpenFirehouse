/**
 * HouseMark — OpenFirehouse mark used as the Ask agent avatar.
 * Compact house-in-circle, not generic bot chrome.
 */
export default function HouseMark({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="15.5" fill="#1e3a5f" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="#c41e3a" strokeWidth="1.25" opacity="0.85" />
      <path d="M8.5 15.2 16 8.8l7.5 6.4V24H8.5Z" fill="#c41e3a" />
      <rect x="14.1" y="17.6" width="3.8" height="6.4" fill="#f8fafc" />
    </svg>
  );
}
