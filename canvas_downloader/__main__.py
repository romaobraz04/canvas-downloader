# canvas_downloader/__main__.py
from __future__ import annotations

import logging

from . import sync

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    sync()