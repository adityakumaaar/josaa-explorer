export interface YearEligibility {
  eligible: boolean;
  closing_rank: number | null;
  round: number;
}

export interface SearchResult {
  institute: string;
  institute_type: string;
  program: string;
  quota: string;
  seat_type: string;
  gender: string;
  confidence_score: number;
  latest_closing_rank: number | null;
  year_eligibility: Record<string, YearEligibility>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  rank_used: number;
  category: string;
}

export interface SearchParams {
  rank: number;
  category: string;
  gender: string;
  home_state: string;
  pwd: boolean;
  institute_types?: string[];
  program_query?: string;
  round_no?: number;
  years?: number[];
}
