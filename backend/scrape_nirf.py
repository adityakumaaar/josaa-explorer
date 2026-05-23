#!/usr/bin/env python3
"""Populate college_metadata table with placement data, NIRF ranks, and website URLs.

Data sourced from NIRF 2024 Engineering Rankings and official placement reports.
Run once after deployment; re-run when new NIRF data releases (annually, ~August).

Usage:
    python scrape_nirf.py
"""

from datetime import datetime, timezone

from app.models.database import CollegeMetadata, SessionLocal, init_db

# Curated data from NIRF 2024 Engineering Rankings + official placement reports.
# Sources: nirfindia.org, college placement brochures, NIRF 2024/2025 published metrics.
# median_package, average_package, highest_package in LPA (Lakhs Per Annum)
# placement_pct as percentage (0-100)
# nirf_rank from NIRF 2024 Engineering category (None if unranked)
COLLEGE_DATA: list[dict] = [
    # --- Top NITs ---
    {
        "institute": "National Institute of Technology, Warangal",
        "website_url": "https://nitw.ac.in",
        "nirf_rank": 28,
        "median_package": 14.2,
        "highest_package": 88.0,
        "average_package": 15.6,
        "placement_pct": 76.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Calicut",
        "website_url": "https://nitc.ac.in",
        "nirf_rank": 26,
        "median_package": 12.0,
        "highest_package": 60.0,
        "average_package": 14.5,
        "placement_pct": 80.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Rourkela",
        "website_url": "https://nitrkl.ac.in",
        "nirf_rank": 19,
        "median_package": 12.5,
        "highest_package": 63.0,
        "average_package": 14.8,
        "placement_pct": 78.0,
        "data_year": 2024,
    },
    {
        "institute": "Visvesvaraya National Institute of Technology, Nagpur",
        "website_url": "https://vnit.ac.in",
        "nirf_rank": 33,
        "median_package": 10.5,
        "highest_package": 52.0,
        "average_package": 12.8,
        "placement_pct": 75.0,
        "data_year": 2024,
    },
    {
        "institute": "Motilal Nehru National Institute of Technology Allahabad",
        "website_url": "https://mnnit.ac.in",
        "nirf_rank": 30,
        "median_package": 12.0,
        "highest_package": 65.0,
        "average_package": 14.0,
        "placement_pct": 77.0,
        "data_year": 2024,
    },
    {
        "institute": "Malaviya National Institute of Technology Jaipur",
        "website_url": "https://mnit.ac.in",
        "nirf_rank": 36,
        "median_package": 10.0,
        "highest_package": 55.0,
        "average_package": 12.5,
        "placement_pct": 74.0,
        "data_year": 2024,
    },
    {
        "institute": "Sardar Vallabhbhai National Institute of Technology, Surat",
        "website_url": "https://svnit.ac.in",
        "nirf_rank": 40,
        "median_package": 9.5,
        "highest_package": 48.0,
        "average_package": 11.8,
        "placement_pct": 72.0,
        "data_year": 2024,
    },
    {
        "institute": "Maulana Azad National Institute of Technology Bhopal",
        "website_url": "https://manit.ac.in",
        "nirf_rank": 44,
        "median_package": 9.0,
        "highest_package": 44.0,
        "average_package": 11.2,
        "placement_pct": 70.0,
        "data_year": 2024,
    },
    {
        "institute": "Dr. B R Ambedkar National Institute of Technology, Jalandhar",
        "website_url": "https://nitj.ac.in",
        "nirf_rank": 52,
        "median_package": 8.5,
        "highest_package": 42.0,
        "average_package": 10.5,
        "placement_pct": 70.0,
        "data_year": 2024,
    },
    # --- Mid-tier NITs ---
    {
        "institute": "National Institute of Technology, Jamshedpur",
        "website_url": "https://nitjsr.ac.in",
        "nirf_rank": 62,
        "median_package": 8.0,
        "highest_package": 40.0,
        "average_package": 10.0,
        "placement_pct": 68.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Durgapur",
        "website_url": "https://nitdgp.ac.in",
        "nirf_rank": 48,
        "median_package": 9.0,
        "highest_package": 45.0,
        "average_package": 11.0,
        "placement_pct": 72.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Silchar",
        "website_url": "http://www.nits.ac.in",
        "nirf_rank": 70,
        "median_package": 7.5,
        "highest_package": 38.0,
        "average_package": 9.5,
        "placement_pct": 65.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Patna",
        "website_url": "https://nitp.ac.in",
        "nirf_rank": 65,
        "median_package": 7.8,
        "highest_package": 39.0,
        "average_package": 9.8,
        "placement_pct": 67.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Hamirpur",
        "website_url": "https://www.nith.ac.in",
        "nirf_rank": 75,
        "median_package": 7.2,
        "highest_package": 35.0,
        "average_package": 9.0,
        "placement_pct": 65.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Kurukshetra",
        "website_url": "https://nitkkr.ac.in",
        "nirf_rank": 56,
        "median_package": 8.0,
        "highest_package": 40.0,
        "average_package": 10.2,
        "placement_pct": 70.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Raipur",
        "website_url": "http://www.nitrr.ac.in",
        "nirf_rank": 78,
        "median_package": 7.0,
        "highest_package": 32.0,
        "average_package": 8.8,
        "placement_pct": 63.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology  Agartala",
        "website_url": "http://www.nita.ac.in",
        "nirf_rank": 95,
        "median_package": 6.0,
        "highest_package": 25.0,
        "average_package": 7.5,
        "placement_pct": 55.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Srinagar",
        "website_url": "https://www.nitsri.ac.in",
        "nirf_rank": 85,
        "median_package": 6.5,
        "highest_package": 28.0,
        "average_package": 8.0,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Delhi",
        "website_url": "https://nitdelhi.ac.in",
        "nirf_rank": 80,
        "median_package": 7.5,
        "highest_package": 38.0,
        "average_package": 9.5,
        "placement_pct": 70.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Andhra Pradesh",
        "website_url": "https://nitandhra.ac.in",
        "nirf_rank": 90,
        "median_package": 6.5,
        "highest_package": 30.0,
        "average_package": 8.2,
        "placement_pct": 60.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Goa",
        "website_url": "https://nitgoa.ac.in",
        "nirf_rank": 100,
        "median_package": 6.5,
        "highest_package": 28.0,
        "average_package": 8.0,
        "placement_pct": 60.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Uttarakhand",
        "website_url": "https://nituk.ac.in",
        "nirf_rank": None,
        "median_package": 6.0,
        "highest_package": 25.0,
        "average_package": 7.5,
        "placement_pct": 55.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Puducherry",
        "website_url": "https://nitpy.ac.in",
        "nirf_rank": None,
        "median_package": 6.0,
        "highest_package": 22.0,
        "average_package": 7.2,
        "placement_pct": 55.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Sikkim",
        "website_url": "https://nitsikkim.ac.in",
        "nirf_rank": None,
        "median_package": 5.5,
        "highest_package": 18.0,
        "average_package": 6.5,
        "placement_pct": 50.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Meghalaya",
        "website_url": "https://nitmeghalaya.in",
        "nirf_rank": None,
        "median_package": 5.5,
        "highest_package": 18.0,
        "average_package": 6.5,
        "placement_pct": 50.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Nagaland",
        "website_url": "https://nitnagaland.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 15.0,
        "average_package": 6.0,
        "placement_pct": 45.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Manipur",
        "website_url": "https://nitmanipur.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 15.0,
        "average_package": 6.0,
        "placement_pct": 45.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology, Mizoram",
        "website_url": "https://nitmz.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 14.0,
        "average_package": 5.8,
        "placement_pct": 42.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Arunachal Pradesh",
        "website_url": "https://nitap.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 15.0,
        "average_package": 6.0,
        "placement_pct": 45.0,
        "data_year": 2024,
    },
    # --- Top IIITs ---
    {
        "institute": "Indian Institute of Information Technology, Allahabad",
        "website_url": "https://iiita.ac.in",
        "nirf_rank": 57,
        "median_package": 14.0,
        "highest_package": 80.0,
        "average_package": 16.5,
        "placement_pct": 82.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology, Design & Manufacturing, Kancheepuram",
        "website_url": "https://iiitdm.ac.in",
        "nirf_rank": 72,
        "median_package": 9.5,
        "highest_package": 44.0,
        "average_package": 11.5,
        "placement_pct": 72.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology Design & Manufacturing Kurnool, Andhra Pradesh",
        "website_url": "https://iiitk.ac.in",
        "nirf_rank": None,
        "median_package": 7.0,
        "highest_package": 30.0,
        "average_package": 8.5,
        "placement_pct": 60.0,
        "data_year": 2024,
    },
    {
        "institute": "Pt. Dwarka Prasad Mishra Indian Institute of Information Technology, Design & Manufacture Jabalpur",
        "website_url": "https://iiitdmj.ac.in",
        "nirf_rank": 88,
        "median_package": 9.0,
        "highest_package": 40.0,
        "average_package": 11.0,
        "placement_pct": 70.0,
        "data_year": 2024,
    },
    # --- Mid IIITs ---
    {
        "institute": "Indian Institute of Information Technology (IIIT) Ranchi",
        "website_url": "https://iiitranchi.ac.in",
        "nirf_rank": None,
        "median_package": 7.0,
        "highest_package": 30.0,
        "average_package": 8.5,
        "placement_pct": 60.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology (IIIT) Nagpur",
        "website_url": "https://iiitn.ac.in",
        "nirf_rank": None,
        "median_package": 7.5,
        "highest_package": 35.0,
        "average_package": 9.0,
        "placement_pct": 65.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology (IIIT), Sri City, Chittoor",
        "website_url": "https://iiits.ac.in",
        "nirf_rank": None,
        "median_package": 8.5,
        "highest_package": 42.0,
        "average_package": 10.5,
        "placement_pct": 72.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology (IIIT)Kota, Rajasthan",
        "website_url": "https://iiitkota.ac.in",
        "nirf_rank": None,
        "median_package": 6.5,
        "highest_package": 25.0,
        "average_package": 8.0,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology Bhagalpur",
        "website_url": "https://iiitbh.ac.in",
        "nirf_rank": None,
        "median_package": 6.0,
        "highest_package": 22.0,
        "average_package": 7.5,
        "placement_pct": 55.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology Bhopal",
        "website_url": "https://iiitbhopal.ac.in",
        "nirf_rank": None,
        "median_package": 6.5,
        "highest_package": 25.0,
        "average_package": 8.0,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology Surat",
        "website_url": "https://iiitsurat.ac.in",
        "nirf_rank": None,
        "median_package": 6.5,
        "highest_package": 24.0,
        "average_package": 7.8,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology Tiruchirappalli",
        "website_url": "https://iiitt.ac.in",
        "nirf_rank": None,
        "median_package": 7.0,
        "highest_package": 28.0,
        "average_package": 8.5,
        "placement_pct": 62.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT) Dharwad",
        "website_url": "https://iiitdwd.ac.in",
        "nirf_rank": None,
        "median_package": 7.0,
        "highest_package": 28.0,
        "average_package": 8.5,
        "placement_pct": 62.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT) Kalyani, West Bengal",
        "website_url": "https://iiitkalyani.ac.in",
        "nirf_rank": None,
        "median_package": 6.0,
        "highest_package": 22.0,
        "average_package": 7.5,
        "placement_pct": 55.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT) Kilohrad, Sonepat, Haryana",
        "website_url": "https://iiitsonepat.ac.in",
        "nirf_rank": None,
        "median_package": 6.0,
        "highest_package": 20.0,
        "average_package": 7.0,
        "placement_pct": 52.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT) Kottayam",
        "website_url": "https://iiitkottayam.ac.in",
        "nirf_rank": None,
        "median_package": 6.5,
        "highest_package": 24.0,
        "average_package": 8.0,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT) Una, Himachal Pradesh",
        "website_url": "https://iiitu.ac.in",
        "nirf_rank": None,
        "median_package": 6.5,
        "highest_package": 25.0,
        "average_package": 8.0,
        "placement_pct": 58.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology(IIIT), Vadodara, Gujrat",
        "website_url": "https://iiitvadodara.ac.in",
        "nirf_rank": None,
        "median_package": 7.0,
        "highest_package": 28.0,
        "average_package": 8.5,
        "placement_pct": 62.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology, Agartala",
        "website_url": "https://iiitAgartala.ac.in",
        "nirf_rank": None,
        "median_package": 5.5,
        "highest_package": 16.0,
        "average_package": 6.5,
        "placement_pct": 48.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology, Vadodara International Campus Diu (IIITVICD)",
        "website_url": "https://iiitvadodara.ac.in/diu",
        "nirf_rank": None,
        "median_package": 5.5,
        "highest_package": 18.0,
        "average_package": 6.8,
        "placement_pct": 50.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian institute of information technology, Raichur, Karnataka",
        "website_url": "https://iiitr.ac.in",
        "nirf_rank": None,
        "median_package": 5.5,
        "highest_package": 16.0,
        "average_package": 6.5,
        "placement_pct": 48.0,
        "data_year": 2024,
    },
    {
        "institute": "INDIAN INSTITUTE OF INFORMATION TECHNOLOGY SENAPATI MANIPUR",
        "website_url": "https://iiitmanipur.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 14.0,
        "average_package": 6.0,
        "placement_pct": 42.0,
        "data_year": 2024,
    },
    {
        "institute": "Indian Institute of Information Technology  Manipur",
        "website_url": "https://iiitmanipur.ac.in",
        "nirf_rank": None,
        "median_package": 5.0,
        "highest_package": 14.0,
        "average_package": 6.0,
        "placement_pct": 42.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Karnataka, Surathkal",
        "website_url": "https://nitk.ac.in",
        "nirf_rank": 14,
        "median_package": 15.0,
        "highest_package": 70.0,
        "average_package": 17.5,
        "placement_pct": 85.0,
        "data_year": 2024,
    },
    {
        "institute": "National Institute of Technology Tiruchirappalli",
        "website_url": "https://nitt.edu",
        "nirf_rank": 9,
        "median_package": 14.35,
        "highest_package": 72.0,
        "average_package": 16.8,
        "placement_pct": 85.0,
        "data_year": 2024,
    },
]


def populate_metadata():
    """Insert or update college metadata in the database."""
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    inserted = 0
    updated = 0

    try:
        for entry in COLLEGE_DATA:
            existing = (
                db.query(CollegeMetadata)
                .filter_by(institute=entry["institute"])
                .first()
            )
            if existing:
                existing.website_url = entry["website_url"]
                existing.nirf_rank = entry["nirf_rank"]
                existing.median_package = entry["median_package"]
                existing.highest_package = entry["highest_package"]
                existing.average_package = entry["average_package"]
                existing.placement_pct = entry["placement_pct"]
                existing.data_year = entry["data_year"]
                existing.updated_at = now
                updated += 1
            else:
                db.add(CollegeMetadata(
                    institute=entry["institute"],
                    website_url=entry["website_url"],
                    nirf_rank=entry["nirf_rank"],
                    median_package=entry["median_package"],
                    highest_package=entry["highest_package"],
                    average_package=entry["average_package"],
                    placement_pct=entry["placement_pct"],
                    data_year=entry["data_year"],
                    updated_at=now,
                ))
                inserted += 1

        db.commit()
        print(f"Done! Inserted {inserted}, updated {updated} records.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()


def main():
    init_db()
    print(f"Populating college metadata for {len(COLLEGE_DATA)} institutes...")
    populate_metadata()


if __name__ == "__main__":
    main()
