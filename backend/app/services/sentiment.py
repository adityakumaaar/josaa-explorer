"""Sentiment analysis using Google Gemini (free tier).

Analyzes batched Reddit posts for a college+branch and returns structured
categorized sentiment across: Placements, Campus Life, Faculty, Infrastructure.
"""

import json
import os
import time
from datetime import datetime, timezone

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash"
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

ANALYSIS_PROMPT = """You are analyzing Reddit posts and comments about an Indian engineering college.
College: {institute}
{program_line}

Based on the following Reddit content, provide a structured sentiment analysis across 4 categories.
For each category, provide:
- sentiment: "positive", "neutral", or "negative"
- score: a number from 1.0 to 5.0 (1=very negative, 3=neutral, 5=very positive)
- snippet: the most representative quote from the content (verbatim, max 200 chars). Use "" if no relevant content.

Categories:
1. placements - Job placements, packages, companies visiting, internship opportunities
2. campus_life - Social life, clubs, fests, food, hostel, diversity, location
3. faculty - Teaching quality, professors, curriculum, research opportunities
4. infrastructure - Labs, library, internet, sports facilities, buildings, campus

If there is no relevant content for a category, use sentiment "neutral", score 3.0, and empty snippet.

Reddit content:
{content}

Respond ONLY with valid JSON in this exact format:
{{"placements": {{"sentiment": "...", "score": ..., "snippet": "..."}}, "campus_life": {{"sentiment": "...", "score": ..., "snippet": "..."}}, "faculty": {{"sentiment": "...", "score": ..., "snippet": "..."}}, "infrastructure": {{"sentiment": "...", "score": ..., "snippet": "..."}}}}"""


def _build_content_block(posts: list[dict]) -> str:
    """Build a content block from posts for the prompt."""
    parts = []
    for i, post in enumerate(posts[:20], 1):
        title = post.get("title", "")
        body = post.get("body", "")[:800]
        comments_raw = post.get("top_comments", "[]")
        if isinstance(comments_raw, str):
            try:
                comments = json.loads(comments_raw)
            except json.JSONDecodeError:
                comments = []
        else:
            comments = comments_raw

        block = f"--- Post {i} (score: {post.get('score', 0)}) ---\nTitle: {title}"
        if body:
            block += f"\nBody: {body}"
        if comments:
            block += "\nTop comments:"
            for c in comments[:3]:
                block += f"\n  - {c[:300]}"
        parts.append(block)
    return "\n\n".join(parts)


def analyze_sentiment(
    institute: str,
    program: str | None,
    posts: list[dict],
) -> list[dict] | None:
    """
    Analyze sentiment for a college+program using Gemini.
    Returns a list of dicts with keys: category, sentiment, score, snippet.
    Returns None if analysis fails.
    """
    if not GEMINI_API_KEY:
        print("  GEMINI_API_KEY not set, skipping analysis")
        return None

    if not posts:
        return None

    try:
        from google import genai
    except ImportError:
        print("  google-genai not installed. Run: pip install google-genai")
        return None

    content_block = _build_content_block(posts)
    program_line = f"Branch/Program: {program}" if program else "General college review (all branches)"

    prompt = ANALYSIS_PROMPT.format(
        institute=institute,
        program_line=program_line,
        content=content_block,
    )

    client = genai.Client(api_key=GEMINI_API_KEY)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                },
            )
            result_text = response.text.strip()
            parsed = json.loads(result_text)
            return _normalize_result(parsed, len(posts))
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
                wait = RETRY_DELAY * attempt
                print(f"  Rate limited (attempt {attempt}), waiting {wait}s...")
                time.sleep(wait)
            elif attempt == MAX_RETRIES:
                print(f"  Gemini analysis failed after {MAX_RETRIES} attempts: {e}")
                return None
            else:
                time.sleep(RETRY_DELAY)

    return None


def _normalize_result(parsed: dict, post_count: int) -> list[dict]:
    """Normalize Gemini response into a list of category results."""
    categories = ["placements", "campus_life", "faculty", "infrastructure"]
    results = []
    now = datetime.now(timezone.utc)

    for cat in categories:
        entry = parsed.get(cat, {})
        sentiment = entry.get("sentiment", "neutral")
        if sentiment not in ("positive", "neutral", "negative"):
            sentiment = "neutral"

        score = entry.get("score", 3.0)
        try:
            score = float(score)
            score = max(1.0, min(5.0, score))
        except (ValueError, TypeError):
            score = 3.0

        snippet = entry.get("snippet", "")
        if not isinstance(snippet, str):
            snippet = ""
        snippet = snippet[:250]

        results.append({
            "category": cat,
            "sentiment": sentiment,
            "score": round(score, 1),
            "snippet": snippet,
            "post_count": post_count,
            "analyzed_at": now,
        })

    return results
