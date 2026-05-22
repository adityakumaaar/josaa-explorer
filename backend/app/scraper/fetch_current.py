"""Scrape the JoSAA *current year* Opening & Closing Ranks (2025) using Playwright.

NOTE: The 2025 page uses slightly different field names than the archive:
  - ddlSeattype (lowercase t) vs ddlSeatType (uppercase T)
  - The seat type dropdown has no onchange/autopostback
"""

import time
from playwright.sync_api import sync_playwright, Page
from .parser import parse_orcr_table

CURRENT_URL = (
    "https://josaa.admissions.nic.in/applicant/SeatAllotmentResult/CurrentORCR.aspx"
)

DD = {
    "round": "ctl00$ContentPlaceHolder1$ddlroundno",
    "instype": "ctl00$ContentPlaceHolder1$ddlInstype",
    "institute": "ctl00$ContentPlaceHolder1$ddlInstitute",
    "branch": "ctl00$ContentPlaceHolder1$ddlBranch",
    "seattype": "ctl00$ContentPlaceHolder1$ddlSeattype",  # lowercase 't'
}


def _js_select(page: Page, asp_name: str, value: str, trigger_postback: bool = True):
    css_id = asp_name.replace("$", "_")
    if trigger_postback:
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
    else:
        page.evaluate(f"""() => {{
            const sel = document.getElementById('{css_id}');
            if (sel) {{
                sel.value = '{value}';
            }}
        }}""")


def _get_options(page: Page, asp_name: str) -> list[str]:
    css_id = asp_name.replace("$", "_")
    return page.evaluate(f"""() => {{
        const sel = document.getElementById('{css_id}');
        if (!sel) return [];
        return Array.from(sel.options)
            .map(o => o.value)
            .filter(v => v && v !== '0' && v !== '--Select--' && v !== '');
    }}""")


def _inject_all_option(page: Page, asp_name: str):
    """Add an ALL option to a dropdown if it doesn't exist."""
    css_id = asp_name.replace("$", "_")
    page.evaluate(f"""() => {{
        const sel = document.getElementById('{css_id}');
        if (sel) {{
            let hasAll = false;
            for (let opt of sel.options) {{
                if (opt.value === 'ALL') hasAll = true;
            }}
            if (!hasAll) {{
                const opt = new Option('ALL', 'ALL');
                sel.insertBefore(opt, sel.options[1] || null);
            }}
            sel.value = 'ALL';
        }}
    }}""")


def fetch_current_round(round_no: int) -> list[dict]:
    """Fetch all ORCR rows for a given round of 2025."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(CURRENT_URL, wait_until="networkidle", timeout=30000)

        _js_select(page, DD["round"], str(round_no))
        _js_select(page, DD["instype"], "ALL")
        _js_select(page, DD["institute"], "ALL")
        _js_select(page, DD["branch"], "ALL")

        # Seat type has no postback trigger and may not populate its options,
        # so inject ALL and set it without triggering a postback
        seat_opts = _get_options(page, DD["seattype"])
        if "ALL" not in seat_opts:
            _inject_all_option(page, DD["seattype"])
        else:
            _js_select(page, DD["seattype"], "ALL", trigger_postback=False)

        btn = page.query_selector("#ctl00_ContentPlaceHolder1_btnSubmit")
        if btn:
            btn.click(force=True)
        else:
            page.evaluate("() => __doPostBack('ctl00$ContentPlaceHolder1$btnSubmit', '')")

        page.wait_for_load_state("networkidle", timeout=120000)
        time.sleep(2)

        html = page.content()
        browser.close()

    return parse_orcr_table(html)


def get_available_rounds() -> list[int]:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(CURRENT_URL, wait_until="networkidle", timeout=30000)

        options = _get_options(page, DD["round"])
        browser.close()

    return [int(o) for o in options if o.isdigit()]
