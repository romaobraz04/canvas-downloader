# canvas_downloader/downloader.py
from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Dict, Optional

from matplotlib.pylab import block
import requests

import canvas_downloader.config as config
from canvas_downloader.canvas_api import canvas_get

logger = logging.getLogger(__name__)


def safe_name(name: str) -> str:
    """
    Make a string safe to use as a folder/file name on Windows.
    """
    if not name:
        return "untitled"
    bad_chars = r'<>:"/\\|?*'
    cleaned = "".join(c for c in name if c not in bad_chars).strip()
    return cleaned or "untitled"


def guess_block_for_course(course: Dict[str, Any]) -> Optional[str]:
    """
    Decide which BLOK a course belongs to, using BLOCK_COURSES from config.
    Returns e.g. 'BLOK1' or None if unknown.
    """
    sis_id = (course.get("sis_course_id") or "").strip()
    code = (course.get("course_code") or "").strip()

    # 1) Explicit mapping from .env
    for block, ids in config.BLOCK_COURSES.items():
        if sis_id in ids or code in ids:
            return block

    # 2) Fallback heuristic: look for 'blok1' etc. in the text
    name = course.get("name", "") or ""
    text = f"{name} {sis_id} {code}".lower()
    m = re.search(r"blok\W*([0-9])", text)
    if m:
        return f"BLOK{m.group(1)}".upper()

    return None


def download_file(file_info: Dict[str, Any], dest_path: str, update_only: bool = True) -> None:
    """
    Download a file from Canvas given its metadata.
    If update_only=True and file already exists, it is skipped.
    If update_only=False, file is always re-downloaded and overwritten.
    """
    download_url = file_info.get("url") or file_info.get("download_url")
    if not download_url:
        logger.warning(
            "No download URL for file id=%s (%s)",
            file_info.get("id"),
            file_info.get("display_name"),
        )
        return

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)

    if update_only and os.path.exists(dest_path):
        logger.info("Exists, skipping: %s", dest_path)
        return

    logger.info("Downloading: %s", dest_path)
    headers = {"Authorization": f"Bearer {config.CANVAS_ACCESS_TOKEN}"}
    with requests.get(download_url, headers=headers, stream=True) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

    time.sleep(0.1)  # be kind to the server


def sync_all_courses(update_only: bool = True) -> None:
    """
    Main sync function.
    - Respects EXCLUDED_IDS
    - Groups by BLOK if GROUP_BY_BLOCKS is True
    - Skips existing files in update mode (update_only=True)
    """
    os.makedirs(config.DOWNLOAD_ROOT, exist_ok=True)

    logger.info("FACULTY          = %s", config.FACULTY)
    logger.info("ESE_BLOCK_MODE   = %s", config.ESE_BLOCK_MODE)
    logger.info("GROUP_BY_BLOCKS  = %s", config.GROUP_BY_BLOCKS)
    logger.info("UPDATE_ONLY      = %s", update_only)
    logger.info("Fetching active courses from Canvas...")

    courses = canvas_get("/api/v1/courses", params={"enrollment_state": "active", "per_page": 100})
    logger.info("Found %d courses", len(courses))

    for course in courses:
        course_id = course.get("id")
        if not course_id:
            continue

        sis_id = (course.get("sis_course_id") or "").strip()
        code = (course.get("course_code") or "").strip()
        name = course.get("name", "") or ""
        course_name = safe_name(name)

        # Log course info once so users can see IDs in the console
        logger.info(
            "Course detected: %s | course_code=%s | sis_course_id=%s",
            name,
            code or "-",
            sis_id or "-",
        )

        # Skip excluded courses
        if sis_id in config.EXCLUDED_IDS or code in config.EXCLUDED_IDS:
            logger.info("Skipping excluded course: %s", name)
            continue

        # If ONLY_COURSES is configured, skip anything not in the whitelist
        if config.ONLY_COURSES_IDS:
            if (sis_id not in config.ONLY_COURSES_IDS) and (code not in config.ONLY_COURSES_IDS):
                logger.info("Skipping (not in ONLY_COURSES): %s", name)
                continue


        # Decide root folder
        if config.GROUP_BY_BLOCKS and config.ESE_BLOCK_MODE:
            block = guess_block_for_course(course) or "Unknown_BLOK"
            # Skip entire disabled blocks
            if block in config.DISABLED_BLOCKS:
                logger.info("Skipping course '%s' because its block (%s) is disabled", name, block)
                continue

            logger.info("Using block %s for course %s", block, name)
            course_root = os.path.join(config.DOWNLOAD_ROOT, block, course_name)
        else:
            # Either user disabled grouping, or faculty is not ESE
            course_root = os.path.join(config.DOWNLOAD_ROOT, course_name)


        # Fetch modules
        modules = canvas_get(f"/api/v1/courses/{course_id}/modules", params={"per_page": 100})
        logger.info("Course '%s' has %d modules", name, len(modules))

        for module in modules:
            module_id = module.get("id")
            module_name_raw = module.get("name", f"Module_{module_id}")
            module_name = safe_name(module_name_raw)
            module_root = os.path.join(course_root, module_name)
            logger.info("  Module: %s", module_name_raw)

            # Fetch module items
            items = canvas_get(
                f"/api/v1/courses/{course_id}/modules/{module_id}/items",
                params={"per_page": 100},
            )

            for item in items:
                if item.get("type") != "File":
                    continue

                file_id = item.get("content_id")
                if not file_id:
                    continue

                file_info = canvas_get(f"/api/v1/files/{file_id}")
                file_name = safe_name(
                    file_info.get("display_name")
                    or file_info.get("filename")
                    or f"file_{file_id}"
                )
                dest_path = os.path.join(module_root, file_name)
                download_file(file_info, dest_path, update_only=update_only)

    logger.info("Sync complete. Files under: %s", os.path.abspath(config.DOWNLOAD_ROOT))