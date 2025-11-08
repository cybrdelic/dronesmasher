import { Vec3 } from '../math/Vec3';
import { Mat4 } from '../math/Mat4';
import { Space, SpatialVec3, SpaceTransform } from './CoordinateSpace';

export interface CameraOptions {
  fovDegrees?: number;
  near?: number;
  far?: number;
  aspect?: number;
}

export class Camera {
  private position: Vec3;
  private target: Vec3;
  private up: Vec3;

  private fovRad: number;
  private near: number;
  private far: number;
  private aspect: number;

  // Cached transforms
  private viewMatrix: Mat4;
  private projMatrix: Mat4;
  private viewProjMatrix: Mat4;
  private invViewMatrix: Mat4;
  private invProjMatrix: Mat4;

  private needsUpdate: boolean = true;

  constructor(options: CameraOptions = {}) {
    this.position = new Vec3(0, 2, 5);
    this.target = Vec3.zero();
    this.up = Vec3.up();

    this.fovRad = (options.fovDegrees ?? 45) * Math.PI / 180;
    this.near = options.near ?? 0.001;
    this.far = options.far ?? 10.0;
    this.aspect = options.aspect ?? 1.0;

    this.viewMatrix = Mat4.identity();
    this.projMatrix = Mat4.identity();
    this.viewProjMatrix = Mat4.identity();
    this.invViewMatrix = Mat4.identity();
    this.invProjMatrix = Mat4.identity();

    this.updateMatrices();
  }

  // Position and orientation
  lookAt(position: Vec3, target: Vec3, up?: Vec3) {
    this.position = position;
    this.target = target;
    this.up = up ?? Vec3.up();
    this.needsUpdate = true;
  }

  setPosition(pos: Vec3) {
    this.position = pos;
    this.needsUpdate = true;
  }

  setTarget(target: Vec3) {
    this.target = target;
    this.needsUpdate = true;
  }

  getPosition(): Vec3 {
    return this.position;
  }

  getTarget(): Vec3 {
    return this.target;
  }

  getForward(): Vec3 {
    return this.target.sub(this.position).normalize();
  }

  getRight(): Vec3 {
    return this.getForward().cross(this.up).normalize();
  }

  getUp(): Vec3 {
    return this.up;
  }

  // Projection parameters
  setPerspective(fovDegrees: number, aspect: number, near: number, far: number) {
    this.fovRad = fovDegrees * Math.PI / 180;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.needsUpdate = true;
  }

  setAspect(aspect: number) {
    this.aspect = aspect;
    this.needsUpdate = true;
  }

  getAspect(): number {
    return this.aspect;
  }

  getFovDegrees(): number {
    return this.fovRad * 180 / Math.PI;
  }

  getNear(): number {
    return this.near;
  }

  getFar(): number {
    return this.far;
  }

  // Matrix getters (auto-update if needed)
  getViewMatrix(): Mat4 {
    if (this.needsUpdate) this.updateMatrices();
    return this.viewMatrix;
  }

  getProjectionMatrix(): Mat4 {
    if (this.needsUpdate) this.updateMatrices();
    return this.projMatrix;
  }

  getViewProjectionMatrix(): Mat4 {
    if (this.needsUpdate) this.updateMatrices();
    return this.viewProjMatrix;
  }

  getInverseViewMatrix(): Mat4 {
    if (this.needsUpdate) this.updateMatrices();
    return this.invViewMatrix;
  }

  getInverseProjectionMatrix(): Mat4 {
    if (this.needsUpdate) this.updateMatrices();
    return this.invProjMatrix;
  }

  // Coordinate transforms
  worldToView(pos: SpatialVec3<Space.World>): SpatialVec3<Space.View> {
    const result = this.getViewMatrix().mulVec3(pos.toVec3());
    return new SpatialVec3(result.x, result.y, result.z, Space.View);
  }

  viewToWorld(pos: SpatialVec3<Space.View>): SpatialVec3<Space.World> {
    const result = this.getInverseViewMatrix().mulVec3(pos.toVec3());
    return new SpatialVec3(result.x, result.y, result.z, Space.World);
  }

  viewToClip(pos: SpatialVec3<Space.View>): SpatialVec3<Space.Clip> {
    const result = this.getProjectionMatrix().mulVec3(pos.toVec3());
    return new SpatialVec3(result.x, result.y, result.z, Space.Clip);
  }

  worldToClip(pos: SpatialVec3<Space.World>): SpatialVec3<Space.Clip> {
    const result = this.getViewProjectionMatrix().mulVec3(pos.toVec3());
    return new SpatialVec3(result.x, result.y, result.z, Space.Clip);
  }

  // Transform objects
  getWorldToViewTransform(): SpaceTransform<Space.World, Space.View> {
    return new SpaceTransform(this.getViewMatrix(), Space.World, Space.View);
  }

  getViewToClipTransform(): SpaceTransform<Space.View, Space.Clip> {
    return new SpaceTransform(this.getProjectionMatrix(), Space.View, Space.Clip);
  }

  getWorldToClipTransform(): SpaceTransform<Space.World, Space.Clip> {
    return new SpaceTransform(this.getViewProjectionMatrix(), Space.World, Space.Clip);
  }

  // Orbital controls
  orbit(deltaAzimuth: number, deltaElevation: number, distance?: number) {
    const dir = this.position.sub(this.target);
    const currentDistance = distance ?? dir.length();

    // Convert to spherical coordinates
    let phi = Math.atan2(dir.x, dir.z); // Azimuth
    let theta = Math.acos(dir.y / currentDistance); // Elevation from +Y

    // Apply deltas
    phi += deltaAzimuth;
    theta = Math.max(0.1, Math.min(Math.PI - 0.1, theta + deltaElevation));

    // Convert back to Cartesian
    const newPos = new Vec3(
      currentDistance * Math.sin(theta) * Math.sin(phi),
      currentDistance * Math.cos(theta),
      currentDistance * Math.sin(theta) * Math.cos(phi)
    );

    this.position = this.target.add(newPos);
    this.needsUpdate = true;
  }

  pan(deltaX: number, deltaY: number) {
    const right = this.getRight();
    const up = this.getUp();

    const offset = right.mul(deltaX).add(up.mul(deltaY));
    this.position = this.position.add(offset);
    this.target = this.target.add(offset);
    this.needsUpdate = true;
  }

  zoom(delta: number) {
    const dir = this.position.sub(this.target);
    const distance = dir.length();
    const newDistance = Math.max(0.1, distance * (1 + delta));

    this.position = this.target.add(dir.normalize().mul(newDistance));
    this.needsUpdate = true;
  }

  // Update matrices
  private updateMatrices() {
    // View matrix
    this.viewMatrix = Mat4.lookAt(this.position, this.target, this.up);

    // Projection matrix
    this.projMatrix = Mat4.perspective(this.fovRad, this.aspect, this.near, this.far);

    // Combined
    this.viewProjMatrix = this.projMatrix.mul(this.viewMatrix);

    // Inverses
    this.invViewMatrix = this.viewMatrix.inverse() ?? Mat4.identity();
    this.invProjMatrix = this.projMatrix.inverse() ?? Mat4.identity();

    this.needsUpdate = false;
  }

  // Utility
  toUniformData(): Float32Array {
    // Pack camera data for GPU uniform buffer
    const data = new Float32Array(48); // 3x mat4 (16 floats each)

    const view = this.getViewMatrix().toArray();
    const proj = this.getProjectionMatrix().toArray();
    const viewProj = this.getViewProjectionMatrix().toArray();

    data.set(view, 0);
    data.set(proj, 16);
    data.set(viewProj, 32);

    return data;
  }
}
