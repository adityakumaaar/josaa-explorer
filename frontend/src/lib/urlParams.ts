import type { SearchParams } from "./types";

export function encodeSearchParams(params: SearchParams): string {
  const p = new URLSearchParams();
  p.set("rank", String(params.rank));
  p.set("cat", params.category);
  p.set("gen", params.gender);
  p.set("state", params.home_state);
  if (params.pwd) p.set("pwd", "1");
  if (params.crl_rank) p.set("crl", String(params.crl_rank));
  if (params.round_no) p.set("round", String(params.round_no));
  if (params.years?.length) p.set("years", params.years.join(","));
  if (params.institute_types?.length)
    p.set("types", params.institute_types.join(","));
  if (params.program_query) p.set("prog", params.program_query);
  if (params.branch_keywords?.length)
    p.set("branches", params.branch_keywords.join(","));
  if (params.college_states?.length)
    p.set("cstates", params.college_states.join(","));
  if (params.min_rank) p.set("minR", String(params.min_rank));
  if (params.max_rank) p.set("maxR", String(params.max_rank));
  return p.toString();
}

export function decodeSearchParams(search: string): SearchParams | null {
  const p = new URLSearchParams(search);
  const rank = p.get("rank");
  const category = p.get("cat");
  const gender = p.get("gen");
  const homeState = p.get("state");

  if (!rank || !category || !gender || !homeState) return null;

  const parsed: SearchParams = {
    rank: parseInt(rank, 10),
    category,
    gender,
    home_state: homeState,
    pwd: p.get("pwd") === "1",
  };

  const crl = p.get("crl");
  if (crl) parsed.crl_rank = parseInt(crl, 10);

  const round = p.get("round");
  if (round) parsed.round_no = parseInt(round, 10);

  const years = p.get("years");
  if (years) parsed.years = years.split(",").map(Number);

  const types = p.get("types");
  if (types) parsed.institute_types = types.split(",");

  const prog = p.get("prog");
  if (prog) parsed.program_query = prog;

  const branches = p.get("branches");
  if (branches) parsed.branch_keywords = branches.split(",");

  const cstates = p.get("cstates");
  if (cstates) parsed.college_states = cstates.split(",");

  const minR = p.get("minR");
  if (minR) parsed.min_rank = parseInt(minR, 10);

  const maxR = p.get("maxR");
  if (maxR) parsed.max_rank = parseInt(maxR, 10);

  return parsed;
}
