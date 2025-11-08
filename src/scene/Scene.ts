/**
 * Scene - Root of the scene graph
 * Manages all scene nodes and provides query methods
 */

import { SceneNode } from './SceneNode';
import { MeshNode } from './MeshNode';

export class Scene extends SceneNode {
  private selectedNode: SceneNode | null = null;

  constructor(name: string = 'Scene') {
    super(name);
  }

  update(deltaTime: number): void {
    // Update all children
    for (const child of this.children) {
      child.update(deltaTime);
    }
  }

  render(context: any): void {
    // Render all visible children
    for (const child of this.children) {
      if (child.visible) {
        child.render(context);
      }
    }
  }

  // Selection management
  selectNode(node: SceneNode | null): void {
    if (this.selectedNode && this.selectedNode instanceof MeshNode) {
      this.selectedNode.selected = false;
    }

    this.selectedNode = node;

    if (node && node instanceof MeshNode) {
      node.selected = true;
    }
  }

  getSelectedNode(): SceneNode | null {
    return this.selectedNode;
  }

  // Query methods
  getAllMeshNodes(): MeshNode[] {
    const meshes: MeshNode[] = [];
    this.traverse((node) => {
      if (node instanceof MeshNode) {
        meshes.push(node);
      }
    });
    return meshes;
  }

  // Ray picking (for mouse selection)
  pickNode(rayOrigin: any, rayDirection: any): SceneNode | null {
    // TODO: Implement ray-mesh intersection
    // For now, return null
    return null;
  }
}
