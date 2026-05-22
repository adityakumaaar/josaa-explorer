"""Parse the HTML response table from the JoSAA ORCR pages."""

import re
from bs4 import BeautifulSoup


def extract_hidden_fields(html: str) -> dict[str, str]:
    """Pull __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION and the
    security-key hidden field from an ASP.NET page."""
    soup = BeautifulSoup(html, "lxml")
    fields: dict[str, str] = {}
    for name in (
        "__VIEWSTATE",
        "__VIEWSTATEGENERATOR",
        "__EVENTVALIDATION",
        "__VIEWSTATEENCRYPTED",
    ):
        tag = soup.find("input", {"name": name})
        if tag:
            fields[name] = tag.get("value", "")

    sec_key = soup.find("input", {"id": "ctl00_hdnSecKey"})
    if sec_key:
        fields["ctl00$hdnSecKey"] = sec_key.get("value", "")
    return fields


def extract_dropdown_options(html: str, dropdown_id: str) -> list[str]:
    """Return the <option> values for a given <select> by its ASP id."""
    soup = BeautifulSoup(html, "lxml")
    select = soup.find("select", {"name": dropdown_id})
    if not select:
        return []
    return [
        opt["value"]
        for opt in select.find_all("option")
        if opt.get("value") and opt["value"] not in ("--Select--", "")
    ]


def parse_rank(text: str) -> tuple[int | None, bool]:
    """Parse a rank cell.  Returns (rank_int, is_preparatory).
    Handles '1234', '1234P', empty strings and dashes."""
    text = text.strip()
    if not text or text == "-":
        return None, False
    is_prep = text.upper().endswith("P")
    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return None, False
    return int(digits), is_prep


def parse_orcr_table(html: str) -> list[dict]:
    """Parse the results table from the ORCR page into a list of dicts."""
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table", {"id": re.compile(r"GridView", re.I)})
    if not table:
        table = soup.find("table", class_=re.compile(r"tabledata|grid", re.I))
    if not table:
        tables = soup.find_all("table")
        for t in tables:
            headers = [th.get_text(strip=True).lower() for th in t.find_all("th")]
            if "institute" in " ".join(headers) and "closing" in " ".join(headers):
                table = t
                break
    if not table:
        return []

    rows = table.find_all("tr")
    if not rows:
        return []

    headers = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]

    col_map = {}
    for i, h in enumerate(headers):
        hl = h.lower()
        if "institute" in hl and "type" not in hl:
            col_map["institute"] = i
        elif "program" in hl or "academic" in hl:
            col_map["program"] = i
        elif "quota" in hl:
            col_map["quota"] = i
        elif "seat" in hl and "type" in hl:
            col_map["seat_type"] = i
        elif "category" in hl:
            col_map.setdefault("seat_type", i)
        elif "gender" in hl:
            col_map["gender"] = i
        elif "opening" in hl:
            col_map["opening_rank"] = i
        elif "closing" in hl:
            col_map["closing_rank"] = i

    required = {"institute", "program", "closing_rank"}
    if not required.issubset(col_map.keys()):
        return []

    records: list[dict] = []
    for row in rows[1:]:
        cells = [td.get_text(strip=True) for td in row.find_all("td")]
        if len(cells) <= max(col_map.values()):
            continue

        opening, op_prep = parse_rank(cells[col_map.get("opening_rank", -1)] if "opening_rank" in col_map else "")
        closing, cl_prep = parse_rank(cells[col_map["closing_rank"]])

        records.append(
            {
                "institute": cells[col_map["institute"]],
                "program": cells[col_map["program"]],
                "quota": cells[col_map["quota"]] if "quota" in col_map else "AI",
                "seat_type": cells[col_map["seat_type"]] if "seat_type" in col_map else "OPEN",
                "gender": cells[col_map["gender"]] if "gender" in col_map else "Gender-Neutral",
                "opening_rank": opening,
                "closing_rank": closing,
                "is_preparatory": op_prep or cl_prep,
            }
        )
    return records
