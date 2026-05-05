import csv
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, List, Optional

from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from pydantic import BaseModel

logger = logging.getLogger(__name__)

load_dotenv()


class PhoneNumber(BaseModel):
    number: str
    source_url: str


class Email(BaseModel):
    email: str
    source_url: str


class BusinessLead(BaseModel):
    business_name: str
    contact_person: Optional[str] = None
    domain: Optional[str] = None
    address: Optional[str] = None
    phone_numbers: List[PhoneNumber] = []
    emails: List[Email] = []
    website: Optional[str] = None
    linkedin: Optional[str] = None
    sources: List[str] = []


class ExtractSchema(BaseModel):
    business_leads: List[BusinessLead]


NUM_LEADS: int = 5
NICHE: str = "food processing manufacturing plants, snack manufacturing factories, edible oil processing plants, beverage manufacturing units"
INDUSTRY: str = "Industrial & Infrastructure Sector (Manufacturing, Supply, Services)"
LOCATION: str = "Maharashtra, India"


class CSVManager:
    OUTPUT_DIR = Path("output")
    MAX_FILES = 100
    MAX_AGE_DAYS = 7

    @classmethod
    def generate_filename(cls, industry: str, location: str) -> Path:
        timestamp = int(time.time())
        clean_industry = re.sub(r'[^a-zA-Z0-9]', '_', industry).strip('_').lower()
        clean_location = re.sub(r'[^a-zA-Z0-9]', '_', location).strip('_').lower()
        return cls.OUTPUT_DIR / f"{clean_industry}_{clean_location}_{timestamp}.csv"

    @classmethod
    def cleanup_old_files(cls) -> int:
        if not cls.OUTPUT_DIR.exists():
            return 0
        removed = 0
        cutoff = time.time() - (cls.MAX_AGE_DAYS * 86400)
        for fp in cls.OUTPUT_DIR.glob("*.csv"):
            if fp.stat().st_mtime < cutoff:
                fp.unlink()
                removed += 1
        if removed:
            logger.info("Cleaned up %d old CSV files", removed)
        return removed

    @classmethod
    def enforce_file_limit(cls) -> int:
        if not cls.OUTPUT_DIR.exists():
            return 0
        files = sorted(cls.OUTPUT_DIR.glob("*.csv"), key=lambda p: p.stat().st_mtime)
        if len(files) <= cls.MAX_FILES:
            return 0
        to_remove = files[: len(files) - cls.MAX_FILES]
        for fp in to_remove:
            fp.unlink()
        logger.info("Removed %d files to enforce limit", len(to_remove))
        return len(to_remove)


def extract_leads_from_result(result: Any) -> List:
    if hasattr(result, 'data'):
        payload = result.data
    else:
        payload = result

    if isinstance(payload, dict):
        leads = payload.get("business_leads", [])
    elif hasattr(payload, 'business_leads'):
        leads = payload.business_leads
    else:
        leads = []

    if not isinstance(leads, list):
        logger.warning("Expected list of leads, got %s", type(leads))
        return []

    return leads


def build_prompt(num_leads: int, niche: str, industry: str, location: str) -> str:
    if not all([num_leads, niche, industry, location]):
        raise ValueError("All parameters are required")
    if num_leads < 1 or num_leads > 100:
        raise ValueError("num_leads must be between 1 and 100")

    return f"""
Extract up to {num_leads} high-quality business leads.

Target:
- Niche: {niche}
- Industry: {industry}
- Location: {location}

Requirements:
- Only include relevant businesses matching the niche and industry
- Prioritize active businesses with publicly available contact details
- Phone numbers must be sourced from at least 2 sources if available
- Include source URLs for every phone number and email
- Avoid duplicates (based on business name, phone, or website)
- Do NOT guess missing data (use null instead)
- Prefer official websites, Google Business, and LinkedIn
- Exclude irrelevant identifiers like GST and RERA numbers
"""


def extract_leads(app: FirecrawlApp, prompt: str) -> Any:
    logger.info("Starting lead extraction process with Firecrawl agent...")
    try:
        result = app.agent(
            schema=ExtractSchema,
            prompt=prompt,
            model="spark-1-mini",
        )
        logger.info("Successfully completed the extraction request.")
        return result
    except Exception as e:
        logger.error("Failed to extract leads from Firecrawl.", exc_info=True)
        raise RuntimeError(f"Firecrawl extraction failed: {e}") from e


def save_to_csv(data: Any, industry: str, location: str) -> Optional[str]:
    try:
        leads = extract_leads_from_result(data)

        if not leads:
            logger.warning("No business leads to save to CSV.")
            return None

        os.makedirs("output", exist_ok=True)

        CSVManager.cleanup_old_files()
        CSVManager.enforce_file_limit()

        filename = CSVManager.generate_filename(industry, location)

        fieldnames = [
            "Business Name", "Contact Person", "Domain", "Address",
            "Phone Numbers", "Emails", "Website", "LinkedIn", "Sources"
        ]

        with open(filename, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for lead in leads:
                is_dict = isinstance(lead, dict)

                def get_val(key: str) -> Any:
                    return lead.get(key) if is_dict else getattr(lead, key, None)

                phones_raw = get_val("phone_numbers") or []
                formatted_phones = ", ".join(
                    [p.get("number") if isinstance(p, dict) else getattr(p, "number", "") for p in phones_raw]
                )

                emails_raw = get_val("emails") or []
                formatted_emails = ", ".join(
                    [e.get("email") if isinstance(e, dict) else getattr(e, "email", "") for e in emails_raw]
                )

                sources_raw = get_val("sources") or []
                formatted_sources = ", ".join(sources_raw)

                writer.writerow({
                    "Business Name": get_val("business_name") or "",
                    "Contact Person": get_val("contact_person") or "",
                    "Domain": get_val("domain") or "",
                    "Address": get_val("address") or "",
                    "Phone Numbers": formatted_phones,
                    "Emails": formatted_emails,
                    "Website": get_val("website") or "",
                    "LinkedIn": get_val("linkedin") or "",
                    "Sources": formatted_sources,
                })

        logger.info("Successfully saved %d leads to %s", len(leads), filename)
        return str(filename)
    except Exception as e:
        logger.error("Failed to save leads to CSV.", exc_info=True)
        return None


def main() -> None:
    api_key = os.getenv("FIRECRAWL_API_KEY")
    if not api_key:
        logger.error("FIRECRAWL_API_KEY environment variable is not set.")
        return

    try:
        app = FirecrawlApp(api_key=api_key)
    except Exception as e:
        logger.error("Failed to initialize FirecrawlApp.", exc_info=True)
        return

    prompt = build_prompt(NUM_LEADS, NICHE, INDUSTRY, LOCATION)
    result = extract_leads(app, prompt)

    if result:
        logger.info("Extraction Result received. Proceeding to save.")
        save_to_csv(result, INDUSTRY, LOCATION)
    else:
        logger.warning("No results were returned.")


if __name__ == "__main__":
    main()