import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useSpeechRecognition
 *
 * Cross-browser hook for Web Speech API.
 * Supports Chrome/Android (SpeechRecognition) and Safari iOS 14.5+
 * (webkitSpeechRecognition).
 *
 * Usage:
 *   const { listening, supported, start, stop, transcript } = useSpeechRecognition({
 *     onResult: (text) => setForm(f => ({ ...f, notes: f.notes + text })),
 *     continuous: true,
 *   });
 */
export function useSpeechRecognition({ onResult, continuous = true, lang = 'en-US' } = {}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);

  // Keep the callback ref fresh so callers don't need to worry about stale closures
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setSupported(true);
    const rec = new SpeechRecognition();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Capitalise first letter, add trailing space
          let text = result[0].transcript.trim();
          text = text.charAt(0).toUpperCase() + text.slice(1);
          if (!text.endsWith('.') && !text.endsWith('?') && !text.endsWith('!')) {
            text += '. ';
          } else {
            text += ' ';
          }
          finalChunk += text;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimText(interim);
      if (finalChunk && onResultRef.current) {
        onResultRef.current(finalChunk);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterimText('');
    };

    rec.onerror = (e) => {
      // 'aborted' fires when we call stop() ourselves — not a real error
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        console.warn('SpeechRecognition error:', e.error);
      }
      setListening(false);
      setInterimText('');
    };

    recognitionRef.current = rec;

    return () => {
      try { rec.abort(); } catch (_) {}
    };
  }, [continuous, lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      console.warn('Could not start SpeechRecognition:', e);
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current || !listening) return;
    recognitionRef.current.stop();
    setListening(false);
    setInterimText('');
  }, [listening]);

  const toggle = useCallback(() => {
    listening ? stop() : start();
  }, [listening, start, stop]);

  return { listening, supported, interimText, start, stop, toggle };
}
