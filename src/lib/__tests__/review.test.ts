import { describe, expect, it } from "vitest";
import { deriveVerdict, type ReviewPoint } from "@/lib/review";

const risk: ReviewPoint = { kind: "risk", text: "off-by-one in the loop bound" };
const suggestion: ReviewPoint = { kind: "suggestion", text: "name reads as response, tracks assignment" };
const brain: ReviewPoint = { kind: "brain", text: "no .brain/ update rode along" };

describe("deriveVerdict", () => {
  it("suggestions alone never downgrade — the bug that made every verdict caution", () => {
    expect(deriveVerdict({ verdict: "caution" }, [suggestion, suggestion, suggestion])).toBe("looks_good");
    expect(deriveVerdict({ verdict: "looks_good" }, [])).toBe("looks_good");
  });

  it("a risk point forces at least caution, even if the model said looks_good", () => {
    expect(deriveVerdict({ verdict: "looks_good" }, [risk, suggestion])).toBe("caution");
  });

  it("a brain-rule point reaches the verdict (it is appended after the model answers)", () => {
    expect(deriveVerdict({ verdict: "looks_good" }, [brain])).toBe("caution");
  });

  it("severity stays the model's call", () => {
    expect(deriveVerdict({ verdict: "risky" }, [risk])).toBe("risky");
    expect(deriveVerdict({ verdict: "risky" }, [])).toBe("risky");
  });

  it("an unparseable response is an unknown, not a clean bill of health", () => {
    expect(deriveVerdict(null, [])).toBe("caution");
  });
});
