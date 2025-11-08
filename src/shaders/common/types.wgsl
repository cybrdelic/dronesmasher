// Common WGSL type definitions

struct Camera {
    view_matrix: mat4x4f,
    proj_matrix: mat4x4f,
    view_proj_matrix: mat4x4f,
    position: vec3f,
    _padding: f32,
}

struct GridInfo {
    resolution: vec3u,
    _padding1: u32,
    origin: vec3f,
    _padding2: f32,
    cell_size: f32,
    _padding3: vec3f,
}

struct TimeInfo {
    elapsed: f32,
    delta: f32,
    frame: u32,
    _padding: f32,
}

// Coordinate space transformations
fn world_to_view(world_pos: vec3f, camera: Camera) -> vec3f {
    let view_pos = camera.view_matrix * vec4f(world_pos, 1.0);
    return view_pos.xyz;
}

fn view_to_clip(view_pos: vec3f, camera: Camera) -> vec4f {
    return camera.proj_matrix * vec4f(view_pos, 1.0);
}

fn world_to_clip(world_pos: vec3f, camera: Camera) -> vec4f {
    return camera.view_proj_matrix * vec4f(world_pos, 1.0);
}

// Grid coordinate conversions
fn world_to_grid(world_pos: vec3f, grid: GridInfo) -> vec3i {
    let local = (world_pos - grid.origin) / grid.cell_size;
    return vec3i(floor(local));
}

fn grid_to_world(grid_pos: vec3i, grid: GridInfo) -> vec3f {
    return grid.origin + vec3f(grid_pos) * grid.cell_size;
}

fn is_valid_grid_pos(grid_pos: vec3i, grid: GridInfo) -> bool {
    return all(grid_pos >= vec3i(0)) && all(grid_pos < vec3i(grid.resolution));
}
