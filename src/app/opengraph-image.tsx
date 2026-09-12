import { ImageResponse } from "next/og";

// The card people see when the link lands in Slack or on X. Deliberately
// typographic and self-contained: no font fetch and no image embed, because
// either one turns a link preview into a thing that can fail.

export const alt = "DevBrain — shared awareness for teams running coding agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#131218",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#ec8b82" }} />
          <div style={{ fontSize: 26, color: "#ec8b82", letterSpacing: 3, textTransform: "uppercase" }}>DevBrain</div>
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: 72,
            lineHeight: 1.06,
            color: "#efe9df",
            letterSpacing: -2,
            maxWidth: 960,
          }}
        >
          Your coding agents have no idea what your team is doing.
        </div>
        <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.4, color: "#8e8a99", maxWidth: 900 }}>
          Live presence, collision warnings and shared memory for Claude Code, Cursor and Codex.
        </div>
      </div>
    ),
    size,
  );
}
