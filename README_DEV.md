# Canvas Downloader — Developer Documentation

This document describes the architecture, package structure, and development workflow.

⚠️ **Note:**  
The package is **not yet published on PyPI**.  
During development, it is installed locally using:

```
pip install -e .
```

Once the package is stable, a PyPI release will be prepared.

---

# 1. Overview

Canvas Downloader retrieves module files from courses in the Canvas LMS.

Features include:

- Course and module discovery
- File downloading + incremental mode
- Optional ESE-period grouping
- Skip entire blocks (DISABLE_BLOCKS)
- Whitelist mode (ONLY_COURSES)
- Exclusion lists
- `.env` configuration

Designed to later support a GUI and PyPI release.

---

# 2. Local Installation (development)

Clone the repository:

```
git clone https://github.com/yourusername/canvas-downloader.git
```

Install in editable mode:

```
pip install -e .
```

Run the package:

```
python -m canvas_downloader
```

---

# 3. Package Structure

```
canvas-downloader/
├── main.py
├── README.md
├── README_DEV.md
├── .gitignore
├── .env.example
└── canvas_downloader/
    ├── __init__.py
    ├── __main__.py
    ├── config.py
    ├── canvas_api.py
    └── downloader.py
```

This matches the structure needed for a future PyPI release.

---

# 4. Configuration System

Configuration is stored in `.env`, loaded by `config.py`.

### Key environment variables

| Variable | Purpose |
|---------|---------|
| `CANVAS_BASE_URL` | Canvas instance URL |
| `CANVAS_ACCESS_TOKEN` | API token |
| `DOWNLOAD_ROOT` | Folder for files |
| `FACULTY` | Enables faculty-specific logic (`ESE`) |
| `GROUP_BY_BLOCKS` | Enable BLOK grouping |
| `DISABLE_BLOCKS` | Skip entire blocks |
| `UPDATE_ONLY` | Skip existing files |
| `BLOK*` | Block → course mappings |
| `EXCLUDED` | Skip courses |
| `ONLY_COURSES` | Only process selected courses |

---

# 5. BLOK System (ESE Students Only)

Only used when:

```
FACULTY=ESE
GROUP_BY_BLOCKS=true
```

Because Canvas does not expose periods in its API, the user must manually map course identifiers to blocks:

```
BLOK1=FEB22002X|2025
BLOK2=FEB22008X|2025
```

### Block disabling

Users can skip entire blocks:

```
DISABLE_BLOCKS=BLOK1
```

### Behavior order

1. Skip `EXCLUDED`  
2. Apply `ONLY_COURSES`  
3. Detect course block  
4. Skip block if in `DISABLE_BLOCKS`  
5. Continue processing  

---

# 6. Download Logic

`sync()` performs:

1. Load config  
2. Fetch active courses (`/api/v1/courses`)  
3. Filter exclusions/whitelist/disabled blocks  
4. Fetch modules (`/api/v1/courses/:id/modules`)  
5. Fetch module items  
6. Download file items  
7. Skip existing files if `UPDATE_ONLY=true`  

Pagination handled by `canvas_api.py`.

---

# 7. Project Goals

Future work includes:

- PyPI release  
- GUI setup wizard  
- Faculty presets (RSM BTBa/b, ESHCC trimesters)  
- Auto-detection for block structures  
- Progress bar UI  
- Logging refinements  

---

# 8. Contributing

1. Fork the repository  
2. Install locally (`pip install -e .`)  
3. Add new features with small, modular code changes  
4. Follow PEP8 + type hints  
5. Submit PRs with clear descriptions  

---

# 9. License

MIT (or to be chosen by repository owner)