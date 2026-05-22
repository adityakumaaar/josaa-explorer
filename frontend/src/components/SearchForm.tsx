import { useState, useRef } from "react";
import { CATEGORIES, INDIAN_STATES, INSTITUTE_TYPES } from "../lib/constants";
import type { SearchParams } from "../lib/types";

const ROUNDS = [1, 2, 3, 4, 5, 6, 7];
const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019];

interface Props {
  onSearch: (params: SearchParams) => void;
  loading: boolean;
  initialParams?: SearchParams | null;
}

export default function SearchForm({ onSearch, loading, initialParams }: Props) {
  const [rank, setRank] = useState(initialParams?.rank?.toString() ?? "");
  const [category, setCategory] = useState(initialParams?.category ?? "General");
  const [gender, setGender] = useState(initialParams?.gender ?? "Male");
  const [homeState, setHomeState] = useState(initialParams?.home_state ?? "");
  const [pwd, setPwd] = useState(initialParams?.pwd ?? false);
  const [instTypes, setInstTypes] = useState<string[]>(initialParams?.institute_types ?? []);
  const [programQuery, setProgramQuery] = useState(initialParams?.program_query ?? "");
  const [roundNo, setRoundNo] = useState<number | "">(initialParams?.round_no ?? "");
  const [selectedYears, setSelectedYears] = useState<number[]>(initialParams?.years ?? []);
  const [stateOpen, setStateOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState("");
  const stateRef = useRef<HTMLDivElement>(null);

  const filteredStates = INDIAN_STATES.filter((s) =>
    s.toLowerCase().includes(stateFilter.toLowerCase())
  );

  const toggleInstType = (t: string) => {
    setInstTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const toggleYear = (y: number) => {
    setSelectedYears((prev) =>
      prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rank || !homeState) return;
    onSearch({
      rank: parseInt(rank, 10),
      category,
      gender,
      home_state: homeState,
      pwd,
      institute_types: instTypes.length > 0 ? instTypes : undefined,
      program_query: programQuery || undefined,
      round_no: roundNo ? roundNo : undefined,
      years: selectedYears.length > 0 ? selectedYears : undefined,
    });
  };

  const rankLabel =
    category === "General"
      ? "CRL (Common Rank List) rank"
      : `${category} category rank`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Rank */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {rankLabel}
        </label>
        <input
          type="number"
          min={1}
          value={rank}
          onChange={(e) => setRank(e.target.value)}
          placeholder="e.g. 5000"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                     outline-none transition"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Category
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition
                ${
                  category === c
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Gender + PwD */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Gender
          </label>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(["Male", "Female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition
                  ${
                    gender === g
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={pwd}
            onChange={(e) => setPwd(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">PwD</span>
        </label>
      </div>

      {/* Home State */}
      <div ref={stateRef} className="relative">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Home State
        </label>
        <input
          type="text"
          value={stateOpen ? stateFilter : homeState}
          onChange={(e) => {
            setStateFilter(e.target.value);
            if (!stateOpen) setStateOpen(true);
          }}
          onFocus={() => {
            setStateOpen(true);
            setStateFilter("");
          }}
          onBlur={() => setTimeout(() => setStateOpen(false), 150)}
          placeholder="Search your state..."
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                     outline-none transition"
        />
        {stateOpen && (
          <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-lg border
                         border-gray-200 bg-white shadow-lg">
            {filteredStates.map((s) => (
              <li
                key={s}
                onMouseDown={() => {
                  setHomeState(s);
                  setStateOpen(false);
                }}
                className={`px-3 py-1.5 cursor-pointer text-sm hover:bg-blue-50
                  ${homeState === s ? "bg-blue-50 font-medium" : ""}`}
              >
                {s}
              </li>
            ))}
            {filteredStates.length === 0 && (
              <li className="px-3 py-1.5 text-sm text-gray-400">No match</li>
            )}
          </ul>
        )}
      </div>

      {/* Round selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Round
          <span className="text-gray-400 font-normal ml-1">(defaults to last)</span>
        </label>
        <select
          value={roundNo}
          onChange={(e) =>
            setRoundNo(e.target.value ? parseInt(e.target.value, 10) : "")
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                     outline-none transition bg-white"
        >
          <option value="">Last available round</option>
          {ROUNDS.map((r) => (
            <option key={r} value={r}>
              Round {r}
            </option>
          ))}
        </select>
      </div>

      {/* Year selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Years
          <span className="text-gray-400 font-normal ml-1">
            {selectedYears.length === 0
              ? "(all selected)"
              : `(${selectedYears.length} of ${YEARS.length})`}
          </span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {YEARS.map((y) => {
            const active =
              selectedYears.length === 0 || selectedYears.includes(y);
            return (
              <button
                key={y}
                type="button"
                onClick={() => toggleYear(y)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition border
                  ${
                    selectedYears.length === 0
                      ? "border-gray-900 bg-gray-900 text-white"
                      : active
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-400 hover:border-gray-400"
                  }`}
              >
                {y}
              </button>
            );
          })}
        </div>
        {selectedYears.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedYears([])}
            className="mt-1.5 text-[11px] text-blue-600 hover:underline"
          >
            Reset to all years
          </button>
        )}
      </div>

      {/* Institute type chips */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Institute Type
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {INSTITUTE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleInstType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition border
                ${
                  instTypes.includes(t)
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Program filter */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Program
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          type="text"
          value={programQuery}
          onChange={(e) => setProgramQuery(e.target.value)}
          placeholder="e.g. Computer Science"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:border-blue-500 focus:ring-2 focus:ring-blue-200
                     outline-none transition"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !rank || !homeState}
        className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm
                   hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                   transition"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching...
          </span>
        ) : (
          "Find Colleges"
        )}
      </button>
    </form>
  );
}
