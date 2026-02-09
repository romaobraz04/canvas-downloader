from __future__ import annotations

import logging
import os
import re
import sys
import threading
import traceback
from pathlib import Path
from typing import Dict, Iterable, List

import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

try:
    from dotenv import dotenv_values, load_dotenv
except Exception:  # pragma: no cover - fallback if dotenv is unavailable
    dotenv_values = None
    load_dotenv = None


CANVAS_BASE_URL = "https://canvas.eur.nl/"


def _app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _assets_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "canvas_downloader" / "assets"
    return Path(__file__).resolve().parent / "assets"


PROJECT_ROOT = _app_root()
ENV_PATH = PROJECT_ROOT / ".env"
ENV_EXAMPLE_PATH = PROJECT_ROOT / ".env.example"
ASSETS_DIR = _assets_root()


def _read_env_values() -> Dict[str, str]:
    source = (
        ENV_PATH
        if ENV_PATH.exists()
        else ENV_EXAMPLE_PATH if ENV_EXAMPLE_PATH.exists() else None
    )
    if not source:
        return {}

    if dotenv_values is None:
        values: Dict[str, str] = {}
        for line in source.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            value = value.strip()
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]
            else:
                if " #" in value:
                    value = value.split(" #", 1)[0].strip()
            values[key.strip()] = value
        return values

    values = dotenv_values(source)
    cleaned: Dict[str, str] = {}
    for key, value in values.items():
        if value is not None:
            cleaned[str(key)] = str(value)
    return cleaned


def _bool_from_env(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _format_bool(value: bool) -> str:
    return "true" if value else "false"


def _safe_get(values: Dict[str, str], key: str, fallback: str = "") -> str:
    return (values.get(key) or fallback).strip()


def _find_block_numbers(values: Dict[str, str]) -> List[int]:
    numbers: List[int] = []
    for key in values.keys():
        match = re.match(r"^BLOK(\d+)$", key.strip().upper())
        if match:
            numbers.append(int(match.group(1)))
    default = {1, 2, 3, 4, 5}
    if numbers:
        return sorted(set(numbers) | default)
    return sorted(default)


def _show_fatal_error(message: str) -> None:
    try:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Canvas Downloader Error", message)
        root.destroy()
    except Exception:
        print(message, file=sys.stderr)


def _write_fatal_log(exc: Exception) -> None:
    try:
        log_path = PROJECT_ROOT / "canvas_downloader_error.log"
        log_path.write_text(traceback.format_exc(), encoding="utf-8")
    except Exception:
        pass


def _toggle_section(button: ttk.Button, body: ttk.Frame) -> None:
    if body.winfo_ismapped():
        body.pack_forget()
        button.configure(text="> Show")
    else:
        body.pack(fill="x", padx=12, pady=(0, 12))
        button.configure(text="v Hide")


class _TextHandler(logging.Handler):
    def __init__(self, widget: tk.Text) -> None:
        super().__init__()
        self.widget = widget
        self.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        msg = self.format(record)

        def append() -> None:
            self.widget.configure(state="normal")
            self.widget.insert("end", msg + "\n")
            self.widget.see("end")
            self.widget.configure(state="disabled")

        self.widget.after(0, append)


def run_ui() -> None:
    try:
        _run_ui()
    except Exception as exc:  # pragma: no cover - fatal startup errors
        _write_fatal_log(exc)
        _show_fatal_error(
            "The app ran into a problem and had to close.\n\n"
            "A log file was written next to the app:\n"
            "canvas_downloader_error.log"
        )


def _run_ui() -> None:
    env_values = _read_env_values()
    block_numbers = _find_block_numbers(env_values)

    root = tk.Tk()
    root.title("Canvas Downloader - Erasmus University Rotterdam")
    root.geometry("960x900")

    container = ttk.Frame(root)
    container.pack(fill="both", expand=True)

    canvas = tk.Canvas(container, borderwidth=0, highlightthickness=0)
    scrollbar = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
    scrollable = ttk.Frame(canvas)

    scroll_window = canvas.create_window((0, 0), window=scrollable, anchor="nw")
    canvas.configure(yscrollcommand=scrollbar.set)

    canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    def _on_frame_configure(_: tk.Event) -> None:
        canvas.configure(scrollregion=canvas.bbox("all"))

    def _on_canvas_configure(event: tk.Event) -> None:
        canvas.itemconfigure(scroll_window, width=event.width)

    scrollable.bind("<Configure>", _on_frame_configure)
    canvas.bind("<Configure>", _on_canvas_configure)

    def _on_mousewheel(event: tk.Event) -> None:
        canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    canvas.bind_all("<MouseWheel>", _on_mousewheel)

    title = ttk.Label(
        scrollable,
        text="Canvas Downloader",
        font=("Segoe UI", 18, "bold"),
    )
    title.pack(anchor="w", padx=16, pady=(16, 4))

    subtitle = ttk.Label(
        scrollable,
        text="Erasmus University Rotterdam (Canvas URL is fixed for now)",
        font=("Segoe UI", 11),
    )
    subtitle.pack(anchor="w", padx=16, pady=(0, 12))

    url_frame = ttk.Frame(scrollable)
    url_frame.pack(fill="x", padx=16, pady=(0, 16))
    ttk.Label(url_frame, text="Canvas Base URL:").pack(side="left")
    ttk.Label(url_frame, text=CANVAS_BASE_URL, font=("Segoe UI", 10, "bold")).pack(
        side="left", padx=(8, 0)
    )

    tutorial_frame = ttk.LabelFrame(
        scrollable, text="How to Create a Canvas Access Token"
    )
    tutorial_frame.pack(fill="x", padx=16, pady=(0, 16))
    tutorial_toggle = ttk.Button(
        tutorial_frame,
        text="v Hide",
        command=lambda: _toggle_section(tutorial_toggle, tutorial_body),
    )
    tutorial_toggle.pack(anchor="e", padx=12, pady=(8, 0))
    tutorial_body = ttk.Frame(tutorial_frame)
    tutorial_body.pack(fill="x", padx=12, pady=(0, 12))
    tutorial_text = (
        "In Canvas, go to 'Account' -> 'Approved integrations' -> hit 'New access token' -> "
        "write a purpose (e.g. download course files automatically) -> pick an expiration date "
        "(max is 120 days from now; you will have to regenerate a token when that day comes)."
    )
    ttk.Label(tutorial_body, text=tutorial_text, wraplength=880, justify="left").pack(
        anchor="w", pady=(8, 12)
    )

    image_refs: List[tk.PhotoImage] = []

    def _add_image(filename: str, caption: str, parent: tk.Misc | None = None) -> None:
        if parent is None:
            parent = tutorial_body
        path = ASSETS_DIR / filename
        if not path.exists():
            ttk.Label(parent, text=f"[Missing image: {filename}]").pack(
                anchor="w", pady=4
            )
            return
        try:
            img = tk.PhotoImage(file=str(path))
        except tk.TclError:
            ttk.Label(parent, text=f"[Could not load image: {filename}]").pack(
                anchor="w", pady=4
            )
            return

        max_width = 860
        if img.width() > max_width:
            factor = max(1, (img.width() + max_width - 1) // max_width)
            img = img.subsample(factor, factor)

        label = ttk.Label(parent, image=img)
        label.image = img
        image_refs.append(img)
        label.pack(anchor="w", pady=(0, 4))
        ttk.Label(parent, text=caption, font=("Segoe UI", 9)).pack(
            anchor="w", pady=(0, 12)
        )

    _add_image("approved_integrations.png", "Approved integrations menu")
    _add_image("new_access_token.png", "Create a new access token")
    _add_image("token.png", "Copy the generated token")

    token_frame = ttk.LabelFrame(scrollable, text="Canvas Access Token")
    token_frame.pack(fill="x", padx=16, pady=(0, 16))
    token_var = tk.StringVar(value=_safe_get(env_values, "CANVAS_ACCESS_TOKEN"))
    token_entry = ttk.Entry(token_frame, textvariable=token_var, show="*")
    token_entry.pack(fill="x", padx=12, pady=(8, 4))

    show_token = tk.BooleanVar(value=False)

    def _toggle_token() -> None:
        token_entry.configure(show="" if show_token.get() else "*")

    ttk.Checkbutton(
        token_frame, text="Show token", variable=show_token, command=_toggle_token
    ).pack(anchor="w", padx=12, pady=(0, 8))

    download_frame = ttk.LabelFrame(scrollable, text="Download Destination")
    download_frame.pack(fill="x", padx=16, pady=(0, 16))
    download_var = tk.StringVar(
        value=_safe_get(env_values, "DOWNLOAD_ROOT", "./Courses")
    )
    download_row = ttk.Frame(download_frame)
    download_row.pack(fill="x", padx=12, pady=8)
    download_entry = ttk.Entry(download_row, textvariable=download_var)
    download_entry.pack(side="left", fill="x", expand=True)

    def _choose_directory() -> None:
        selected = filedialog.askdirectory(title="Choose download folder")
        if selected:
            download_var.set(selected)

    ttk.Button(download_row, text="Browse...", command=_choose_directory).pack(
        side="left", padx=(8, 0)
    )
    ttk.Label(
        download_frame,
        text="Recommendation: avoid choosing a folder inside Documents. Some systems block write access there.",
        wraplength=880,
        justify="left",
    ).pack(anchor="w", padx=12, pady=(0, 10))

    course_code_frame = ttk.LabelFrame(scrollable, text="What Is a Course Code?")
    course_code_frame.pack(fill="x", padx=16, pady=(0, 16))
    course_toggle = ttk.Button(
        course_code_frame,
        text="v Hide",
        command=lambda: _toggle_section(course_toggle, course_body),
    )
    course_toggle.pack(anchor="e", padx=12, pady=(8, 0))
    course_body = ttk.Frame(course_code_frame)
    course_body.pack(fill="x", padx=12, pady=(0, 12))
    ttk.Label(
        course_body,
        text="Use course codes (e.g. FEB22009) for Only/Exclude/BLOK settings.",
        wraplength=880,
        justify="left",
    ).pack(anchor="w", pady=(8, 6))
    _add_image("course.png", "Course code example shown in Canvas", parent=course_body)

    options_frame = ttk.LabelFrame(scrollable, text="Download Options")
    options_frame.pack(fill="x", padx=16, pady=(0, 16))

    update_only_var = tk.BooleanVar(
        value=_bool_from_env(env_values.get("UPDATE_ONLY"), True)
    )
    ttk.Checkbutton(
        options_frame,
        text="Skip files that already exist (update only)",
        variable=update_only_var,
    ).pack(anchor="w", padx=12, pady=(8, 4))

    only_courses_var = tk.StringVar(value=_safe_get(env_values, "ONLY_COURSES"))
    ttk.Label(
        options_frame,
        text="Only these courses (comma-separated course codes, e.g. FEB22009):",
    ).pack(anchor="w", padx=12, pady=(8, 2))
    ttk.Entry(options_frame, textvariable=only_courses_var).pack(
        fill="x", padx=12, pady=(0, 6)
    )

    excluded_var = tk.StringVar(value=_safe_get(env_values, "EXCLUDED"))
    ttk.Label(
        options_frame, text="Exclude these courses (comma-separated course codes):"
    ).pack(anchor="w", padx=12, pady=(4, 2))
    ttk.Entry(options_frame, textvariable=excluded_var).pack(
        fill="x", padx=12, pady=(0, 8)
    )

    faculty_var = tk.StringVar(value=_safe_get(env_values, "FACULTY"))
    faculty_frame = ttk.Frame(options_frame)
    faculty_frame.pack(fill="x", padx=12, pady=(2, 8))
    ttk.Label(faculty_frame, text="Faculty:").pack(side="left")
    faculty_combo = ttk.Combobox(
        faculty_frame, textvariable=faculty_var, state="readonly", width=10
    )
    faculty_combo["values"] = ("", "ESE")
    faculty_combo.pack(side="left", padx=(8, 0))

    ese_frame = ttk.LabelFrame(scrollable, text="ESE Block Settings (Faculty = ESE)")
    ese_frame.pack(fill="x", padx=16, pady=(0, 16))

    group_by_blocks_var = tk.BooleanVar(
        value=_bool_from_env(env_values.get("GROUP_BY_BLOCKS"), False)
    )
    ttk.Checkbutton(
        ese_frame, text="Group courses into BLOK folders", variable=group_by_blocks_var
    ).pack(anchor="w", padx=12, pady=(8, 6))
    ttk.Label(
        ese_frame,
        text="Enter course codes for each block, e.g. FEB22009 (comma-separated), replace with your actual course codes.",
        wraplength=880,
        justify="left",
    ).pack(anchor="w", padx=12, pady=(0, 6))

    block_vars: Dict[int, tk.StringVar] = {}
    for block_number in block_numbers:
        key = f"BLOK{block_number}"
        block_var = tk.StringVar(value=_safe_get(env_values, key))
        block_vars[block_number] = block_var
        row = ttk.Frame(ese_frame)
        row.pack(fill="x", padx=12, pady=2)
        ttk.Label(row, text=key, width=7).pack(side="left")
        ttk.Entry(row, textvariable=block_var).pack(side="left", fill="x", expand=True)

    ttk.Label(
        ese_frame, text="Disabled blocks (comma-separated, e.g. BLOK1, BLOK3):"
    ).pack(anchor="w", padx=12, pady=(8, 2))
    disabled_blocks_var = tk.StringVar(value=_safe_get(env_values, "DISABLE_BLOCKS"))
    ttk.Entry(ese_frame, textvariable=disabled_blocks_var).pack(
        fill="x", padx=12, pady=(0, 10)
    )

    status_var = tk.StringVar(value="")
    status_label = ttk.Label(scrollable, textvariable=status_var, foreground="green")
    status_label.pack(anchor="w", padx=16, pady=(0, 8))

    log_frame = ttk.LabelFrame(scrollable, text="Activity Log")
    log_frame.pack(fill="both", expand=True, padx=16, pady=(0, 16))
    log_text = scrolledtext.ScrolledText(log_frame, height=12, state="disabled")
    log_text.pack(fill="both", expand=True, padx=8, pady=8)

    def _refresh_ese_visibility() -> None:
        is_ese = faculty_var.get().strip().upper() == "ESE"
        if is_ese:
            ese_frame.pack(fill="x", padx=16, pady=(0, 16), before=status_label)
        else:
            ese_frame.pack_forget()
            group_by_blocks_var.set(False)

    faculty_combo.bind("<<ComboboxSelected>>", lambda _: _refresh_ese_visibility())
    _refresh_ese_visibility()

    def _build_env_map() -> Dict[str, str]:
        env_map: Dict[str, str] = {
            "CANVAS_BASE_URL": CANVAS_BASE_URL,
            "CANVAS_ACCESS_TOKEN": token_var.get().strip(),
            "DOWNLOAD_ROOT": download_var.get().strip(),
            "UPDATE_ONLY": _format_bool(update_only_var.get()),
            "ONLY_COURSES": only_courses_var.get().strip(),
            "EXCLUDED": excluded_var.get().strip(),
            "FACULTY": faculty_var.get().strip().upper(),
            "GROUP_BY_BLOCKS": _format_bool(group_by_blocks_var.get()),
            "DISABLE_BLOCKS": disabled_blocks_var.get().strip().upper(),
        }
        for block_number, var in block_vars.items():
            env_map[f"BLOK{block_number}"] = var.get().strip()
        return env_map

    def _write_env_file(env_map: Dict[str, str]) -> None:
        lines: List[str] = [
            "# Canvas connection",
            f"CANVAS_BASE_URL={env_map['CANVAS_BASE_URL']}",
            f"CANVAS_ACCESS_TOKEN={env_map['CANVAS_ACCESS_TOKEN']}",
            "",
            "# Where to store downloads",
            f"DOWNLOAD_ROOT={env_map['DOWNLOAD_ROOT']}",
            "",
            "# Whether to skip existing files (true/false)",
            f"UPDATE_ONLY={env_map['UPDATE_ONLY']}",
            "",
            "# OPTIONAL: Only download these courses (whitelist)",
            f"ONLY_COURSES={env_map['ONLY_COURSES']}",
            "",
            "# Courses to exclude from downloading (comma-separated)",
            f"EXCLUDED={env_map['EXCLUDED']}",
            "",
            "# Faculty code (optional)",
            f"FACULTY={env_map['FACULTY']}",
            "",
            "# Whether to group courses into BLOK folders (ESE only)",
            f"GROUP_BY_BLOCKS={env_map['GROUP_BY_BLOCKS']}",
            "",
            "# ESE-only: Block -> course codes (comma-separated)",
        ]

        for block_number in block_numbers:
            key = f"BLOK{block_number}"
            lines.append(f"{key}={env_map.get(key, '')}")

        lines.extend(
            [
                "",
                "# Disable entire blocks (comma-separated, optional)",
                f"DISABLE_BLOCKS={env_map['DISABLE_BLOCKS']}",
                "",
            ]
        )

        ENV_PATH.write_text("\n".join(lines), encoding="utf-8")

    def _validate_inputs(env_map: Dict[str, str]) -> bool:
        if not env_map["CANVAS_ACCESS_TOKEN"]:
            messagebox.showerror(
                "Missing token", "Please paste your Canvas access token."
            )
            return False
        if not env_map["DOWNLOAD_ROOT"]:
            messagebox.showerror(
                "Missing download folder",
                "Please choose a download destination folder.",
            )
            return False
        return True

    def _save_settings() -> Dict[str, str] | None:
        env_map = _build_env_map()
        if not _validate_inputs(env_map):
            return None
        _write_env_file(env_map)
        status_var.set("Settings saved to .env")
        return env_map

    button_row = ttk.Frame(scrollable)
    button_row.pack(fill="x", padx=16, pady=(0, 16))

    def _start_download() -> None:
        env_map = _save_settings()
        if env_map is None:
            return

        status_var.set("Starting download...")
        run_button.configure(state="disabled")

        def worker() -> None:
            try:
                if load_dotenv is not None:
                    load_dotenv(dotenv_path=ENV_PATH, override=True)
                else:
                    os.environ.update(env_map)

                root_logger = logging.getLogger()
                root_logger.setLevel(logging.INFO)
                if not any(isinstance(h, _TextHandler) for h in root_logger.handlers):
                    root_logger.addHandler(_TextHandler(log_text))

                from canvas_downloader import sync

                sync(update_only=update_only_var.get())
                root.after(0, lambda: status_var.set("Download complete."))
            except RuntimeError as exc:  # pragma: no cover - runtime errors displayed in UI
                message = str(exc)
                if "Set CANVAS_BASE_URL and CANVAS_ACCESS_TOKEN" in message:
                    root.after(
                        0,
                        lambda: messagebox.showerror(
                            "Missing Canvas Settings",
                            "Please enter your Canvas access token and save settings before downloading.",
                        ),
                    )
                    root.after(
                        0, lambda: status_var.set("Missing settings. Please save first.")
                    )
                else:
                    logging.exception("Download failed: %s", exc)
                    root.after(
                        0,
                        lambda: status_var.set(
                            "Download failed. See log for details."
                        ),
                    )
            except Exception as exc:  # pragma: no cover - runtime errors displayed in UI
                logging.exception("Download failed: %s", exc)
                root.after(
                    0, lambda: status_var.set("Download failed. See log for details.")
                )
            finally:
                root.after(0, lambda: run_button.configure(state="normal"))

        threading.Thread(target=worker, daemon=True).start()

    ttk.Button(button_row, text="Save Settings", command=_save_settings).pack(
        side="left"
    )
    run_button = ttk.Button(
        button_row, text="Save and Download", command=_start_download
    )
    run_button.pack(side="left", padx=(8, 0))

    root.mainloop()


if __name__ == "__main__":
    run_ui()
