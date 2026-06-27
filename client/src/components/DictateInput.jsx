// DictateInput.jsx — Drop-in input field with mic/dictation button
// Works on desktop (Chrome/Edge), Android Chrome, and iOS Safari 14.5+
import { Mic, MicOff } from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

/**
 * Drop-in replacement for <input type="text"> that adds a floating mic button.
 *
 * Props: all standard input props, plus:
 *   - value        (required) controlled value
 *   - onChange     (required) called with synthetic-like event { target: { value } }
 *   - className    extra classes for the input
 *   - placeholder
 */
export default function DictateInput({
  value = '',
  onChange,
  placeholder = '',
  className = '',
  disabled = false,
  name,
  id,
  type = 'text',
  ...rest
}) {
  const { listening, supported, interimText, toggle } = useSpeechRecognition({
    onResult: (chunk) => {
      onChange({ target: { name, value: value + chunk } });
    },
  });

  const base =
    'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300';

  return (
    <div className="relative">
      <input
        type={type}
        name={name}
        id={id}
        value={listening && interimText ? value + interimText : value}
        onChange={e => onChange({ target: { name, value: e.target.value } })}
        placeholder={placeholder}
        disabled={disabled}
        className={`${base} ${listening ? 'ring-2 ring-red-400 border-red-300 dark:border-red-800 pr-10' : 'pr-10'} ${className}`}
        {...rest}
      />

      {/* Mic button — only shown when Web Speech API is available */}
      {supported && type === 'text' && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()} // prevent input blur
          onClick={toggle}
          title={listening ? 'Stop dictation' : 'Dictate (tap to speak)'}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          className={`absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors shadow-sm ${
            listening
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400'
          }`}
        >
          {listening ? <MicOff size={13} /> : <Mic size={13} />}
        </button>
      )}
    </div>
  );
}
