import type { ResearchDepth } from "./types.js";

export interface ResearchBudget {
  maxSources: number;
  durationMinutes: number;
  nextCheckAfterSeconds: number;
  queryLimit: number;
  searchResultsPerQuery: number;
  fetchesPerCycle: number;
}

const DEFAULTS: Record<ResearchDepth, ResearchBudget> = {
  standard: {
    maxSources: 80,
    durationMinutes: 10,
    nextCheckAfterSeconds: 60,
    queryLimit: 8,
    searchResultsPerQuery: 20,
    fetchesPerCycle: 8
  },
  deep: {
    maxSources: 250,
    durationMinutes: 25,
    nextCheckAfterSeconds: 60,
    queryLimit: 18,
    searchResultsPerQuery: 20,
    fetchesPerCycle: 12
  },
  exhaustive: {
    maxSources: 600,
    durationMinutes: 60,
    nextCheckAfterSeconds: 60,
    queryLimit: 36,
    searchResultsPerQuery: 20,
    fetchesPerCycle: 16
  }
};

export function budgetForDepth(depth: ResearchDepth): ResearchBudget {
  return { ...DEFAULTS[depth] };
}
