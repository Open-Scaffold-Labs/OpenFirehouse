/**
 * CommanderCam.jsx — Live Video Feed from Firefighter Commander Cameras
 *
 * Three modes:
 *  1. Live Camera — uses device camera via getUserMedia (real helmet mount)
 *  2. Simulated Feed — canvas-rendered fireground scene with smoke, light
 *     flicker, and HUD overlay (for demos without camera access)
 *  3. Companion Page — /commander-cam.html on a phone streams to the board
 *
 * Features:
 *  - Multi-feed grid (one per unit)
 *  - HUD overlay: unit designation, SCBA air %, elapsed time, heart rate
 *  - Thermal vision toggle (simulated)
 *  - Full-screen mode for any feed
 *  - Recording indicator
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, CameraOff, Maximize2, Minimize2, Video, Eye,
  VideoOff, Mic, MicOff, Radio, Users, X, Zap, Thermometer,
  Heart, Wind, Clock, AlertTriangle, Shield,
} from 'lucide-react';

// ─── Simulated Fireground Renderer ───────────────────────────────────────────
// Draws a dynamic canvas that looks like commander cam footage from inside
// a structure fire: flickering orange/red light, smoke layers, HUD overlay

function createSimulatedFeed(canvas, unitName, phaseRef) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  let frame = 0;
  let running = true;

  // Smoke particles
  const particles = Array.from({ length: 40 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 30 + 10,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -Math.random() * 1.2 - 0.3,
    opacity: Math.random() * 0.4 + 0.1,
  }));

  function getPhaseColors() {
    const phase = phaseRef?.current || 'responding';
    switch (phase) {
      case 'responding': return { bg: '#1a1a2e', flicker: '#334155', smoke: 'rgba(100,116,139,', hud: '#22d3ee' };
      case 'onscene': return { bg: '#1c1917', flicker: '#ea580c', smoke: 'rgba(120,80,40,', hud: '#22d3ee' };
      case 'interior': return { bg: '#0c0a09', flicker: '#dc2626', smoke: 'rgba(80,40,20,', hud: '#f97316' };
      case 'attack': return { bg: '#0c0a09', flicker: '#ef4444', smoke: 'rgba(100,30,10,', hud: '#ef4444' };
      case 'overhaul': return { bg: '#1c1917', flicker: '#78716c', smoke: 'rgba(100,100,100,', hud: '#22d3ee' };
      default: return { bg: '#1a1a2e', flicker: '#334155', smoke: 'rgba(100,100,100,', hud: '#22d3ee' };
    }
  }

  function draw() {
    if (!running) return;
    frame++;
    const colors = getPhaseColors();
    const phase = phaseRef?.current || 'responding';

    // Background with flicker
    const flicker = Math.sin(frame * 0.15) * 0.3 + Math.sin(frame * 0.07) * 0.2;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Fire glow (interior/attack phases)
    if (phase === 'interior' || phase === 'attack') {
      const glow = ctx.createRadialGradient(W * 0.3, H * 0.4, 20, W * 0.3, H * 0.4, W * 0.6);
      const intensity = 0.15 + flicker * 0.15;
      glow.addColorStop(0, `rgba(255,120,20,${intensity})`);
      glow.addColorStop(0.5, `rgba(200,60,10,${intensity * 0.5})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Secondary glow
      const glow2 = ctx.createRadialGradient(W * 0.7, H * 0.6, 10, W * 0.7, H * 0.6, W * 0.4);
      const i2 = 0.1 + Math.sin(frame * 0.2 + 1) * 0.1;
      glow2.addColorStop(0, `rgba(255,80,10,${i2})`);
      glow2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);
    }

    // On scene — exterior view with structure outline
    if (phase === 'onscene') {
      ctx.strokeStyle = `rgba(200,150,50,${0.3 + flicker * 0.1})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(W * 0.15, H * 0.2, W * 0.7, H * 0.55);
      // Windows with glow
      for (let wx = 0; wx < 3; wx++) {
        const gx = W * 0.25 + wx * W * 0.2;
        ctx.fillStyle = `rgba(255,160,30,${0.2 + Math.sin(frame * 0.1 + wx) * 0.15})`;
        ctx.fillRect(gx, H * 0.35, W * 0.1, H * 0.12);
      }
    }

    // Smoke particles
    particles.forEach(p => {
      p.x += p.vx + Math.sin(frame * 0.02 + p.y * 0.01) * 0.5;
      p.y += p.vy;
      if (p.y < -p.r) { p.y = H + p.r; p.x = Math.random() * W; }
      if (p.x < -p.r) p.x = W + p.r;
      if (p.x > W + p.r) p.x = -p.r;

      const smokeIntensity = phase === 'interior' || phase === 'attack' ? p.opacity * 1.5 : p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `${colors.smoke}${smokeIntensity})`;
      ctx.fill();
    });

    // Scan lines (commander cam effect)
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.sin(y * 0.5 + frame * 0.3) * 0.02})`;
      ctx.fillRect(0, y, W, 1);
    }

    // Camera shake
    if (phase === 'interior' || phase === 'attack') {
      const shake = Math.sin(frame * 0.5) * 1;
      ctx.translate(shake, Math.cos(frame * 0.3) * 0.5);
    }

    // ── HUD Overlay ──
    const hudColor = colors.hud;
    ctx.shadowBlur = 0;

    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, 28);

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = hudColor;
    ctx.textBaseline = 'middle';

    // Unit designation
    ctx.fillText(unitName, 8, 14);

    // REC indicator
    if (frame % 60 < 40) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(W - 18, 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('REC', W - 42, 14);
    }

    // Timestamp
    ctx.fillStyle = hudColor;
    ctx.font = 'bold 10px monospace';
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ctx.fillText(ts, W / 2 - 25, 14);

    // Bottom bar — vitals
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, H - 28, W, 28);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = hudColor;

    // SCBA air
    const air = Math.max(20, 90 - (frame * 0.02));
    const airColor = air < 50 ? '#ef4444' : air < 75 ? '#f59e0b' : '#22c55e';
    ctx.fillStyle = airColor;
    ctx.fillText(`SCBA ${Math.floor(air)}%`, 8, H - 14);

    // Heart rate
    const hr = Math.floor(100 + Math.sin(frame * 0.05) * 15 + (phase === 'attack' ? 30 : 0));
    ctx.fillStyle = hr > 140 ? '#ef4444' : hudColor;
    ctx.fillText(`HR ${hr}`, W * 0.35, H - 14);

    // Phase
    ctx.fillStyle = hudColor;
    ctx.fillText(phase.toUpperCase(), W * 0.65, H - 14);

    // Thermal vision border
    if (phase === 'interior' || phase === 'attack') {
      ctx.strokeStyle = `rgba(255,100,0,${0.3 + flicker * 0.1})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
    requestAnimationFrame(draw);
  }

  draw();
  return () => { running = false; };
}

// ─── Single Camera Feed ──────────────────────────────────────────────────────

function CameraFeed({ unit, idx, active, stream, simulated, phase, onToggle, onSimulate, onFullscreen, compact }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stopRef = useRef(null);
  const phaseRef = useRef(phase);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Attach live stream
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Run simulated feed
  useEffect(() => {
    if (simulated && canvasRef.current) {
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
      stopRef.current = createSimulatedFeed(canvasRef.current, unit.designation, phaseRef);
    }
    return () => { if (stopRef.current) stopRef.current(); };
  }, [simulated, unit.designation]);

  if (!active && !simulated) {
    return (
      <div className={`bg-gray-900 rounded-xl flex flex-col items-center justify-center border border-gray-700 ${compact ? 'h-36' : 'h-48'}`}>
        <CameraOff size={18} className="text-gray-600 dark:text-gray-300 mb-2" />
        <p className="text-xs text-gray-400 font-bold">{unit.designation}</p>
        <p className="text-[10px] text-gray-600 dark:text-gray-300 mb-2">{unit.status}</p>
        <div className="flex gap-1.5">
          <button onClick={() => onToggle(idx)} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold bg-cyan-900/30 px-2 py-1 rounded-lg">
            Live Cam
          </button>
          <button onClick={() => onSimulate(idx)} className="text-[10px] text-amber-400 hover:text-amber-300 font-bold bg-amber-900/30 px-2 py-1 rounded-lg">
            Simulate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden border-2 border-red-600 shadow-lg shadow-red-900/30 ${compact ? 'h-36' : 'h-48'}`}>
      {stream && <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />}
      {simulated && <canvas ref={canvasRef} className="w-full h-full object-cover" />}

      {/* Top overlay */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] font-black text-white drop-shadow-lg">{unit.designation}</span>
        </div>
        <span className="text-[9px] font-black text-red-400 bg-black/50 px-1.5 py-0.5 rounded">LIVE</span>
      </div>

      {/* Controls */}
      <div className="absolute bottom-1 right-1 flex gap-1">
        <button onClick={() => onFullscreen(idx)} aria-label={`Fullscreen ${unit.designation} feed`} className="w-5 h-5 bg-black/50 hover:bg-black/80 rounded flex items-center justify-center">
          <Maximize2 size={10} className="text-white" />
        </button>
        <button onClick={() => { if (stream) onToggle(idx); else onSimulate(idx); }} aria-label={`Stop ${unit.designation} feed`} className="w-5 h-5 bg-red-600/80 hover:bg-red-500 rounded flex items-center justify-center">
          <X size={10} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ─── Commander Cam Panel ────────────────────────────────────────────────────────

export default function CommanderCam({ incident, compact = false, demoPhase }) {
  const [feeds, setFeeds] = useState({});        // idx → 'live' | 'sim'
  const [streams, setStreams] = useState({});      // idx → MediaStream
  const [expanded, setExpanded] = useState(!!demoPhase);
  const [fullscreen, setFullscreen] = useState(null);

  const units = incident?.units || [];

  // Map demo timeline step to a phase for the simulated feed
  function getCurrentPhase() {
    if (!incident) return 'responding';
    const ms = incident.milestones || {};
    if (ms.underControl) return 'overhaul';
    if (ms.waterOn) return 'attack';
    if (ms.commandEstablished || ms.onScene) return 'interior';
    if (ms.enRoute) return 'responding';
    return 'onscene';
  }

  const phase = getCurrentPhase();

  async function startLiveFeed(idx) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStreams(s => ({ ...s, [idx]: stream }));
      setFeeds(f => ({ ...f, [idx]: 'live' }));
    } catch (err) {
      console.warn('Camera access denied:', err.message);
      // Fall back to simulated
      startSimFeed(idx);
    }
  }

  function startSimFeed(idx) {
    setFeeds(f => ({ ...f, [idx]: 'sim' }));
  }

  function stopFeed(idx) {
    const stream = streams[idx];
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStreams(s => { const n = { ...s }; delete n[idx]; return n; });
    setFeeds(f => { const n = { ...f }; delete n[idx]; return n; });
    if (fullscreen === idx) setFullscreen(null);
  }

  function handleFullscreen(idx) {
    setFullscreen(fullscreen === idx ? null : idx);
  }

  // Auto-start simulated feeds for all units during demo
  useEffect(() => {
    if (demoPhase && units.length > 0 && Object.keys(feeds).length === 0) {
      setExpanded(true);
      // Start sim feeds for first 2 units after a short delay
      const t = setTimeout(() => {
        setFeeds(f => ({ ...f, 0: 'sim', 1: 'sim' }));
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [demoPhase, units.length]); // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(streams).forEach(s => s?.getTracks().forEach(t => t.stop()));
    };
  }, []); // eslint-disable-line

  const activeCount = Object.keys(feeds).length;

  // ── Fullscreen view ──
  if (fullscreen !== null && feeds[fullscreen]) {
    const u = units[fullscreen] || { designation: `Unit ${fullscreen}`, status: 'Unknown' };
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-black text-white">{u.designation}</span>
            <span className="text-xs text-gray-400">— Commander Cam</span>
          </div>
          <button onClick={() => setFullscreen(null)} aria-label="Exit fullscreen" className="text-gray-400 hover:text-white">
            <Minimize2 size={18} />
          </button>
        </div>
        <div className="flex-1 relative">
          <CameraFeed
            unit={u} idx={fullscreen}
            active={feeds[fullscreen] === 'live'}
            stream={streams[fullscreen]}
            simulated={feeds[fullscreen] === 'sim'}
            phase={phase}
            onToggle={stopFeed} onSimulate={startSimFeed} onFullscreen={handleFullscreen}
          />
        </div>
      </div>
    );
  }

  // ── Collapsed bar ──
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 px-3 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl border border-gray-700 transition-colors w-full"
      >
        <Camera size={14} className="text-red-400" />
        <span className="text-xs font-bold flex-1 text-left">Commander Cam — Scene Feed</span>
        {activeCount > 0 && (
          <span className="text-[10px] font-black text-red-400 bg-red-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {activeCount} live
          </span>
        )}
        <Maximize2 size={12} className="text-gray-500 dark:text-gray-400" />
      </button>
    );
  }

  // ── Expanded panel ──
  return (
    <div className="bg-gray-950 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <Camera size={14} className="text-red-400" />
        <span className="text-xs font-black text-white flex-1">Commander Cam — Scene Feed</span>
        {activeCount > 0 && (
          <span className="text-[10px] font-black text-red-400 bg-red-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {activeCount} LIVE
          </span>
        )}
        {/* Start all simulated */}
        {activeCount === 0 && units.length > 0 && (
          <button
            onClick={() => {
              const newFeeds = {};
              units.forEach((_, i) => { if (i < 4) newFeeds[i] = 'sim'; });
              setFeeds(f => ({ ...f, ...newFeeds }));
            }}
            className="text-[10px] text-amber-400 font-bold bg-amber-900/30 px-2 py-1 rounded-lg hover:bg-amber-900/50"
          >
            Simulate All
          </button>
        )}
        <button onClick={() => setExpanded(false)} aria-label="Collapse Commander Cam" className="text-gray-500 dark:text-gray-400 hover:text-white">
          <Minimize2 size={12} />
        </button>
      </div>

      {/* Camera grid */}
      <div className={`grid gap-2 p-2 ${units.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {units.slice(0, 4).map((u, idx) => (
          <CameraFeed
            key={idx}
            unit={u} idx={idx}
            active={feeds[idx] === 'live'}
            stream={streams[idx]}
            simulated={feeds[idx] === 'sim'}
            phase={phase}
            compact={compact}
            onToggle={(i) => feeds[i] ? stopFeed(i) : startLiveFeed(i)}
            onSimulate={startSimFeed}
            onFullscreen={handleFullscreen}
          />
        ))}
      </div>

      {/* Phase indicator */}
      <div className="px-3 py-1.5 border-t border-gray-800 flex items-center gap-3 text-[10px]">
        <span className="text-gray-500 dark:text-gray-400 font-bold">PHASE:</span>
        <span className={`font-black uppercase ${phase === 'attack' ? 'text-red-400' : phase === 'interior' ? 'text-orange-400' : 'text-cyan-400'}`}>{phase}</span>
        <span className="text-gray-600 dark:text-gray-300 ml-auto">
          {Object.keys(feeds).some(k => feeds[k] === 'sim') ? 'Simulated fireground — demo mode' : 'WebRTC live feeds'}
        </span>
      </div>
    </div>
  );
}
