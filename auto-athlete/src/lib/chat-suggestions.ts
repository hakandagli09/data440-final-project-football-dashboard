const STARTER_SUGGESTIONS = {
  general: [
    "How many players are on the roster?",
    "What was the team average total distance on the most recent session?",
    "Which players have sprint recency flags?",
  ],
  fatigue: [
    "Is anyone showing fatigue concerns right now?",
    "Who has the most flags on the roster?",
  ],
};

const FOLLOW_UP_SUGGESTIONS = {
  playerSpecific: [
    "Show me the profile for the player with the most flags.",
    "Who currently has readiness flags?",
  ],
  positionGroups: [
    "Compare Skills / Mids versus Bigs on the most recent session.",
    "What does the latest weekly position report show?",
  ],
};

export function getSuggestions(hasMessages: boolean): string[] {
  if (!hasMessages) {
    return [
      ...STARTER_SUGGESTIONS.general,
      ...STARTER_SUGGESTIONS.fatigue,
    ];
  }

  return [
    ...FOLLOW_UP_SUGGESTIONS.playerSpecific,
    ...FOLLOW_UP_SUGGESTIONS.positionGroups,
  ];
}
