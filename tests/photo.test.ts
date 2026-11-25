import { describe, expect, it } from "vitest";
import { PhotoRefused, preparePhoto } from "../src/photo";

/** Only the two properties the guard reads, so this runs without a DOM. */
function fakeFile(size: number, name = "photo.jpg"): File {
  return { name, size, type: "image/jpeg" } as unknown as File;
}

describe("what a photo has to be before it is stored", () => {
  it("refuses a file with no bytes", async () => {
    await expect(preparePhoto(fakeFile(0))).rejects.toBeInstanceOf(PhotoRefused);
  });

  it("refuses a photo it cannot decode and re-encode instead of keeping the original", async () => {
    await expect(preparePhoto(fakeFile(4096))).rejects.toBeInstanceOf(PhotoRefused);
  });

  it("says what to do next, because the item is still recorded", async () => {
    const error = (await preparePhoto(fakeFile(0)).catch((reason) => reason)) as Error;
    expect(error.message).toMatch(/no bytes/i);
    expect(error.message).toMatch(/again/i);
  });
});
