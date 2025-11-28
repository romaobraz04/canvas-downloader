# canvas_downloader/config.py
from __future__ import annotations

import os
from typing import Dict, Set

from dotenv import load_dotenv

load_dotenv()

CANVAS_BASE_URL: str = (os.getenv("CANVAS_BASE_URL") or "").rstrip("/")
CANVAS_ACCESS_TOKEN: str | None = os.getenv("CANVAS_ACCESS_TOKEN")
DOWNLOAD_ROOT: str = os.getenv("DOWNLOAD_ROOT", "./downloads")

# New: faculty flag
FACULTY: str = (os.getenv("FACULTY", "") or "").strip().upper()
ESE_BLOCK_MODE: bool = FACULTY == "ESE"

GROUP_BY_BLOCKS: bool = os.getenv("GROUP_BY_BLOCKS", "true").strip().lower() in {
    "1", "true", "yes", "y", "on",
}
UPDATE_ONLY: bool = os.getenv("UPDATE_ONLY", "true").strip().lower() in {
    "1", "true", "yes", "y", "on",
}

if not CANVAS_BASE_URL or not CANVAS_ACCESS_TOKEN:
    raise RuntimeError("Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN in your .env file")

BLOCK_COURSES: Dict[str, Set[str]] = {}
EXCLUDED_IDS: Set[str] = set()
ONLY_COURSES_IDS: Set[str] = set()
DISABLED_BLOCKS: Set[str] = set()

def load_block_map_from_env() -> None:
    global BLOCK_COURSES
    BLOCK_COURSES = {}

    for key, value in os.environ.items():
        key_upper = key.upper()
        if not key_upper.startswith("BLOK"):
            continue

        block_name = key_upper  # e.g. BLOK1, BLOK2
        raw = value or ""
        ids = [v.strip() for v in raw.split(",") if v.strip()]
        BLOCK_COURSES[block_name] = set(ids)

def load_exclusions_from_env() -> None:
    global EXCLUDED_IDS
    raw = os.getenv("EXCLUDED", "") or ""
    items = [v.strip() for v in raw.split(",") if v.strip()]
    EXCLUDED_IDS = set(items)

def load_only_courses_from_env() -> None:
    """
    Read ONLY_COURSES from env:
        ONLY_COURSES=courseId1, courseId2
    → ONLY_COURSES_IDS = {courseId1, courseId2}
    """
    global ONLY_COURSES_IDS
    raw = os.getenv("ONLY_COURSES", "") or ""
    items = [v.strip() for v in raw.split(",") if v.strip()]
    ONLY_COURSES_IDS = set(items)

def load_disabled_blocks_from_env() -> None:
    global DISABLED_BLOCKS
    raw = os.getenv("DISABLE_BLOCKS", "") or ""
    items = [v.strip().upper() for v in raw.split(",") if v.strip()]
    DISABLED_BLOCKS = set(items)

load_block_map_from_env()
load_exclusions_from_env()
load_only_courses_from_env()
load_disabled_blocks_from_env()