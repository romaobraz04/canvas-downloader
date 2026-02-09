# canvas_downloader/__main__.py
from __future__ import annotations

import argparse
import logging


def main() -> None:
    parser = argparse.ArgumentParser(description="Canvas Downloader")
    parser.add_argument(
        "--cli",
        action="store_true",
        help="Run the downloader in CLI mode (no GUI).",
    )
    args = parser.parse_args()

    if args.cli:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
        from . import sync

        sync()
        return

    from .ui import run_ui

    run_ui()


if __name__ == "__main__":
    main()
