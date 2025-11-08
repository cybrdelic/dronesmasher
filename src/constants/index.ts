/**
 * Central exports for all constants
 */

export { SimulationConstants } from './SimulationConstants';
export type { SimulationConstantsType } from './SimulationConstants';

export { Units } from './Units';
export type {
  Meters, Millimeters, Radians, Degrees,
  Seconds, Milliseconds, Newtons, Pascals,
  Megapascals, Kilograms, KilogramsPerCubicMeter
} from './Units';

export { MaterialProperties, getMaterialProperty, getShearModulus, getBulkModulus } from './MaterialProperties';
export type { MaterialName, MaterialData } from './MaterialProperties';

export { BindingRegistry, generateBindingDeclaration, getBinding } from './BindingRegistry';
