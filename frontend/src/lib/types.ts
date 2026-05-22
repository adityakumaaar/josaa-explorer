export interface YearEligibility {
  eligible: boolean;
  closing_rank: number | null;
  round: number;
  earliest_round: number | null;
}

export interface SearchResult {
  institute: string;
  institute_type: string;
  state: string | null;
  program: string;
  quota: string;
  seat_type: string;
  gender: string;
  confidence_score: number;
  latest_opening_rank: number | null;
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
  crl_rank?: number;
  category: string;
  gender: string;
  home_state: string;
  pwd: boolean;
  institute_types?: string[];
  program_query?: string;
  branch_keywords?: string[];
  college_states?: string[];
  round_no?: number;
  years?: number[];
}
