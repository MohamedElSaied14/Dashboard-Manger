import { extractJsonObject } from "./json-extract.util";
import { parseExtractedGuidelines } from "./guidelines-extraction.util";

describe("extractJsonObject", () => {
  it("parses a plain JSON object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    const text = "Sure, here you go:\n```json\n{\"a\":1}\n```\nHope that helps!";
    expect(extractJsonObject(text)).toEqual({ a: 1 });
  });

  it("pulls a JSON object out of surrounding prose", () => {
    const text = 'Here is the result: {"a":1,"b":[1,2,3]} - let me know if you need changes.';
    expect(extractJsonObject(text)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("throws on unparseable text", () => {
    expect(() => extractJsonObject("not json at all")).toThrow();
  });
});

describe("parseExtractedGuidelines", () => {
  it("maps a well-formed model response straight through", () => {
    const response = JSON.stringify({
      guidelines: {
        orientation: "portrait",
        dimensions: { width: 1080, height: 1350, aspectRatio: "4:5", tolerancePx: 2 },
        colorRules: {
          mode: "black-white",
          allowedColors: ["#000000", "#FFFFFF"],
          allowGrayscale: true,
        },
        header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
        footer: {
          required: true,
          phone: "000-555-000",
          socialHandle: "@MediaDose",
          separatorRequired: true,
        },
        notes: ["Logo must appear only once."],
      },
      extractionNotes: ["Assumed Instagram Portrait Post preset from the description."],
    });

    const { guidelines, notes } = parseExtractedGuidelines(response);

    expect(guidelines.orientation).toBe("portrait");
    expect(guidelines.dimensions.width).toBe(1080);
    expect(guidelines.dimensions.height).toBe(1350);
    expect(guidelines.colorRules.mode).toBe("black-white");
    expect(guidelines.header.logoPosition).toBe("top-right");
    expect(guidelines.footer.phone).toBe("000-555-000");
    expect(guidelines.footer.socialHandle).toBe("@MediaDose");
    expect(notes).toContain("Assumed Instagram Portrait Post preset from the description.");
  });

  it("falls back to safe defaults for malformed/missing fields instead of throwing", () => {
    const response = JSON.stringify({
      guidelines: {
        orientation: "sideways", // invalid -> should default to portrait
        colorRules: { mode: "rainbow" }, // invalid -> should default to custom
      },
    });

    const { guidelines } = parseExtractedGuidelines(response);

    expect(guidelines.orientation).toBe("portrait");
    expect(guidelines.dimensions.width).toBe(1080);
    expect(guidelines.dimensions.height).toBe(1350);
    expect(guidelines.colorRules.mode).toBe("custom");
    expect(guidelines.header.logoPosition).toBe("top-right");
    expect(guidelines.footer.required).toBe(true);
  });

  it("throws when the response has no 'guidelines' object at all", () => {
    expect(() => parseExtractedGuidelines(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("preserves approved logo references and exact contact placement rules", () => {
    const response = JSON.stringify({
      guidelines: {
        logoAssets: [{
          id: "logo-primary",
          name: "Primary logo",
          variant: "primary",
          imageUrl: "https://cdn.example.com/logo.png",
          required: true,
          expectedPosition: "top-right",
        }],
        contactDetails: [{
          id: "hotline",
          label: "Hotline",
          type: "hotline",
          value: "19123",
          required: true,
          expectedPosition: "bottom-left",
          exactMatch: true,
        }],
        orientation: "portrait",
        dimensions: { width: 1080, height: 1350, aspectRatio: "4:5" },
        colorRules: { mode: "brand-colors", allowedColors: [], allowGrayscale: true },
        header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
        footer: { required: true, separatorRequired: false },
      },
    });

    const { guidelines } = parseExtractedGuidelines(response);
    expect(guidelines.logoAssets?.[0].imageUrl).toContain("logo.png");
    expect(guidelines.logoAssets?.[0].expectedPosition).toBe("top-right");
    expect(guidelines.contactDetails?.[0].value).toBe("19123");
    expect(guidelines.contactDetails?.[0].expectedPosition).toBe("bottom-left");
  });

  it("handles the Arabic worked example: Instagram-post size, top-right logo, footer phone+handle, monochrome only", () => {
    // Simulates what the model should produce for a brief like:
    // "designs sized like an Instagram post, logo top-right, footer phone left / @MediaDose right, black & white only"
    const response = JSON.stringify({
      guidelines: {
        orientation: "portrait",
        dimensions: { width: 1080, height: 1350, aspectRatio: "4:5" },
        colorRules: { mode: "black-white", allowedColors: ["#000000", "#FFFFFF"], allowGrayscale: true },
        header: { logoRequired: true, logoPosition: "top-right", logoRepeatedAllowed: false },
        footer: {
          required: true,
          phone: "000-555-000",
          socialHandle: "@MediaDose",
          separatorRequired: true,
        },
        notes: ["Logo appears only once, not repeated in the footer."],
      },
      extractionNotes: [],
    });

    const { guidelines } = parseExtractedGuidelines(response);
    expect(guidelines.dimensions.aspectRatio).toBe("4:5");
    expect(guidelines.header.logoPosition).toBe("top-right");
    expect(guidelines.footer.phone).toBe("000-555-000");
    expect(guidelines.footer.socialHandle).toBe("@MediaDose");
    expect(guidelines.colorRules.allowedColors).toEqual(["#000000", "#FFFFFF"]);
  });
});
