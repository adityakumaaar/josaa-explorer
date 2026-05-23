"""Scrape Reddit posts and comments via old.reddit.com public JSON endpoints.

No API keys required. Uses the .json suffix on any old.reddit.com URL.
Rate-limited to ~40 req/min (1.5s between requests).
"""

import json
import time
from datetime import datetime, timezone, timedelta

import requests

ONE_YEAR_AGO_UTC = (datetime.now(timezone.utc) - timedelta(days=365)).timestamp()

USER_AGENT = "JoSAA-Explorer/1.0 (educational project; reddit sentiment scraper)"
BASE = "https://old.reddit.com"
REQUEST_DELAY = 1.5  # seconds between requests

# Tier 1: College-specific subreddits (NITs and IIITs only)
# Only colleges with known active subreddits are listed here.
# Colleges NOT in this map still get scraped via Tier 2 (general sub search).
INSTITUTE_SUBREDDITS: dict[str, str] = {
    # NITs
    "National Institute of Technology, Warangal": "nitw",
    "National Institute of Technology Calicut": "nitc",
    "National Institute of Technology, Rourkela": "nitr",
    "National Institute of Technology, Silchar": "nitsilchar",
    "National Institute of Technology, Jamshedpur": "nitjsr",
    "National Institute of Technology Durgapur": "nitdgp",
    "National Institute of Technology Patna": "nitpatna",
    "National Institute of Technology Hamirpur": "nithimachal",
    "National Institute of Technology, Kurukshetra": "nitkkr",
    "Visvesvaraya National Institute of Technology, Nagpur": "vnit",
    "Motilal Nehru National Institute of Technology Allahabad": "mnnit",
    "Malaviya National Institute of Technology Jaipur": "mnitjaipur",
    "Maulana Azad National Institute of Technology Bhopal": "manit",
    "Sardar Vallabhbhai National Institute of Technology, Surat": "svnit",
    "Dr. B R Ambedkar National Institute of Technology, Jalandhar": "nitj",
    # IIITs
    "Indian Institute of Information Technology, Allahabad": "iiita",
    "Indian Institute of Information Technology (IIIT) Ranchi": "iiitranchi",
    "Indian Institute of Information Technology Bhopal": "iiitbhopal",
}

# Short abbreviations used in Reddit discussions (NITs and IIITs only)
# All 51 colleges from the search results are included here for Tier 2 search.
INSTITUTE_ABBREVIATIONS: dict[str, list[str]] = {
    # NITs
    "National Institute of Technology Sikkim": ["NIT Sikkim"],
    "National Institute of Technology, Jamshedpur": ["NIT Jamshedpur", "NIT JSR"],
    "National Institute of Technology Durgapur": ["NIT Durgapur", "NITDGP"],
    "National Institute of Technology  Agartala": ["NIT Agartala", "NITA"],
    "National Institute of Technology Patna": ["NIT Patna", "NITP"],
    "National Institute of Technology, Silchar": ["NIT Silchar", "NITS"],
    "National Institute of Technology Raipur": ["NIT Raipur", "NITRR"],
    "National Institute of Technology Hamirpur": ["NIT Hamirpur", "NITH"],
    "National Institute of Technology, Kurukshetra": ["NIT Kurukshetra", "NITKKR"],
    "National Institute of Technology Goa": ["NIT Goa"],
    "National Institute of Technology Puducherry": ["NIT Puducherry", "NIT Pondy"],
    "National Institute of Technology Meghalaya": ["NIT Meghalaya"],
    "National Institute of Technology Nagaland": ["NIT Nagaland"],
    "National Institute of Technology, Manipur": ["NIT Manipur"],
    "National Institute of Technology, Mizoram": ["NIT Mizoram"],
    "National Institute of Technology Arunachal Pradesh": ["NIT Arunachal"],
    "National Institute of Technology, Uttarakhand": ["NIT Uttarakhand"],
    "National Institute of Technology Delhi": ["NIT Delhi", "NITD"],
    "National Institute of Technology, Andhra Pradesh": ["NIT Andhra Pradesh", "NIT AP"],
    "National Institute of Technology, Srinagar": ["NIT Srinagar", "NIT Kashmir"],
    "National Institute of Technology, Warangal": ["NIT Warangal", "NITW"],
    "National Institute of Technology Calicut": ["NIT Calicut", "NITC"],
    "National Institute of Technology, Rourkela": ["NIT Rourkela", "NITR"],
    "Visvesvaraya National Institute of Technology, Nagpur": ["VNIT", "VNIT Nagpur"],
    "Motilal Nehru National Institute of Technology Allahabad": ["MNNIT", "NIT Allahabad"],
    "Malaviya National Institute of Technology Jaipur": ["MNIT Jaipur", "MNIT"],
    "Maulana Azad National Institute of Technology Bhopal": ["MANIT Bhopal", "MANIT"],
    "Sardar Vallabhbhai National Institute of Technology, Surat": ["SVNIT", "SVNIT Surat"],
    "Dr. B R Ambedkar National Institute of Technology, Jalandhar": ["NIT Jalandhar", "NITJ"],
    # IIITs
    "Indian Institute of Information Technology (IIIT) Nagpur": ["IIIT Nagpur"],
    "Indian Institute of Information Technology (IIIT) Ranchi": ["IIIT Ranchi"],
    "Indian Institute of Information Technology (IIIT), Sri City, Chittoor": ["IIIT Sri City"],
    "Indian Institute of Information Technology (IIIT)Kota, Rajasthan": ["IIIT Kota"],
    "Indian Institute of Information Technology Bhagalpur": ["IIIT Bhagalpur"],
    "Indian Institute of Information Technology Bhopal": ["IIIT Bhopal"],
    "Indian Institute of Information Technology Design & Manufacturing Kurnool, Andhra Pradesh": ["IIITDM Kurnool"],
    "Indian Institute of Information Technology Surat": ["IIIT Surat"],
    "Indian Institute of Information Technology Tiruchirappalli": ["IIIT Trichy"],
    "Indian Institute of Information Technology(IIIT) Dharwad": ["IIIT Dharwad"],
    "Indian Institute of Information Technology(IIIT) Kalyani, West Bengal": ["IIIT Kalyani"],
    "Indian Institute of Information Technology(IIIT) Kilohrad, Sonepat, Haryana": ["IIIT Sonepat"],
    "Indian Institute of Information Technology(IIIT) Kottayam": ["IIIT Kottayam"],
    "Indian Institute of Information Technology(IIIT) Una, Himachal Pradesh": ["IIIT Una"],
    "Indian Institute of Information Technology(IIIT), Vadodara, Gujrat": ["IIIT Vadodara"],
    "Indian Institute of Information Technology, Agartala": ["IIIT Agartala"],
    "Indian Institute of Information Technology, Design & Manufacturing, Kancheepuram": ["IIITDM Kancheepuram"],
    "Indian Institute of Information Technology, Vadodara International Campus Diu (IIITVICD)": ["IIIT Diu", "IIITVICD"],
    "Indian institute of information technology, Raichur, Karnataka": ["IIIT Raichur"],
    "Indian Institute of Information Technology, Allahabad": ["IIIT Allahabad", "IIITA"],
    "INDIAN INSTITUTE OF INFORMATION TECHNOLOGY SENAPATI MANIPUR": ["IIIT Manipur", "IIIT Senapati"],
    "Indian Institute of Information Technology  Manipur": ["IIIT Manipur"],
    "Pt. Dwarka Prasad Mishra Indian Institute of Information Technology, Design & Manufacture Jabalpur": ["IIITDM Jabalpur", "IIIT Jabalpur"],
}

# Tier 2: General discussion subreddits
GENERAL_SUBREDDITS = [
    "Indian_Academia",
    "JEENEETards",
    "Btechtards",
    "indian_colleges",
]

# Branch keyword mapping for search queries
BRANCH_SEARCH_TERMS: dict[str, list[str]] = {
    "Computer Science": ["CSE", "computer science", "CS"],
    "Electrical": ["electrical", "EE", "ECE"],
    "Mechanical": ["mechanical", "mech"],
    "Civil": ["civil"],
    "Chemical": ["chemical"],
}

_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT})
_last_request_time = 0.0


def _throttled_get(url: str, params: dict | None = None) -> dict | None:
    """GET with rate limiting. Returns parsed JSON or None on failure."""
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < REQUEST_DELAY:
        time.sleep(REQUEST_DELAY - elapsed)

    try:
        resp = _session.get(url, params=params, timeout=15)
        _last_request_time = time.time()
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", 60))
            print(f"  Rate limited, sleeping {retry_after}s...")
            time.sleep(retry_after)
            resp = _session.get(url, params=params, timeout=15)
            _last_request_time = time.time()
        if resp.status_code != 200:
            return None
        return resp.json()
    except (requests.RequestException, json.JSONDecodeError):
        return None


def _extract_posts(data: dict) -> list[dict]:
    """Extract posts from Reddit listing JSON response. Only includes posts from the last year."""
    posts = []
    if not data or "data" not in data:
        return posts
    children = data["data"].get("children", [])
    for child in children:
        if child.get("kind") != "t3":
            continue
        post = child["data"]
        if post.get("removed_by_category") or post.get("is_robot_indexable") is False:
            continue
        created = post.get("created_utc", 0)
        if created < ONE_YEAR_AGO_UTC:
            continue
        posts.append({
            "post_id": post["id"],
            "title": post.get("title", ""),
            "body": post.get("selftext", ""),
            "score": post.get("score", 0),
            "subreddit": post.get("subreddit", ""),
            "permalink": post.get("permalink", ""),
            "created_utc": created,
            "num_comments": post.get("num_comments", 0),
        })
    return posts


def _fetch_top_comments(permalink: str, limit: int = 5) -> list[str]:
    """Fetch top comments for a post by permalink."""
    url = f"{BASE}{permalink}.json"
    data = _throttled_get(url, params={"sort": "top", "limit": limit})
    if not data or not isinstance(data, list) or len(data) < 2:
        return []
    comments_listing = data[1].get("data", {}).get("children", [])
    result = []
    for c in comments_listing[:limit]:
        if c.get("kind") != "t1":
            continue
        body = c.get("data", {}).get("body", "")
        if body and body != "[deleted]" and body != "[removed]":
            result.append(body[:500])
    return result


def scrape_subreddit_top(subreddit: str, time_filter: str = "all", limit: int = 50) -> list[dict]:
    """Scrape top posts from a subreddit."""
    url = f"{BASE}/r/{subreddit}/top.json"
    params = {"t": time_filter, "limit": min(limit, 100)}
    data = _throttled_get(url, params=params)
    return _extract_posts(data) if data else []


def search_subreddit(subreddit: str, query: str, limit: int = 25) -> list[dict]:
    """Search within a specific subreddit (last year only)."""
    url = f"{BASE}/r/{subreddit}/search.json"
    params = {
        "q": query,
        "restrict_sr": "on",
        "sort": "relevance",
        "t": "year",
        "limit": min(limit, 100),
    }
    data = _throttled_get(url, params=params)
    return _extract_posts(data) if data else []


def search_reddit(query: str, subreddit: str | None = None, limit: int = 25) -> list[dict]:
    """Search Reddit globally or within a subreddit (last year only)."""
    if subreddit:
        return search_subreddit(subreddit, query, limit)
    url = f"{BASE}/search.json"
    params = {"q": query, "sort": "relevance", "t": "year", "limit": min(limit, 100)}
    data = _throttled_get(url, params=params)
    return _extract_posts(data) if data else []


def scrape_college_posts(
    institute: str,
    program: str | None = None,
    max_posts: int = 50,
    fetch_comments: bool = True,
    top_n_for_comments: int = 10,
) -> list[dict]:
    """
    Scrape Reddit posts for a college (and optionally a specific program).
    Uses tiered strategy: college subreddit first, then general subs.
    Returns enriched post dicts with top_comments populated for top posts.
    """
    all_posts: dict[str, dict] = {}  # keyed by post_id to deduplicate

    # Tier 1: College-specific subreddit
    sub = INSTITUTE_SUBREDDITS.get(institute)
    if sub:
        # Get top posts from the college subreddit (last year only)
        posts = scrape_subreddit_top(sub, time_filter="year", limit=30)
        for p in posts:
            all_posts[p["post_id"]] = p

        # If we have a program, search for it within the subreddit
        if program:
            branch_terms = _get_branch_terms(program)
            for term in branch_terms[:2]:
                posts = search_subreddit(sub, term, limit=15)
                for p in posts:
                    all_posts[p["post_id"]] = p

    # Tier 2: General subreddits
    abbreviations = INSTITUTE_ABBREVIATIONS.get(institute, [])
    search_names = abbreviations[:2] if abbreviations else [institute.split(",")[0]]

    for search_name in search_names:
        query = f'"{search_name}"'
        if program:
            branch_terms = _get_branch_terms(program)
            if branch_terms:
                query = f'"{search_name}" {branch_terms[0]}'

        for general_sub in GENERAL_SUBREDDITS[:2]:
            if len(all_posts) >= max_posts:
                break
            posts = search_subreddit(general_sub, query, limit=15)
            for p in posts:
                all_posts[p["post_id"]] = p

    # Sort by score and take top posts
    sorted_posts = sorted(all_posts.values(), key=lambda p: p["score"], reverse=True)
    sorted_posts = sorted_posts[:max_posts]

    # Fetch comments for top posts
    if fetch_comments:
        for post in sorted_posts[:top_n_for_comments]:
            if post.get("permalink") and post.get("num_comments", 0) > 0:
                comments = _fetch_top_comments(post["permalink"])
                post["top_comments"] = comments

    return sorted_posts


def _get_branch_terms(program: str) -> list[str]:
    """Extract relevant search terms from a program name."""
    program_lower = program.lower()
    terms = []
    for branch, keywords in BRANCH_SEARCH_TERMS.items():
        if any(kw.lower() in program_lower for kw in keywords):
            terms.extend(keywords[:2])
            break
    if not terms:
        # Use first meaningful word from program name
        words = program.split("(")[0].strip().split()
        if words:
            terms.append(words[0])
    return terms


def posts_to_store_format(
    posts: list[dict], institute: str, program: str | None = None
) -> list[dict]:
    """Convert scraped posts to the format expected by the RedditPost model."""
    results = []
    for p in posts:
        results.append({
            "institute": institute,
            "program": program,
            "subreddit": p.get("subreddit", ""),
            "post_id": p["post_id"],
            "title": p["title"],
            "body": p.get("body", "")[:5000],
            "score": p.get("score", 0),
            "top_comments": json.dumps(p.get("top_comments", [])),
            "scraped_at": datetime.now(timezone.utc),
        })
    return results
