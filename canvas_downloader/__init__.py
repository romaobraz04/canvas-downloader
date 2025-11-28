# canvas_downloader/__init__.py
from __future__ import annotations

"""
canvas_downloader package

A small tool to download and update course files from Canvas LMS.
Configuration is handled via .env.
"""

import logging
from typing import Optional

from . import config
from .downloader import sync_all_courses


logger = logging.getLogger(__name__)

__all__ = [
    "sync",
    "load_config",
    "config",
]


def sync(update_only: Optional[bool] = None) -> None:
    """
    External entry point for programmatic use.

    Example:
        from canvas_downloader import sync
        sync()                # uses UPDATE_ONLY from .env
        sync(update_only=False)  # force full refresh
    """
    if update_only is None:
        update_only = config.UPDATE_ONLY
    logger.debug("Starting sync (update_only=%s)", update_only)
    sync_all_courses(update_only=update_only)


def load_config() -> None:
    """
    Reload block mappings and exclusions from .env at runtime
    (usually not needed unless you change .env while the program is running).
    """
    config.load_block_map_from_env()
    config.load_exclusions_from_env()
    logger.debug("Configuration reloaded from environment")