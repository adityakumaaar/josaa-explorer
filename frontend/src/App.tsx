import { useState, useEffect, useRef, useCallback } from "react";
import SearchForm from "./components/SearchForm";
import ResultsTable from "./components/ResultsTable";
import { useSearch } from "./hooks/useSearch";
import { encodeSearchParams, decodeSearchParams } from "./lib/urlParams";
import { API_BASE } from "./lib/api";
import type { SearchParams } from "./lib/types";

function App() {
  const { data, loading, error, search } = useSearch();
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [copied, setCopied] = useState(false);
  const [lastParams, setLastParams] = useState<SearchParams | null>(null);
  const initialParams = useRef(decodeSearchParams(window.location.search));
  const autoSearched = useRef(false);

  const handleSearch = useCallback(
    (params: SearchParams) => {
      setLastParams(params);
      const qs = encodeSearchParams(params);
      window.history.replaceState(null, "", `?${qs}`);
      search(params);
      if (window.innerWidth < 1024) setSidebarOpen(false);
    },
    [search],
  );

  useEffect(() => {
    if (initialParams.current && !autoSearched.current) {
      autoSearched.current = true;
      handleSearch(initialParams.current);
    }
  }, [handleSearch]);

  const handleShare = async () => {
    if (!lastParams) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
    fetch(`${API_BASE}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        rank: lastParams.rank,
        category: lastParams.category,
        gender: lastParams.gender,
        home_state: lastParams.home_state,
      }),
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 z-40 relative">
        <div className="px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              JoSAA Explorer
            </h1>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5 hidden sm:block">
              Find your best college based on JoSAA opening &amp; closing ranks
              (2019–2025)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Share button */}
            {data && lastParams && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300
                           text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                    </svg>
                    Share
                  </>
                )}
              </button>
            )}
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-lg border border-gray-300 text-gray-600 lg:hidden"
              aria-label="Toggle filters"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main: sidebar + content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            bg-white border-r border-gray-200 w-80 max-w-[85vw] shrink-0 overflow-y-auto
            transition-transform duration-200
            fixed top-0 left-0 h-full z-30 pt-[61px]
            lg:relative lg:pt-0 lg:z-10 lg:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="p-4 lg:p-5">
            <SearchForm
              onSearch={handleSearch}
              loading={loading}
              initialParams={initialParams.current}
            />
          </div>
        </aside>

        {/* Results area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Loading skeleton (first load) */}
          {loading && !data && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse"
                >
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-gray-100 rounded w-2/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Results (with loading overlay for re-searches) */}
          {data && (
            <div className={loading ? "opacity-50 pointer-events-none transition" : ""}>
              <ResultsTable data={data} searchParams={lastParams} />
            </div>
          )}

          {/* Empty state */}
          {!data && !loading && !error && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <svg
                  className="mx-auto mb-4 h-12 w-12 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
                  />
                </svg>
                <p className="text-lg font-medium text-gray-500">
                  Enter your details to find matching colleges
                </p>
                <p className="text-sm mt-1">
                  7 years of JoSAA data analyzed
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
