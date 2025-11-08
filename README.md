# DroneSmasher

Physics-based drone frame topology optimization with crash simulation using WebGPU.

## Features

- **Multi-Scenario Topology Optimization**: Optimize frame geometry for flight loads AND crash scenarios simultaneously
- **Material-Aware Design**: Support for PLA, PETG, TPU, Carbon Fiber, and Nylon with accurate constitutive models
- **Crash Simulation**: MPM-based crash testing with brittle fracture, plastic deformation, and fragment generation
- **Photorealistic Rendering**: PBR materials with physically-accurate lighting
- **Real-Time Performance**: GPU-accelerated simulation using WebGPU compute shaders

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design and [PHYSICS_AND_RENDERING_REALISM.md](PHYSICS_AND_RENDERING_REALISM.md) for physics and rendering implementation details.

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Requirements

- Node.js >= 18
- Browser with WebGPU support (Chrome 113+, Edge 113+)

## Project Structure

```
src/
├── core/          # Core engine systems (WebGPU, resource management)
├── math/          # Math primitives (vectors, matrices, transforms)
├── spatial/       # Coordinate systems and camera
├── gpu/           # WebGPU abstractions
├── simulation/    # Physics simulation (FEA, MPM, optimization)
├── geometry/      # Geometry processing
├── rendering/     # Rendering systems
├── shaders/       # WGSL compute and rendering shaders
├── ui/            # React UI components
├── constants/     # Centralized constants and configuration
└── utils/         # Utilities
```

## Technology Stack

- **Simulation**: WebGPU compute shaders for FEA and MPM
- **Rendering**: WebGPU render pipelines with PBR materials
- **UI**: React + TypeScript
- **Build**: Vite
- **Testing**: Vitest

## License

MIT
