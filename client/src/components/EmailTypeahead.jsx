import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { initialMembers } from '../data/members';

export default function EmailTypeahead({
  value,
  onChange,
  onSelect,
  placeholder = 'Type to search email...',
  label,
  className = '',
  members = initialMembers,
  emailField = 'both',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const containerRef = useRef(null);

  // Determine which email fields to search based on emailField prop
  const getEmailsFromMember = useCallback((member) => {
    const emails = [];
    if (emailField === 'both' || emailField === 'station_email') {
      if (member.station_email) {
        emails.push({ email: member.station_email, type: 'station' });
      }
    }
    if (emailField === 'both' || emailField === 'personal_email') {
      if (member.personal_email) {
        emails.push({ email: member.personal_email, type: 'personal' });
      }
    }
    return emails;
  }, [emailField]);

  // Generate suggestions
  useEffect(() => {
    if (value.length < 2) {
      setSuggestions([]);
      setSelectedIndex(-1);
      setIsOpen(false);
      return;
    }

    const lowerValue = value.toLowerCase();
    const allSuggestions = [];

    members.forEach((member) => {
      const emails = getEmailsFromMember(member);
      emails.forEach(({ email, type }) => {
        if (email.toLowerCase().includes(lowerValue)) {
          allSuggestions.push({
            member,
            email,
            type,
            displayText: `${member.name} — ${email}`,
          });
        }
      });
    });

    // Limit to 8 suggestions
    const limited = allSuggestions.slice(0, 8);
    setSuggestions(limited);
    setSelectedIndex(-1);
    setIsOpen(limited.length > 0);
  }, [value, members, getEmailsFromMember]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen && suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        setIsOpen(true);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          const suggestion = suggestions[selectedIndex];
          onChange(suggestion.email);
          onSelect?.(suggestion.member);
          setIsOpen(false);
          setSuggestions([]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  }, [isOpen, suggestions, selectedIndex, onChange, onSelect]);

  // Highlight matching text in email
  const highlightMatch = (text, query) => {
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);

    return (
      <>
        {before}
        <span className="font-bold text-gray-900 dark:text-gray-100">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm outline-none focus:ring-2 focus:ring-red-500"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSuggestions([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear input"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg overflow-hidden"
        >
          <ul className="max-h-[300px] overflow-y-auto">
            {suggestions.map((suggestion, index) => {
              const isSelected = index === selectedIndex;
              const emailBadge = suggestion.type === 'station' ? '🏢' : '👤';

              return (
                <li key={`${suggestion.member.id}-${suggestion.email}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(suggestion.email);
                      onSelect?.(suggestion.member);
                      setIsOpen(false);
                      setSuggestions([]);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-100'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{emailBadge}</span>
                        <span className="truncate">
                          {highlightMatch(suggestion.displayText, value)}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={16} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* No results message */}
      {value.length >= 2 && suggestions.length === 0 && isOpen && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg px-3 py-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">No matching emails found</p>
        </div>
      )}
    </div>
  );
}
