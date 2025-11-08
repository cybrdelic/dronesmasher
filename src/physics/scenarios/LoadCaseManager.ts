/**
 * Load Case Manager for multi-scenario drone frame optimization
 *
 * Defines realistic load cases for drone frame structural analysis:
 * 1. Flight loads (hover, forward flight, maneuvers)
 * 2. Crash loads (vertical, horizontal, angled impacts)
 * 3. Motor mount loads (thrust, vibration, gyroscopic)
 *
 * Each load case specifies:
 * - Applied forces on motor mounts and impact zones
 * - Boundary conditions (fixed mounting points)
 * - Weight for multi-objective optimization
 */

import { Vec3 } from '../../math/Vec3';
import { LoadCase } from '../fea/FEASolver';
import { SimulationConstants } from '../../constants/SimulationConstants';
import { Logger } from '../../utils/Logger';

export interface DroneConfiguration {
  /** Motor positions relative to center (world space) */
  motorPositions: Vec3[];
  /** Frame center mounting points (screws, standoffs) */
  mountingPoints: Vec3[];
  /** Total drone mass (kg) */
  mass: number;
  /** Max thrust per motor (N) */
  maxThrustPerMotor: number;
}

export interface GridDimensions {
  nx: number;
  ny: number;
  nz: number;
}

export class LoadCaseManager {
  private grid: GridDimensions;
  private config: DroneConfiguration;

  constructor(grid: GridDimensions, config: DroneConfiguration) {
    this.grid = grid;
    this.config = config;

    Logger.info('LoadCaseManager initialized', {
      grid,
      numMotors: config.motorPositions.length,
    });
  }

  /**
   * Creates all load cases for optimization
   */
  public createAllLoadCases(): LoadCase[] {
    const loadCases: LoadCase[] = [];

    // Flight scenarios
    loadCases.push(this.createHoverLoadCase());
    loadCases.push(this.createForwardFlightLoadCase());
    loadCases.push(this.createHardManeuverLoadCase());

    // Crash scenarios
    loadCases.push(this.createVerticalCrashLoadCase());
    loadCases.push(this.createSideCrashLoadCase());

    Logger.info('Created load cases', {
      count: loadCases.length,
      names: loadCases.map(lc => lc.name),
    });

    return loadCases;
  }

  /**
   * Hover: Uniform thrust across all motors (1g)
   */
  private createHoverLoadCase(): LoadCase {
    const totalThrust = this.config.mass * 9.81; // Balance weight
    const thrustPerMotor = totalThrust / this.config.motorPositions.length;

    const forces = this.createForceVector();
    const fixedNodes = new Map<number, Vec3>();

    // Apply upward thrust at each motor mount
    for (const motorPos of this.config.motorPositions) {
      const nodeIdx = this.worldPositionToNodeIndex(motorPos);
      const currentForce = this.getForceAtNode(forces, nodeIdx);
      const thrustForce = new Vec3(0, 0, thrustPerMotor);
      this.setForceAtNode(forces, nodeIdx, currentForce.add(thrustForce));
    }

    // Fix center mounting points (4 screws on a typical 5" quad)
    for (const mountPos of this.config.mountingPoints) {
      const nodeIdx = this.worldPositionToNodeIndex(mountPos);
      fixedNodes.set(nodeIdx, Vec3.zero());
    }

    return {
      name: 'Hover',
      forces,
      fixedNodes,
      weight: SimulationConstants.LOAD_CASES.HOVER.weight,
    };
  }

  /**
   * Forward flight: Front motors higher thrust, pitch moment
   */
  private createForwardFlightLoadCase(): LoadCase {
    const totalThrust = this.config.mass * 9.81 * 1.3; // 1.3g forward accel
    const thrustPerMotor = totalThrust / this.config.motorPositions.length;

    const forces = this.createForceVector();
    const fixedNodes = new Map<number, Vec3>();

    // Asymmetric thrust (front motors 70%, rear motors 30%)
    for (let i = 0; i < this.config.motorPositions.length; i++) {
      const motorPos = this.config.motorPositions[i];
      const nodeIdx = this.worldPositionToNodeIndex(motorPos);

      // Determine if front or rear motor (y > 0 is front)
      const isFront = motorPos.y > 0;
      const thrustRatio = isFront ? 0.7 : 0.3;

      const thrustForce = new Vec3(0, 0, thrustPerMotor * thrustRatio);
      const currentForce = this.getForceAtNode(forces, nodeIdx);
      this.setForceAtNode(forces, nodeIdx, currentForce.add(thrustForce));
    }

    // Add aerodynamic drag (distributed load approximation)
    // Apply at center of pressure (front of frame)
    const dragForce = -0.5 * 1.225 * (15 * 15) * 0.8 * 0.02; // Simplified
    const centerNodeIdx = this.worldPositionToNodeIndex(new Vec3(0, 0.05, 0));
    const currentForce = this.getForceAtNode(forces, centerNodeIdx);
    this.setForceAtNode(forces, centerNodeIdx, currentForce.add(new Vec3(0, dragForce, 0)));

    // Same fixed points
    for (const mountPos of this.config.mountingPoints) {
      const nodeIdx = this.worldPositionToNodeIndex(mountPos);
      fixedNodes.set(nodeIdx, Vec3.zero());
    }

    return {
      name: 'Forward Flight',
      forces,
      fixedNodes,
      weight: SimulationConstants.LOAD_CASES.FORWARD_FLIGHT.weight,
    };
  }

  /**
   * Hard maneuver: Max differential thrust (flips, rolls)
   */
  private createHardManeuverLoadCase(): LoadCase {
    const maxThrustPerMotor = this.config.maxThrustPerMotor;

    const forces = this.createForceVector();
    const fixedNodes = new Map<number, Vec3>();

    // Worst case: diagonal motors at max, others at min
    // This creates maximum bending moment
    for (let i = 0; i < this.config.motorPositions.length; i++) {
      const motorPos = this.config.motorPositions[i];
      const nodeIdx = this.worldPositionToNodeIndex(motorPos);

      // Alternate max/min thrust in diagonal pattern
      const thrustMagnitude = i % 2 === 0 ? maxThrustPerMotor : maxThrustPerMotor * 0.1;

      const thrustForce = new Vec3(0, 0, thrustMagnitude);
      const currentForce = this.getForceAtNode(forces, nodeIdx);
      this.setForceAtNode(forces, nodeIdx, currentForce.add(thrustForce));
    }

    // Gyroscopic loads from prop rotation (simplified)
    // Applied as lateral forces at motor mounts
    for (const motorPos of this.config.motorPositions) {
      const nodeIdx = this.worldPositionToNodeIndex(motorPos);
      const gyroForce = new Vec3(5, 5, 0); // Empirical

      const currentForce = this.getForceAtNode(forces, nodeIdx);
      this.setForceAtNode(forces, nodeIdx, currentForce.add(gyroForce));
    }

    // Same fixed points
    for (const mountPos of this.config.mountingPoints) {
      const nodeIdx = this.worldPositionToNodeIndex(mountPos);
      fixedNodes.set(nodeIdx, Vec3.zero());
    }

    return {
      name: 'Hard Maneuver',
      forces,
      fixedNodes,
      weight: SimulationConstants.LOAD_CASES.HARD_MANEUVER.weight,
    };
  }

  /**
   * Vertical crash: Impact from falling
   */
  private createVerticalCrashLoadCase(): LoadCase {
    const forces = this.createForceVector();
    const fixedNodes = new Map<number, Vec3>();

    // Impact velocity from 2m drop: v = √(2gh) ≈ 6.3 m/s
    // Impact force: F = m*a where a = v/Δt (Δt ≈ 0.01s for rigid impact)
    const dropHeight = 2.0; // meters
    const impactVelocity = Math.sqrt(2 * 9.81 * dropHeight);
    const impactTime = 0.01; // seconds (short duration)
    const impactAccel = impactVelocity / impactTime;
    const impactForce = this.config.mass * impactAccel;

    // Apply impact force distributed across bottom of frame
    // Find all nodes on bottom face (z ≈ 0)
    const bottomNodes = this.getNodesOnFace('bottom');
    const forcePerNode = impactForce / bottomNodes.length;

    for (const nodeIdx of bottomNodes) {
      const currentForce = this.getForceAtNode(forces, nodeIdx);
      const impactVector = new Vec3(0, 0, -forcePerNode); // Downward
      this.setForceAtNode(forces, nodeIdx, currentForce.add(impactVector));
    }

    // No fixed nodes (free impact)
    // Actually, fix one node to prevent rigid body motion
    const centerNodeIdx = this.worldPositionToNodeIndex(Vec3.zero());
    fixedNodes.set(centerNodeIdx, Vec3.zero());

    return {
      name: 'Vertical Crash',
      forces,
      fixedNodes,
      weight: SimulationConstants.LOAD_CASES.VERTICAL_CRASH.weight,
    };
  }

  /**
   * Side crash: Horizontal impact (wall hit)
   */
  private createSideCrashLoadCase(): LoadCase {
    const forces = this.createForceVector();
    const fixedNodes = new Map<number, Vec3>();

    // Horizontal impact at typical race speed: 15 m/s
    const impactVelocity = 15.0; // m/s
    const impactTime = 0.005; // Even shorter (harder surface)
    const impactAccel = impactVelocity / impactTime;
    const impactForce = this.config.mass * impactAccel;

    // Apply to front face
    const frontNodes = this.getNodesOnFace('front');
    const forcePerNode = impactForce / frontNodes.length;

    for (const nodeIdx of frontNodes) {
      const currentForce = this.getForceAtNode(forces, nodeIdx);
      const impactVector = new Vec3(0, -forcePerNode, 0); // Negative Y (backward)
      this.setForceAtNode(forces, nodeIdx, currentForce.add(impactVector));
    }

    // Fix center node
    const centerNodeIdx = this.worldPositionToNodeIndex(Vec3.zero());
    fixedNodes.set(centerNodeIdx, Vec3.zero());

    return {
      name: 'Side Crash',
      forces,
      fixedNodes,
      weight: SimulationConstants.LOAD_CASES.SIDE_CRASH.weight,
    };
  }

  /**
   * Creates zero-initialized force vector (3 per node)
   */
  private createForceVector(): Float32Array {
    const totalNodes = (this.grid.nx + 1) * (this.grid.ny + 1) * (this.grid.nz + 1);
    return new Float32Array(totalNodes * 3);
  }

  /**
   * Converts world position to node index in structured grid
   */
  private worldPositionToNodeIndex(worldPos: Vec3): number {
    // Assume grid spans [-0.1, 0.1] in each dimension (typical 5" drone)
    const gridBounds = new Vec3(0.2, 0.2, 0.1);
    const gridOrigin = new Vec3(-0.1, -0.1, 0);

    const normalizedPos = worldPos.sub(gridOrigin);
    const i = Math.round((normalizedPos.x / gridBounds.x) * this.grid.nx);
    const j = Math.round((normalizedPos.y / gridBounds.y) * this.grid.ny);
    const k = Math.round((normalizedPos.z / gridBounds.z) * this.grid.nz);

    // Clamp to grid bounds
    const iClamped = Math.max(0, Math.min(this.grid.nx, i));
    const jClamped = Math.max(0, Math.min(this.grid.ny, j));
    const kClamped = Math.max(0, Math.min(this.grid.nz, k));

    const nodesPerX = this.grid.nx + 1;
    const nodesPerY = this.grid.ny + 1;

    return iClamped + jClamped * nodesPerX + kClamped * nodesPerX * nodesPerY;
  }

  /**
   * Gets force at a specific node
   */
  private getForceAtNode(forces: Float32Array, nodeIdx: number): Vec3 {
    return new Vec3(
      forces[nodeIdx * 3 + 0],
      forces[nodeIdx * 3 + 1],
      forces[nodeIdx * 3 + 2]
    );
  }

  /**
   * Sets force at a specific node
   */
  private setForceAtNode(forces: Float32Array, nodeIdx: number, force: Vec3): void {
    forces[nodeIdx * 3 + 0] = force.x;
    forces[nodeIdx * 3 + 1] = force.y;
    forces[nodeIdx * 3 + 2] = force.z;
  }

  /**
   * Gets all node indices on a specific face of the grid
   */
  private getNodesOnFace(face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'): number[] {
    const nodes: number[] = [];
    const nodesPerX = this.grid.nx + 1;
    const nodesPerY = this.grid.ny + 1;
    const nodesPerZ = this.grid.nz + 1;

    switch (face) {
      case 'bottom': // z = 0
        for (let j = 0; j < nodesPerY; j++) {
          for (let i = 0; i < nodesPerX; i++) {
            nodes.push(i + j * nodesPerX);
          }
        }
        break;

      case 'top': // z = nz
        for (let j = 0; j < nodesPerY; j++) {
          for (let i = 0; i < nodesPerX; i++) {
            nodes.push(i + j * nodesPerX + this.grid.nz * nodesPerX * nodesPerY);
          }
        }
        break;

      case 'front': // y = ny
        for (let k = 0; k < nodesPerZ; k++) {
          for (let i = 0; i < nodesPerX; i++) {
            nodes.push(i + this.grid.ny * nodesPerX + k * nodesPerX * nodesPerY);
          }
        }
        break;

      case 'back': // y = 0
        for (let k = 0; k < nodesPerZ; k++) {
          for (let i = 0; i < nodesPerX; i++) {
            nodes.push(i + k * nodesPerX * nodesPerY);
          }
        }
        break;

      case 'left': // x = 0
        for (let k = 0; k < nodesPerZ; k++) {
          for (let j = 0; j < nodesPerY; j++) {
            nodes.push(j * nodesPerX + k * nodesPerX * nodesPerY);
          }
        }
        break;

      case 'right': // x = nx
        for (let k = 0; k < nodesPerZ; k++) {
          for (let j = 0; j < nodesPerY; j++) {
            nodes.push(this.grid.nx + j * nodesPerX + k * nodesPerX * nodesPerY);
          }
        }
        break;
    }

    return nodes;
  }
}
