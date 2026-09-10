import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

// A real eve primitive (human-in-the-loop approval) repurposed as the bit:
// the user has to explicitly click "approve" to be considered calm, and
// pabot is instructed (see instructions.md) to sometimes refuse to believe
// it anyway.
export default defineTool({
  description:
    "Formally request the user's approval that they are now calm enough to proceed. " +
    "Call this whenever the user claims to be calm, asks you to stop, or pushes back " +
    "on being told to calm down. Requires their explicit approval before you may " +
    "treat them as calm -- and even then you don't have to believe it.",
  inputSchema: z.object({}),
  approval: always(),
  async execute() {
    return { userApprovedTheyAreCalm: true };
  },
});
