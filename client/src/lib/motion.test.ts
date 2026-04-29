import { describe, expect, it } from "vitest";

import { DURATION, EASE, resolveMotionIntensity } from "./motion";

describe("Round1 motion presets", () => {
  it("aligns runtime durations with CSS token values", () => {
    expect(DURATION.fast).toBe(0.15);
    expect(DURATION.normal).toBe(0.25);
    expect(DURATION.deliberate).toBe(0.6);
    expect(DURATION.ceremony).toBe(1.5);
  });

  it("keeps named easing curves available for V2 motion levels", () => {
    expect(EASE.standard).toEqual([0.4, 0, 0.2, 1]);
    expect(EASE.ceremony).toEqual([0.16, 1, 0.3, 1]);
  });

  it("reduces live and ceremony motion to subtle motion", () => {
    expect(resolveMotionIntensity("live", true)).toBe("subtle");
    expect(resolveMotionIntensity("ceremony", true)).toBe("subtle");
    expect(resolveMotionIntensity("none", true)).toBe("none");
  });
});
