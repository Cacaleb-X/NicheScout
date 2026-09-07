export interface SpikeCliOptions {
  headed: boolean;
  query?: string;
}

export function parseSpikeOptions(args: string[]): SpikeCliOptions {
  const headed = args.includes("--headed");
  const queryIndex = args.indexOf("--query");
  if (queryIndex === -1) return { headed };
  const query = args[queryIndex + 1]?.trim();
  if (!query || query.startsWith("--")) throw new Error("--query requires a non-empty value");
  return { headed, query };
}

export function validateSpikeOptions(options: SpikeCliOptions): void {
  if (options.headed && !options.query) throw new Error("--headed requires --query so one observable browser context can remain open");
}
