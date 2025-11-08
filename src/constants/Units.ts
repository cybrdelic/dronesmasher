/**
 * Type-safe unit conversions
 * Prevents mixing meters and millimeters, radians and degrees, etc.
 */

// Branded types for compile-time unit safety
export type Meters = number & { __unit: "meters" };
export type Millimeters = number & { __unit: "millimeters" };
export type Radians = number & { __unit: "radians" };
export type Degrees = number & { __unit: "degrees" };
export type Seconds = number & { __unit: "seconds" };
export type Milliseconds = number & { __unit: "milliseconds" };
export type Newtons = number & { __unit: "newtons" };
export type Pascals = number & { __unit: "pascals" };
export type Megapascals = number & { __unit: "megapascals" };
export type Kilograms = number & { __unit: "kilograms" };
export type KilogramsPerCubicMeter = number & { __unit: "kg/m3" };

export const Units = {
  // Length conversions
  metersToMillimeters(m: Meters): Millimeters {
    return (m * 1000) as Millimeters;
  },

  millimetersToMeters(mm: Millimeters): Meters {
    return (mm / 1000) as Meters;
  },

  // Angle conversions
  degreesToRadians(deg: Degrees): Radians {
    return (deg * Math.PI / 180) as Radians;
  },

  radiansToDegrees(rad: Radians): Degrees {
    return (rad * 180 / Math.PI) as Degrees;
  },

  // Time conversions
  secondsToMilliseconds(s: Seconds): Milliseconds {
    return (s * 1000) as Milliseconds;
  },

  millisecondsToSeconds(ms: Milliseconds): Seconds {
    return (ms / 1000) as Seconds;
  },

  // Stress/pressure conversions
  pascalsToMegapascals(pa: Pascals): Megapascals {
    return (pa / 1e6) as Megapascals;
  },

  megapascalsToPascals(mpa: Megapascals): Pascals {
    return (mpa * 1e6) as Pascals;
  },

  // Constructors (unsafe but explicit)
  meters(value: number): Meters {
    return value as Meters;
  },

  millimeters(value: number): Millimeters {
    return value as Millimeters;
  },

  degrees(value: number): Degrees {
    return value as Degrees;
  },

  radians(value: number): Radians {
    return value as Radians;
  },

  seconds(value: number): Seconds {
    return value as Seconds;
  },

  milliseconds(value: number): Milliseconds {
    return value as Milliseconds;
  },

  newtons(value: number): Newtons {
    return value as Newtons;
  },

  pascals(value: number): Pascals {
    return value as Pascals;
  },

  megapascals(value: number): Megapascals {
    return value as Megapascals;
  },

  kilograms(value: number): Kilograms {
    return value as Kilograms;
  },

  kgPerM3(value: number): KilogramsPerCubicMeter {
    return value as KilogramsPerCubicMeter;
  }
};
