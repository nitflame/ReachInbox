import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send,
  Zap,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Clock,
  Magnet,
  Maximize2,
  Lock,
  Unlock,
} from 'lucide-react';
import { ZeroGravityEngine, type PhysicsBody } from '../../physics/engine';
import { useEmail } from '../../context/EmailContext';
import { useAuth } from '../../context/AuthContext';

interface ZeroGravityCanvasProps {
  onOpenComposeModal: () => void;
  onSwitchToZenMode: () => void;
}

export const ZeroGravityCanvas: React.FC<ZeroGravityCanvasProps> = ({
  onOpenComposeModal,
  onSwitchToZenMode,
}) => {
  const { scheduledEmails, sentEmails, scheduleEmails } = useEmail();
  const { user } = useAuth();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ZeroGravityEngine | null>(null);

  const [activeBodies, setActiveBodies] = useState<PhysicsBody[]>([]);
  const [isSimulationFrozen, setIsSimulationFrozen] = useState(false);
  const [isTidalSweeping, setIsTidalSweeping] = useState(false);

  // Two-Body Kinetic Launch Lock state
  const [isKeyDocked, setIsKeyDocked] = useState(false);
  const [launchCountdown, setLaunchCountdown] = useState<number | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState(false);

  // Drag interaction refs
  const dragTargetRef = useRef<{
    body: PhysicsBody;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
  } | null>(null);

  // Canvas Vector Graphics Renderer (Tethers, Pauli Repulsion Rings, Glows)
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = engine.bounds.width;
    canvas.height = engine.bounds.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Pauli Exclusion Bubbles (Anti-Occlusion Fields)
    for (const body of engine.bodies.values()) {
      if (body.repulsionRadius > 0) {
        const grad = ctx.createRadialGradient(body.x, body.y, 10, body.x, body.y, body.repulsionRadius);
        grad.addColorStop(0, 'rgba(99, 102, 241, 0.06)');
        grad.addColorStop(0.7, 'rgba(99, 102, 241, 0.03)');
        grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.beginPath();
        ctx.arc(body.x, body.y, body.repulsionRadius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 2. Draw Dynamic Verlet Spring Tethers
    for (const tether of engine.tethers) {
      const source = engine.bodies.get(tether.sourceId);
      const target = engine.bodies.get(tether.targetId);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy);

      // Catenary sag curve
      const midX = (source.x + target.x) / 2;
      const sagAmount = Math.max(0, (tether.restLength - dist) * 0.4);
      const midY = (source.y + target.y) / 2 + sagAmount;

      // Tether color by branch type
      let strokeStyle = 'rgba(99, 102, 241, 0.5)';
      if (tether.branchType === 'true') strokeStyle = 'rgba(16, 185, 129, 0.6)';
      if (tether.branchType === 'false') strokeStyle = 'rgba(245, 158, 11, 0.6)';

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(midX, midY, target.x, target.y);
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = dist > tether.restLength * 1.5 ? 3 : 2;
      ctx.stroke();

      // Luminescent Pacing Photon Pulse
      const t = tether.pulsePhase;
      const pulseX = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * midX + t * t * target.x;
      const pulseY = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * midY + t * t * target.y;

      ctx.beginPath();
      ctx.arc(pulseX, pulseY, 4, 0, Math.PI * 2);
      ctx.fillStyle = tether.branchType === 'true' ? '#34d399' : '#818cf8';
      ctx.shadowColor = '#818cf8';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, []);

  // Execute Scheduled Sequence via Existing Email Service
  const handleExecuteLaunch = useCallback(async () => {
    setLaunchSuccess(true);
    try {
      await scheduleEmails({
        subject: 'Anti-Gravity Kinetic Launch Campaign',
        body: 'This campaign was safely authorized via the Anti-Gravity Two-Body Kinetic Lock.',
        emails: ['prospect-alpha@reachinbox.dev', 'prospect-beta@reachinbox.dev'],
        startTime: new Date().toISOString(),
        delayBetweenSeconds: 2,
        hourlyLimit: 50,
      });
    } catch (err) {
      console.warn('Launch error:', err);
    }

    setTimeout(() => {
      setLaunchSuccess(false);
      setIsKeyDocked(false);
      // Return key to original dock
      const key = engineRef.current?.bodies.get('ignition-key');
      if (key) {
        key.x = key.anchorX;
        key.y = key.anchorY;
        key.vx = 0;
        key.vy = 0;
      }
    }, 3500);
  }, [scheduleEmails]);

  // Initialize Physics Engine
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = Math.max(700, window.innerHeight - 80);
    const engine = new ZeroGravityEngine(width, height);
    engineRef.current = engine;

    // 1. ANCHOR: Command Dock (Top Right)
    engine.addBody({
      id: 'cmd-schedule-cta',
      role: 'cta',
      title: 'Compose Campaign',
      subtitle: 'Primary Launch Pad',
      x: width - 180,
      y: 80,
      width: 220,
      height: 60,
      mass: 60,
      pinned: true,
      repulsionRadius: 160,
      repulsionStrength: 450,
      hasAnchor: true,
      anchorX: width - 180,
      anchorY: 80,
    });

    // 2. TWO-BODY SAFETY LOCK: Launch Silo & Key Capsule
    engine.addBody({
      id: 'launch-silo',
      role: 'launch-silo',
      title: 'Ignition Bay',
      subtitle: 'Dock Key to Execute',
      x: width - 180,
      y: 180,
      width: 220,
      height: 80,
      mass: 50,
      pinned: true,
      repulsionRadius: 100,
      repulsionStrength: 200,
      hasAnchor: true,
      anchorX: width - 180,
      anchorY: 180,
    });

    engine.addBody({
      id: 'ignition-key',
      role: 'ignition-key',
      title: '🔑 Safety Key',
      subtitle: 'Drag to Ignition Bay',
      x: width - 380,
      y: 220,
      width: 140,
      height: 48,
      mass: 3.5,
      hasAnchor: true,
      anchorX: width - 380,
      anchorY: 220,
      restitution: 0.2,
    });

    // 3. SEQUENCE CORRIDOR: Active Sequence Timeline Nodes
    const step1 = engine.addBody({
      id: 'step-intro-email',
      role: 'sequence-step',
      title: 'Step 1: Introduction Pitch',
      subtitle: `${user?.email || 'dev@reachinbox.local'} • Pacing: 2000ms`,
      x: 320,
      y: 160,
      width: 240,
      height: 90,
      mass: 5,
      hasAnchor: true,
      anchorX: 320,
      anchorY: 160,
    });

    const conditionGate = engine.addBody({
      id: 'step-condition-opened',
      role: 'condition-gate',
      title: 'Condition: Recipient Opened?',
      subtitle: 'Wait 24h before branch',
      x: 320,
      y: 330,
      width: 220,
      height: 70,
      mass: 3,
      hasAnchor: true,
      anchorX: 320,
      anchorY: 330,
    });

    const step2A = engine.addBody({
      id: 'step-followup-opened',
      role: 'sequence-step',
      title: 'Step 2A: Meeting Invite',
      subtitle: 'Branch: Opened (True)',
      x: 180,
      y: 500,
      width: 210,
      height: 80,
      mass: 4,
      hasAnchor: true,
      anchorX: 180,
      anchorY: 500,
    });

    const step2B = engine.addBody({
      id: 'step-followup-unopened',
      role: 'sequence-step',
      title: 'Step 2B: Gentle Nudge',
      subtitle: 'Branch: Not Opened (False)',
      x: 460,
      y: 500,
      width: 210,
      height: 80,
      mass: 4,
      hasAnchor: true,
      anchorX: 460,
      anchorY: 500,
    });

    // Dynamic Elastic Tethers connecting sequence steps
    engine.addTether(step1.id, conditionGate.id, 'direct', 160);
    engine.addTether(conditionGate.id, step2A.id, 'true', 180);
    engine.addTether(conditionGate.id, step2B.id, 'false', 180);

    // 4. QUARANTINED UNVALIDATED NODE (Safety Demonstration)
    engine.addBody({
      id: 'quarantined-draft',
      role: 'sequence-step',
      title: '⚠️ Unvalidated Draft',
      subtitle: 'Quarantined: Missing Recipient List',
      x: 720,
      y: 380,
      width: 230,
      height: 75,
      mass: 4,
      isQuarantined: true,
      quarantineReason: 'Missing CSV Recipient Payload',
      hasAnchor: true,
      anchorX: 720,
      anchorY: 380,
      repulsionRadius: 90,
      repulsionStrength: 250,
    });

    // 5. RECOVERY TRAY CHIPS (Floating email items from database)
    const recentEmails = [...scheduledEmails, ...sentEmails].slice(0, 8);
    recentEmails.forEach((em, idx) => {
      engine.addBody({
        id: `email-chip-${em.id}`,
        role: 'recipient-chip',
        title: em.recipient,
        subtitle: em.subject.slice(0, 24) + '...',
        x: 120 + (idx % 4) * 160,
        y: height - 120 - Math.floor(idx / 4) * 50,
        width: 140,
        height: 40,
        mass: 0.4,
        restitution: 0.5,
        frictionAir: 0.02,
        hasAnchor: true,
        anchorX: 120 + (idx % 4) * 160,
        anchorY: height - 80,
      });
    });

    // Initial render state sync
    setActiveBodies(Array.from(engine.bodies.values()));

    // Animation Loop
    let animId: number;
    const loop = () => {
      engine.step(1);

      // Check Two-Body Launch Key Proximity to Silo
      const silo = engine.bodies.get('launch-silo');
      const key = engine.bodies.get('ignition-key');
      if (silo && key) {
        const dist = Math.hypot(key.x - silo.x, key.y - silo.y);
        if (dist < 50) {
          // Snap key into silo socket
          key.x = silo.x;
          key.y = silo.y;
          key.vx = 0;
          key.vy = 0;
          if (!isKeyDocked) {
            setIsKeyDocked(true);
          }
        } else if (dist > 90 && isKeyDocked) {
          // Key was flung or pulled out
          setIsKeyDocked(false);
          setLaunchCountdown(null);
        }
      }

      // Render tethers & field effects onto canvas
      renderCanvas();
      setActiveBodies(Array.from(engine.bodies.values()));
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(700, window.innerHeight - 80);
      engine.setBounds(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [scheduledEmails, sentEmails, user?.email, isKeyDocked, renderCanvas]);

  // Two-Body Kinetic Countdown Timer
  useEffect(() => {
    if (!isKeyDocked) {
      setLaunchCountdown(null);
      return;
    }

    setLaunchCountdown(3);
    const interval = setInterval(() => {
      setLaunchCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          handleExecuteLaunch();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isKeyDocked, handleExecuteLaunch]);

  // Pointer Grab & Fling Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent, body: PhysicsBody) => {
    if (body.pinned) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    body.isDragging = true;
    body.vx = 0;
    body.vy = 0;

    dragTargetRef.current = {
      body,
      offsetX: e.clientX - body.x,
      offsetY: e.clientY - body.y,
      lastX: e.clientX,
      lastY: e.clientY,
      lastTime: typeof performance !== 'undefined' ? performance.now() : 0,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragTargetRef.current;
    if (!drag) return;

    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = Math.max(1, now - drag.lastTime);
    const body = drag.body;

    body.x = e.clientX - drag.offsetX;
    body.y = e.clientY - drag.offsetY;

    // Calculate kinetic velocity for fling release
    body.vx = ((e.clientX - drag.lastX) / dt) * 16;
    body.vy = ((e.clientY - drag.lastY) / dt) * 16;

    // Clamp max velocity
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > 45) {
      body.vx = (body.vx / speed) * 45;
      body.vy = (body.vy / speed) * 45;
    }

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastTime = now;
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragTargetRef.current;
    if (!drag) return;

    drag.body.isDragging = false;
    dragTargetRef.current = null;
  }, []);

  // "Tidal Sweep" Trigger
  const triggerTidalSweep = useCallback(() => {
    setIsTidalSweeping(true);
    engineRef.current?.triggerTidalSweep();
    setTimeout(() => setIsTidalSweeping(false), 500);
  }, []);

  // Chronos Rewind Trigger
  const triggerChronosRewind = useCallback(() => {
    engineRef.current?.rewind(90);
  }, []);

  // WCAG Accessibility: Kinetic Freeze on Keyboard Navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Freeze physics on keyboard tab navigation to maintain WCAG focus order
        setIsSimulationFrozen(true);
        if (engineRef.current) {
          engineRef.current.isFrozen = true;
        }
      } else if (e.key === 'Escape') {
        // Unfreeze on escape
        setIsSimulationFrozen(false);
        if (engineRef.current) {
          engineRef.current.isFrozen = false;
        }
      } else if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        triggerTidalSweep();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        triggerChronosRewind();
      }
    },
    [triggerTidalSweep, triggerChronosRewind]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full min-h-[calc(100vh-4rem)] bg-[#07090e] overflow-hidden select-none"
    >
      {/* Background Starfield & Subtle Physics Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #3b4261 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Physics Vector Canvas (Tethers, Force Rings, Waves) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* Heads-Up Control Station (HUD) */}
      <div className="absolute top-4 left-6 z-30 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111422]/90 border border-indigo-500/30 text-xs text-indigo-300 shadow-lg backdrop-blur-md">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold">Anti-Gravity Workspace</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono">
            Zero-G Active
          </span>
        </div>

        {/* Tidal Sweep Button */}
        <button
          onClick={triggerTidalSweep}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-md ${
            isTidalSweeping
              ? 'bg-indigo-600 text-white border-indigo-400 scale-95'
              : 'bg-[#141828]/90 text-[#c5cbdb] border-[#252c42] hover:border-indigo-500/50 hover:text-white'
          }`}
          title="Snap all elements to magnetic anchors (Spacebar)"
        >
          <Magnet className="w-3.5 h-3.5 text-indigo-400" />
          <span>Tidal Sweep (Space)</span>
        </button>

        {/* Chronos Rewind Button */}
        <button
          onClick={triggerChronosRewind}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#141828]/90 text-[#c5cbdb] border border-[#252c42] hover:border-amber-500/50 hover:text-white transition-all cursor-pointer shadow-md"
          title="Reverse physics accident (Ctrl+Z)"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>Rewind (Ctrl+Z)</span>
        </button>

        {/* Simulation Freeze Indicator */}
        <button
          onClick={() => {
            const next = !isSimulationFrozen;
            setIsSimulationFrozen(next);
            if (engineRef.current) engineRef.current.isFrozen = next;
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer shadow-md ${
            isSimulationFrozen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-[#141828]/90 text-[#9ca3af] border-[#252c42] hover:text-white'
          }`}
          title="Pause/Resume dynamic tumbling (Tab freezes, Esc unfreezes)"
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{isSimulationFrozen ? 'Physics: Frozen (Tab)' : 'Physics: Fluid'}</span>
        </button>

        {/* Switch to Zen Mode */}
        <button
          onClick={onSwitchToZenMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#141828]/90 text-[#9ca3af] border border-[#252c42] hover:text-white hover:border-indigo-500/40 transition-all cursor-pointer shadow-md"
          title="Switch to stationary Kanban/Table view"
        >
          <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Zen Grid Mode</span>
        </button>
      </div>

      {/* Floating Interactive Rigid-Body DOM Elements */}
      {activeBodies.map((body) => {
        const isDragging = body.isDragging;
        const isKey = body.role === 'ignition-key';
        const isSilo = body.role === 'launch-silo';
        const isCTA = body.role === 'cta';

        return (
          <div
            key={body.id}
            onPointerDown={(e) => handlePointerDown(e, body)}
            onFocus={() => {
              body.isFocused = true;
              body.angle = 0;
            }}
            onBlur={() => {
              body.isFocused = false;
            }}
            tabIndex={0}
            style={{
              position: 'absolute',
              left: `${body.x - body.width / 2}px`,
              top: `${body.y - body.height / 2}px`,
              width: `${body.width}px`,
              height: `${body.height}px`,
              transform: `rotate(${body.angle}rad)`,
              touchAction: 'none',
              cursor: body.pinned ? 'default' : isDragging ? 'grabbing' : 'grab',
              zIndex: isDragging ? 40 : body.isFocused ? 35 : isCTA || isSilo ? 25 : 20,
            }}
            className={`rounded-2xl transition-shadow p-3.5 flex flex-col justify-between select-none ${
              body.isQuarantined
                ? 'bg-amber-950/40 border-2 border-amber-500/60 text-amber-200 shadow-xl shadow-amber-500/10'
                : isCTA
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 border border-indigo-400 text-white shadow-2xl shadow-indigo-500/30'
                : isSilo
                ? 'bg-[#101422] border-2 border-dashed border-indigo-500/40 text-indigo-200 shadow-xl'
                : isKey
                ? isKeyDocked
                  ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300 shadow-xl shadow-emerald-500/20'
                  : 'bg-indigo-950/80 border-2 border-indigo-400 text-indigo-100 shadow-xl shadow-indigo-500/20'
                : body.role === 'recipient-chip'
                ? 'bg-[#111420]/95 border border-[#23283c] text-xs text-[#c5c9d9] shadow-md hover:border-indigo-500/40'
                : 'bg-[#131728]/95 border border-[#23293f] text-[#e0e2ec] shadow-xl hover:border-indigo-500/50'
            } ${body.isFocused ? 'ring-4 ring-indigo-500 ring-offset-2 ring-offset-[#07090e]' : ''}`}
          >
            {/* Header Content */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                {body.isQuarantined ? (
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                ) : isCTA ? (
                  <Send className="w-4 h-4 text-white shrink-0" />
                ) : isSilo ? (
                  isKeyDocked ? (
                    <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Unlock className="w-4 h-4 text-indigo-400 shrink-0" />
                  )
                ) : (
                  <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
                <span className="font-bold text-xs truncate">{body.title}</span>
              </div>

              {body.isQuarantined && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">
                  Quarantine
                </span>
              )}
            </div>

            {/* Subtitle / Description */}
            {body.subtitle && (
              <p className="text-[10px] text-[#8e94a8] truncate mt-1">
                {body.subtitle}
              </p>
            )}

            {/* CTA Click Action */}
            {isCTA && (
              <button
                onClick={onOpenComposeModal}
                className="mt-2 w-full py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Open Full Composer
              </button>
            )}

            {/* Two-Body Ignition Bay Countdown */}
            {isSilo && isKeyDocked && (
              <div className="mt-1 flex items-center justify-between bg-[#0b0e18] p-1.5 rounded-lg border border-indigo-500/30">
                <span className="text-[10px] text-indigo-300">
                  {launchSuccess ? '🚀 Campaign Dispatched!' : 'Authorizing Dispatch...'}
                </span>
                {launchCountdown !== null && launchCountdown > 0 && (
                  <span className="text-xs font-mono font-bold text-emerald-400 animate-pulse">
                    00:0{launchCountdown}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Semantic Off-Screen DOM for Full WCAG 2.2 Screen Reader Compliance */}
      <nav
        aria-label="Email Automation Sequence Navigation"
        className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:bottom-4 focus-within:left-4 focus-within:z-50 focus-within:bg-black focus-within:p-4 focus-within:text-white"
      >
        <h2>Accessible Automation Sequence</h2>
        <ul>
          <li>
            <button onClick={onOpenComposeModal}>Compose New Email Campaign</button>
          </li>
          <li>
            <button onClick={onSwitchToZenMode}>Switch to Zen Grid View</button>
          </li>
          {scheduledEmails.map((em) => (
            <li key={em.id}>
              Scheduled Email to {em.recipient}: {em.subject}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};
