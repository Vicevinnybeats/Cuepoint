import { describe, it, expect } from "vitest";
import { pressCue } from "../src/cue.js";

describe("pressCue (CDJ mode)", () => {
  it("while playing, returns to the cue point and stops", () => {
    expect(pressCue(true, 90_000, 48_000)).toEqual({ kind: "return-and-stop", cuePoint: 48_000 });
  });

  it("paused on the cue point, previews from it without moving it", () => {
    expect(pressCue(false, 48_000, 48_000)).toEqual({
      kind: "preview",
      cuePoint: 48_000,
      cuePointChanged: false,
    });
  });

  it("paused elsewhere, sets a new cue point at the playhead", () => {
    expect(pressCue(false, 123_456, 48_000)).toEqual({
      kind: "preview",
      cuePoint: 123_456,
      cuePointChanged: true,
    });
  });

  it("treats sub-frame jitter as being on the cue point", () => {
    expect(pressCue(false, 48_000.4, 48_000)).toMatchObject({ cuePointChanged: false });
  });
});
