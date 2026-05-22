"""Scrape the JoSAA Opening & Closing Rank Archive (2019-2024) using Playwright.

The site uses jQuery Chosen plugin that hides native <select> elements, so we
use JS evaluation to set dropdown values and trigger ASP.NET postbacks directly.
"""

import time
from playwright.sync_api import sync_playwright, Page
from .parser import parse_orcr_table

ARCHIVE_URL = (
    "https://josaa.admissions.nic.in/applicant/seatmatrix/openingclosingrankarchieve.aspx"
)

DD = {
    "year": "ctl00$ContentPlaceHolder1$ddlYear",
    "round": "ctl00$ContentPlaceHolder1$ddlroundno",
    "instype": "ctl00$ContentPlaceHolder1$ddlInstype",
    "institute": "ctl00$ContentPlaceHolder1$ddlInstitute",
    "branch": "ctl00$ContentPlaceHolder1$ddlBranch",
    "seattype": "ctl00$ContentPlaceHolder1$ddlSeatType",
}
SUBMIT_BTN = "#ctl00_ContentPlaceHolder1_btnSubmit"


def _js_select(page: Page, asp_name: str, value: str):
    """Set a dropdown value via JS and trigger __doPostBack."""
    css_id = asp_name.replace("$", "_")
    page.wait_for_function("typeof __doPostBack === 'function'", timeout=15000)
    page.evaluate(f"""() => {{
        const sel = document.getElementById('{css_id}');
        if (sel) {{
            sel.value = '{value}';
            sel.dispatchEvent(new Event('change'));
        }}
        __doPostBack('{asp_name}', '');
    }}""")
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(0.5)


def _get_options(page: Page, asp_name: str) -> list[str]:
    css_id = asp_name.replace("$", "_")
    return page.evaluate(f"""() => {{
        const sel = document.getElementById('{css_id}');
        if (!sel) return [];
        return Array.from(sel.options)
            .map(o => o.value)
            .filter(v => v && v !== '0' && v !== '--Select--');
    }}""")


def fetch_archive_year_round(year: int, round_no: int) -> list[dict]:
    """Fetch all ORCR rows for a single (year, round) using a headless browser."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(ARCHIVE_URL, wait_until="networkidle", timeout=30000)

        _js_select(page, DD["year"], str(year))
        _js_select(page, DD["round"], str(round_no))
        _js_select(page, DD["instype"], "ALL")
        _js_select(page, DD["institute"], "ALL")
        _js_select(page, DD["branch"], "ALL")
        _js_select(page, DD["seattype"], "ALL")

        btn = page.query_selector(SUBMIT_BTN)
        if btn:
            btn.click(force=True)
        else:
            page.evaluate("() => __doPostBack('ctl00$ContentPlaceHolder1$btnSubmit', '')")

        page.wait_for_load_state("networkidle", timeout=120000)
        time.sleep(2)

        html = page.content()
        browser.close()

    return parse_orcr_table(html)


def get_available_rounds(year: int) -> list[int]:
    """Return round numbers available for a given year."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(ARCHIVE_URL, wait_until="networkidle", timeout=30000)

        _js_select(page, DD["year"], str(year))
        options = _get_options(page, DD["round"])
        browser.close()

    return [int(o) for o in options if o.isdigit()]
