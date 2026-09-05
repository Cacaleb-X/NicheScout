import type { BusinessDiscoveryAdapter, DiscoveryContext, SocialSearchAdapter, SocialSearchResult } from "../../models/types.ts";
import { buildMockBusinesses, buildMockSocial } from "./mock-data.ts";

export class MockBusinessAdapter implements BusinessDiscoveryAdapter {
  name = "MockBusinessAdapter";
  async discover(context: DiscoveryContext) { return buildMockBusinesses(context); }
}

export class MockSocialAdapter implements SocialSearchAdapter {
  name = "MockSocialAdapter";
  async search(context: DiscoveryContext): Promise<SocialSearchResult> {
    return { ...buildMockSocial(context), status: "OK" };
  }
}
