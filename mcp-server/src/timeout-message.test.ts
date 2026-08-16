import { describe, it, expect } from "vitest";
import { buildTimeoutMessage } from "./timeout-message.ts";

describe("buildTimeoutMessage", () => {
  it("tells the caller an Execute Operation is still writing, and not to call it again blind", () => {
    const msg = buildTimeoutMessage("tidy_ds_template_run", "execute", 120_000);

    expect(msg).toContain("tidy_ds_template_run");
    expect(msg).toContain("120000ms");
    expect(msg).toMatch(/still (running|writing)/i);
    expect(msg).toMatch(/canvas/i);
    expect(msg).not.toMatch(/retry/i);
  });

  it("gives a Query Operation a plain failure, with no still-running warning", () => {
    const msg = buildTimeoutMessage("tidy_file_list_pages", "query", 30_000);

    expect(msg).toContain("tidy_file_list_pages");
    expect(msg).toContain("30000ms");
    expect(msg).not.toMatch(/still (running|writing)/i);
    expect(msg).not.toMatch(/canvas/i);
  });

  it("never implies anything was stopped, for either kind, because nothing was", () => {
    for (const kind of ["query", "execute"] as const) {
      const msg = buildTimeoutMessage("tidy_doc_build_page", kind, 30_000);

      expect(msg).not.toMatch(/cancel/i);
      expect(msg).not.toMatch(/stopp?ed/i);
      expect(msg).not.toMatch(/aborted|abandoned|killed|terminated/i);
    }
  });

  it("keeps the unfocused-Figma-window explanation, which causes these timeouts either way", () => {
    for (const kind of ["query", "execute"] as const) {
      const msg = buildTimeoutMessage("tidy_qa_build_checklist", kind, 30_000);

      expect(msg).toMatch(/foreground|focused/i);
      expect(msg).toMatch(/Figma/);
    }
  });
});
