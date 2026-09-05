export const scoringConfig = {
  niche: {
    storeName: 32,
    description: 20,
    category: 8,
    postTitle: 18,
    postBody: 12,
    hashtagOrPoi: 10,
    strongEvidenceBonus: 8,
    weakEvidenceFloor: 10,
  },
  contact: {
    publicPhone: 40,
    officialXhs: 30,
    possibleOfficialXhs: 20,
    activeWithin30Days: 20,
    activeWithin90Days: 10,
    publicWechat: 10,
    otherBusinessContact: 10,
  },
  priority: {
    matchWeight: 0.6,
    contactWeight: 0.4,
  },
  matching: {
    acceptThreshold: 0.72,
    reviewThreshold: 0.5,
  },
} as const;
