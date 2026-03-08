import { createToolHandler } from "@/lib/tool-handler";
import { outboundSequenceBodySchema } from "@/lib/api-schemas/tools";

export const maxDuration = 300;

export const POST = createToolHandler("outbound-sequence", outboundSequenceBodySchema);
