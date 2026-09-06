/**
 * Zero-Gravity Physics Simulation Engine
 * 
 * Implements Non-Inertial User-Centered Design (NI-UCD) principles:
 *  - Verlet Integration for rock-solid stability
 *  - Potential Energy Wells (Magnetic Anchors)
 *  - Anti-Occlusion Pauli Exclusion Bubbles (Lennard-Jones Repulsion)
 *  - Gyroscopic Upright Restoring Torque
 *  - Damped Cosserat / Spring Tethers for If/Else branching
 *  - Kinetic Freeze for WCAG Accessibility
 *  - Chronos Rewind Buffer for accident recovery
 */

export type BodyRole =
  | 'cta'
  | 'sequence-step'
  | 'condition-gate'
  | 'recipient-chip'
  | 'ignition-key'
  | 'launch-silo';

export interface PhysicsBody {
  id: string;
  role: BodyRole;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  mass: number;
  invMass: number;
  angle: number; // in radians
  angularVelocity: number;
  restitution: number; // 0 (inelastic) to 1 (elastic)
  frictionAir: number; // quadratic drag coefficient
  pinned: boolean;

  // Magnetic Anchor Properties
  hasAnchor: boolean;
  anchorX: number;
  anchorY: number;
  magneticStiffness: number; // Hooke's k
  magneticDamping: number;

  // Anti-Occlusion Repulsion Bubble
  repulsionRadius: number; // radius in px
  repulsionStrength: number;

  // UCD Safety & Quarantine
  isQuarantined: boolean;
  quarantineReason?: string;

  // Interaction State
  isDragging: boolean;
  isFocused: boolean;
  isLockedInDock: boolean;
  customData?: any;
}

export interface DynamicTether {
  id: string;
  sourceId: string;
  targetId: string;
  restLength: number;
  stiffness: number;
  damping: number;
  branchType: 'direct' | 'true' | 'false';
  pulsePhase: number; // 0..1 for luminescent photon wave
}

export interface PhysicsSnapshot {
  timestamp: number;
  bodies: Array<{
    id: string;
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    angularVelocity: number;
  }>;
}

export class ZeroGravityEngine {
  public bodies: Map<string, PhysicsBody> = new Map();
  public tethers: DynamicTether[] = [];
  public bounds = { width: 1200, height: 800 };
  public isFrozen: boolean = false; // Kinetic Freeze for Tab accessibility
  public gravity = { x: 0, y: 0.08 }; // gentle micro-gravity toward bottom shelf

  private historyBuffer: PhysicsSnapshot[] = [];
  private maxHistoryFrames = 300; // ~5 seconds at 60fps
  private lastSnapshotTime = 0;

  constructor(width: number, height: number) {
    this.bounds = { width, height };
  }

  public setBounds(width: number, height: number) {
    this.bounds = { width, height };
  }

  public addBody(bodyConfig: Partial<PhysicsBody> & { id: string; role: BodyRole; x: number; y: number; width: number; height: number }): PhysicsBody {
    const mass = bodyConfig.mass ?? (bodyConfig.role === 'cta' ? 50 : bodyConfig.role === 'sequence-step' ? 4 : 1);
    const body: PhysicsBody = {
      id: bodyConfig.id,
      role: bodyConfig.role,
      title: bodyConfig.title ?? bodyConfig.id,
      subtitle: bodyConfig.subtitle,
      x: bodyConfig.x,
      y: bodyConfig.y,
      prevX: bodyConfig.x,
      prevY: bodyConfig.y,
      vx: 0,
      vy: 0,
      width: bodyConfig.width,
      height: bodyConfig.height,
      mass,
      invMass: bodyConfig.pinned ? 0 : 1 / Math.max(0.01, mass),
      angle: bodyConfig.angle ?? 0,
      angularVelocity: 0,
      restitution: bodyConfig.restitution ?? (bodyConfig.role === 'cta' ? 0.05 : 0.4),
      frictionAir: bodyConfig.frictionAir ?? 0.015,
      pinned: bodyConfig.pinned ?? false,

      hasAnchor: bodyConfig.hasAnchor ?? false,
      anchorX: bodyConfig.anchorX ?? bodyConfig.x,
      anchorY: bodyConfig.anchorY ?? bodyConfig.y,
      magneticStiffness: bodyConfig.magneticStiffness ?? 0.04,
      magneticDamping: bodyConfig.magneticDamping ?? 0.12,

      repulsionRadius: bodyConfig.repulsionRadius ?? (bodyConfig.role === 'cta' || bodyConfig.role === 'launch-silo' ? 140 : 0),
      repulsionStrength: bodyConfig.repulsionStrength ?? 350,

      isQuarantined: bodyConfig.isQuarantined ?? false,
      quarantineReason: bodyConfig.quarantineReason,

      isDragging: false,
      isFocused: false,
      isLockedInDock: false,
      customData: bodyConfig.customData,
    };

    this.bodies.set(body.id, body);
    return body;
  }

  public addTether(sourceId: string, targetId: string, branchType: 'direct' | 'true' | 'false' = 'direct', restLength: number = 180): DynamicTether {
    const tether: DynamicTether = {
      id: `${sourceId}->${targetId}`,
      sourceId,
      targetId,
      restLength,
      stiffness: 0.06,
      damping: 0.08,
      branchType,
      pulsePhase: 0,
    };
    this.tethers.push(tether);
    return tether;
  }

  /**
   * Main Physics Simulation Step (Verlet Integration)
   */
  public step(dt: number = 1) {
    if (this.isFrozen) {
      // Kinetic Freeze: time dilation stops all motion while keeping visual stability
      return;
    }

    const dtClamped = Math.min(1.5, Math.max(0.2, dt));

    // 1. Record snapshot for Chronos Rewind
    const now = Date.now();
    if (now - this.lastSnapshotTime > 80) {
      this.recordSnapshot();
      this.lastSnapshotTime = now;
    }

    // 2. Resolve Magnetic Anchors & Anti-Occlusion Repulsion Fields
    this.applyFieldForces();

    // 3. Resolve Dynamic Elastic Tethers
    this.resolveTethers();

    // 4. Update Positions & Velocities (Verlet + Gyroscopic Stabilization)
    for (const body of this.bodies.values()) {
      if (body.pinned || body.isDragging) continue;

      // Atmospheric Drag
      const speed = Math.hypot(body.vx, body.vy);
      const dragFactor = Math.max(0, 1 - body.frictionAir * speed);
      body.vx *= dragFactor;
      body.vy *= dragFactor;

      // Micro-gravity
      body.vy += this.gravity.y;

      // Position update
      body.x += body.vx * dtClamped;
      body.y += body.vy * dtClamped;

      // Gyroscopic Upright Restoring Torque: smoothly pulls orientation back to theta = 0
      const kTheta = 0.08; // restoring stiffness
      const cOmega = 0.15; // angular damping
      const restoringTorque = -kTheta * body.angle - cOmega * body.angularVelocity;
      body.angularVelocity += restoringTorque;
      body.angularVelocity *= 0.92; // angular friction
      body.angle += body.angularVelocity * dtClamped;

      // Clamp angle if focused
      if (body.isFocused) {
        body.angle *= 0.7; // snaps straight rapidly
      }

      // Boundary Collisions (Walls, Ceiling, Floor)
      this.handleBoundaryCollision(body);
    }

    // 5. Inter-body Collisions (Momentum Conservation without State Mutation)
    this.resolveBodyCollisions();

    // 6. Tether Photonic Waves (Campaign Pacing Visual Flow)
    for (const tether of this.tethers) {
      tether.pulsePhase = (tether.pulsePhase + 0.015) % 1;
    }
  }

  /**
   * Pauli Exclusion Field & Magnetic Anchor Basins
   */
  private applyFieldForces() {
    const bodies = Array.from(this.bodies.values());

    for (const body of bodies) {
      if (body.pinned || body.isDragging) continue;

      // A. Magnetic Home Docking (Hooke's Spring Damper)
      if (body.hasAnchor) {
        const dx = body.anchorX - body.x;
        const dy = body.anchorY - body.y;
        body.vx += (dx * body.magneticStiffness - body.vx * body.magneticDamping);
        body.vy += (dy * body.magneticStiffness - body.vy * body.magneticDamping);
      }

      // B. Anti-Occlusion Repulsion Bubbles (Lennard-Jones style)
      for (const other of bodies) {
        if (other === body) continue;
        if (other.repulsionRadius <= 0) continue;

        const dx = body.x - other.x;
        const dy = body.y - other.y;
        const dist = Math.hypot(dx, dy) || 1;

        if (dist < other.repulsionRadius) {
          // Strong exponential deflection to prevent clutter from occluding critical buttons
          const force = (1 - dist / other.repulsionRadius) * other.repulsionStrength * 0.015;
          const nx = dx / dist;
          const ny = dy / dist;
          body.vx += nx * force * body.invMass;
          body.vy += ny * force * body.invMass;
        }
      }
    }
  }

  /**
   * Resolves Damped Cosserat Elastic Tethers between Sequence Nodes
   */
  private resolveTethers() {
    for (const tether of this.tethers) {
      const source = this.bodies.get(tether.sourceId);
      const target = this.bodies.get(tether.targetId);
      if (!source || !target) continue;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Only exert restorative force if extended beyond slack zone
      if (dist > tether.restLength) {
        const delta = dist - tether.restLength;
        const force = delta * tether.stiffness;
        const nx = dx / dist;
        const ny = dy / dist;

        if (!source.pinned && !source.isDragging) {
          source.vx += nx * force * source.invMass;
          source.vy += ny * force * source.invMass;
        }
        if (!target.pinned && !target.isDragging) {
          target.vx -= nx * force * target.invMass;
          target.vy -= ny * force * target.invMass;
        }
      }
    }
  }

  /**
   * Elastic Boundary Collision
   */
  private handleBoundaryCollision(body: PhysicsBody) {
    const halfW = body.width / 2;
    const halfH = body.height / 2;

    // Left wall
    if (body.x - halfW < 10) {
      body.x = 10 + halfW;
      body.vx = -body.vx * body.restitution;
    }
    // Right wall
    if (body.x + halfW > this.bounds.width - 10) {
      body.x = this.bounds.width - 10 - halfW;
      body.vx = -body.vx * body.restitution;
    }
    // Ceiling
    if (body.y - halfH < 10) {
      body.y = 10 + halfH;
      body.vy = -body.vy * body.restitution;
    }
    // Bottom Inelastic Recovery Shelf
    if (body.y + halfH > this.bounds.height - 20) {
      body.y = this.bounds.height - 20 - halfH;
      body.vy = -body.vy * 0.15; // soft dampening on the floor
      body.vx *= 0.85; // floor friction
      body.angularVelocity *= 0.8;
    }
  }

  /**
   * Inter-body Rigid Collision Resolution
   */
  private resolveBodyCollisions() {
    const bodies = Array.from(this.bodies.values());
    const len = bodies.length;

    for (let i = 0; i < len; i++) {
      const b1 = bodies[i];
      for (let j = i + 1; j < len; j++) {
        const b2 = bodies[j];
        if (b1.pinned && b2.pinned) continue;

        // Simplified circular radius collision approximation
        const r1 = Math.min(b1.width, b1.height) * 0.45;
        const r2 = Math.min(b2.width, b2.height) * 0.45;
        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = r1 + r2;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          // Separation displacement
          const totalInvMass = b1.invMass + b2.invMass;
          if (totalInvMass > 0) {
            const m1Ratio = b1.invMass / totalInvMass;
            const m2Ratio = b2.invMass / totalInvMass;

            if (!b1.pinned && !b1.isDragging) {
              b1.x -= nx * overlap * m1Ratio;
              b1.y -= ny * overlap * m1Ratio;
            }
            if (!b2.pinned && !b2.isDragging) {
              b2.x += nx * overlap * m2Ratio;
              b2.y += ny * overlap * m2Ratio;
            }

            // Impulse calculation
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const p = 2 * (nx * kx + ny * ky) / totalInvMass;
            const restitution = Math.min(b1.restitution, b2.restitution);

            if (!b1.pinned && !b1.isDragging) {
              b1.vx -= p * b1.invMass * nx * (1 + restitution) * 0.5;
              b1.vy -= p * b1.invMass * ny * (1 + restitution) * 0.5;
            }
            if (!b2.pinned && !b2.isDragging) {
              b2.vx += p * b2.invMass * nx * (1 + restitution) * 0.5;
              b2.vy += p * b2.invMass * ny * (1 + restitution) * 0.5;
            }
          }
        }
      }
    }
  }

  /**
   * "Tidal Sweep" Gesture: Pulls all bodies strongly toward equilibrium anchors
   */
  public triggerTidalSweep() {
    for (const body of this.bodies.values()) {
      if (body.pinned) continue;
      body.vx = (body.anchorX - body.x) * 0.25;
      body.vy = (body.anchorY - body.y) * 0.25;
      body.angularVelocity = -body.angle * 0.3;
    }
  }

  /**
   * Chronos Rewind: Records 60Hz physics snapshot
   */
  public recordSnapshot() {
    const snap: PhysicsSnapshot = {
      timestamp: Date.now(),
      bodies: Array.from(this.bodies.values()).map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        angle: b.angle,
        vx: b.vx,
        vy: b.vy,
        angularVelocity: b.angularVelocity,
      })),
    };
    this.historyBuffer.push(snap);
    if (this.historyBuffer.length > this.maxHistoryFrames) {
      this.historyBuffer.shift();
    }
  }

  /**
   * Chronos Rewind Execution: Rewinds simulation by ~2.5 seconds
   */
  public rewind(framesToRewind: number = 60) {
    if (this.historyBuffer.length < 5) return;
    const targetIdx = Math.max(0, this.historyBuffer.length - framesToRewind);
    const snap = this.historyBuffer[targetIdx];
    this.historyBuffer.splice(targetIdx);

    for (const bState of snap.bodies) {
      const body = this.bodies.get(bState.id);
      if (body && !body.pinned) {
        body.x = bState.x;
        body.y = bState.y;
        body.angle = bState.angle;
        body.vx = -bState.vx * 0.2; // reverse momentum
        body.vy = -bState.vy * 0.2;
        body.angularVelocity = -bState.angularVelocity * 0.2;
      }
    }
  }
}
