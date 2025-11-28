# canvas_downloader/canvas_api.py
from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import logging
import requests

import canvas_downloader.config as config

logger = logging.getLogger(__name__)


def canvas_get(path: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """
    Helper for Canvas GET requests with pagination support.
    If the endpoint returns a list, returns the full list (all pages).
    If it returns an object/dict, returns that object.
    """
    if not path.startswith("/"):
        path = "/" + path

    url = urljoin(config.CANVAS_BASE_URL, path)
    all_results: List[Any] = []
    first = True

    headers = {"Authorization": f"Bearer {config.CANVAS_ACCESS_TOKEN}"}

    while True:
        logger.debug("GET %s params=%s", url, params if first else None)
        resp = requests.get(url, headers=headers, params=params if first else None)
        resp.raise_for_status()
        data = resp.json()

        if isinstance(data, list):
            all_results.extend(data)
        else:
            # Non-list endpoint (e.g. /files/:id)
            return data

        link_header = resp.headers.get("Link", "")
        next_url: Optional[str] = None
        if link_header:
            parts = link_header.split(",")
            for part in parts:
                section = part.strip().split(";")
                if len(section) < 2:
                    continue
                url_part = section[0].strip()
                rel_part = section[1].strip()
                if rel_part == 'rel="next"':
                    next_url = url_part.strip("<>")
                    break

        if not next_url:
            break

        url = next_url
        first = False

    return all_results