// prevention/SignaturePad.jsx — on-screen signature capture (Phase 3 §3.2).
// Pointer-event canvas (mouse/touch/pencil), DPR-scaled so strokes stay crisp,
// exports a PNG data URL. The typed who-signed name lives with the caller.
import React, { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { Btn } from './ui';

export default function SignaturePad({ onChange, height = 180 }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    // White background so the stored PNG prints correctly on the notice.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, height);
  }, [height]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, canvas.height);
    setEmpty(true);
    onChange?.(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none' }}
        tabIndex={0}
        role="img"
        className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white cursor-crosshair focus:outline-none focus:ring-2 focus:ring-red-600"
        aria-label={empty ? 'Signature area. Draw with finger, stylus, or mouse.' : 'Signature area. A signature has been drawn.'}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite">{empty ? 'Sign above with finger, stylus, or mouse.' : 'Signature captured.'}</span>
        <Btn variant="ghost" onClick={clear}><Eraser size={16} aria-hidden="true" /> Clear</Btn>
      </div>
    </div>
  );
}
