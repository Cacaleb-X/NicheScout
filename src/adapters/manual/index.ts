import { readFile } from "node:fs/promises";
import type { BusinessDiscoveryAdapter, DiscoveryContext, RawBusinessRecord } from "../../models/types.ts";

export class ManualImportAdapter implements BusinessDiscoveryAdapter {
  name = "ManualImportAdapter";
  constructor(private readonly filePath: string) {}

  async discover(context: DiscoveryContext): Promise<RawBusinessRecord[]> {
    const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Array<Partial<RawBusinessRecord> & { storeName: string }>;
    return parsed.map((record, index) => ({
      externalId: record.externalId ?? `manual-${index + 1}`,
      source: "MANUAL",
      storeName: record.storeName,
      city: record.city ?? context.input.city,
      category: record.category ?? context.input.category,
      rawData: record,
      ...record,
    }));
  }
}
