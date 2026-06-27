import { useState, useEffect } from 'react';

/**
 * useNetworkStatus
 * Returns { online } — true when the browser reports network connectivity.
 * Also fires a 'online'/'offline' event listener so the value updates in real time.
 */
export function useNetworkStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { online };
}
