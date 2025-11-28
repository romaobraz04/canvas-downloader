# Canvas Downloader — Developer Documentation

This document explains architecture, project structure, faculty-specific logic, and how to contribute.

For end users, see `README.md`.

---

# 1. Overview

Canvas Downloader is a Python package that retrieves module files from the Canvas LMS REST API.

Features include:

- Module + file retrieval  
- “Update only” incremental mode  
- Optional block/period grouping (ESE only)  
- Skipping entire blocks  
- Whitelisting specific courses  
- Excluding specific courses  
- Fully pip-installable package structure  

The package is designed to support future expansion (e.g., GUI wizard, faculty presets).

---

# 2. Repository Structure

```
canvas-downloader/              ← Repo root
├── main.py                     ← Simple CLI entry point
├── README.md                   ← User-friendly guide
├── README_DEV.md               ← Developer documentation
├── .gitignore
├── .env.example
└── canvas_downloader/          ← Python package
    ├── __init__.py             ← Exports sync() & load_config()
    ├── __main__.py             ← Allows `python -m canvas_downloader`
    ├── config.py               ← Env loader and feature flags
    ├── canvas_api.py           ← REST API + pagination
    └── downloader.py           ← Main sync logic
```

This is a valid PyPI package structure.

---

# 3. Configuration System

Configuration is handled via `.env` using `python-dotenv`.

### Environment variables:

| Variable | Purpose |
|---------|---------|
| `CANVAS_BASE_URL` | Canvas instance base URL |
| `CANVAS_ACCESS_TOKEN` | API token |
| `DOWNLOAD_ROOT` | Where downloads go |
| `FACULTY` | Enables faculty-specific features (`ESE` only for now) |
| `GROUP_BY_BLOCKS` | Toggle block/period grouping (ESE only) |
| `DISABLE_BLOCKS` | Skip entire blocks |
| `UPDATE_ONLY` | Skip existing files during sync |
| `BLOK*` | User-provided ESE block → course mappings |
| `EXCLUDED` | Skip specific courses entirely |
| `ONLY_COURSES` | Whitelist mode (download only these courses) |

---

# 4. ESE-Specific Period Logic (BLOK System)

Only **Erasmus School of Economics** uses the “BLOK1/BLOK2…” structure.  
Canvas does **not** provide period metadata, so user-supplied mapping is required.

### BLOK mode activates **only when**:

```
FACULTY=ESE
GROUP_BY_BLOCKS=true
```

Otherwise:

```
DOWNLOAD_ROOT/CourseName/ModuleName/...
```

is used, with no block grouping.

### Disabling entire blocks

Users can skip entire blocks:

```
DISABLE_BLOCKS=BLOK1, BLOK3
```

Implementation:

1. Course’s block is resolved by `guess_block_for_course()`
2. If its block is in `DISABLE_BLOCKS`, the course is skipped early

### Why keep this architecture?

- It does not assume a universal block system  
- It allows adding presets for other faculties later (RSM BTBa/b, ESHCC trimesters)  
- It remains fully generic for all universities

---

# 5. Course Matching Logic

The script identifies courses using:

- `course_code`
- `sis_course_id`

whichever the user prefers.

### Whitelisting (ONLY_COURSES)

If `ONLY_COURSES` is set, **only** those courses are processed.

### Exclusion (EXCLUDED)

If a course matches either identifier, it is skipped.

### Block disabling

If course’s block ∈ `DISABLE_BLOCKS`, it is skipped.

---

# 6. Download Pipeline

### `sync_all_courses()` overview:

1. Load config and `.env`  
2. Fetch active courses  
3. Log course identifiers  
4. Apply (in order):

   - `EXCLUDED`
   - `ONLY_COURSES`
   - `DISABLE_BLOCKS`
   - faculty-specific BLOK logic

5. Fetch modules  
6. Fetch module items  
7. Download file items  
8. Skip existing files if `UPDATE_ONLY=true`  
9. Write output under `DOWNLOAD_ROOT`  

Pagination is handled centrally in `canvas_api.py`.

---

# 7. Public API

```python
from canvas_downloader import sync, load_config
```

### Functions:

- `sync(update_only=None)`  
- `load_config()`  

CLI Entrypoints:

```bash
python main.py
python -m canvas_downloader
```

---

# 8. Future Development

Planned:

- GUI setup wizard  
- Directory picker for DOWNLOAD_ROOT  
- Course/block manager  
- Period presets for other faculties  
- PyPI release automation  
- Progress bar UI  
- More robust error recovery and retry  

---

# 9. Contribution Guidelines

1. Fork the repository  
2. Install dependencies  
3. Run the CLI locally via `python main.py`  
4. Follow PEP8 + type hints  
5. Keep code modular (no giant functions)  
6. Submit PRs with clear description  

---

# 10. License

MIT (or chosen license)