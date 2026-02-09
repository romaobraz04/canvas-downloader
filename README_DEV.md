# Canvas Downloader - Developer Documentation

This document covers architecture, configuration, and development workflow.

## Local Run
1. Install dependencies:
```bash
python -m pip install python-dotenv requests matplotlib
```
2. GUI mode:
```bash
python -m canvas_downloader
```
3. CLI mode:
```bash
python -m canvas_downloader --cli
```

## Project Structure
```
canvas-downloader/
|-- main.py
|-- README.md
|-- README_DEV.md
|-- build_exe.ps1
|-- .gitignore
|-- .env.example
|-- .github/workflows/release-exe.yml
|-- canvas_downloader/
|   |-- __init__.py
|   |-- __main__.py
|   |-- config.py
|   |-- canvas_api.py
|   |-- downloader.py
|   |-- ui.py
|   |-- assets/
```

## Configuration System
- The GUI writes `.env` in the repo root.
- `config.py` loads `.env` via `python-dotenv`.
- Validation for `CANVAS_BASE_URL` and `CANVAS_ACCESS_TOKEN` happens when `sync()` runs, so the GUI can open without a `.env`.

Key variables:
- `CANVAS_BASE_URL` (currently fixed to `https://canvas.eur.nl/` in the GUI)
- `CANVAS_ACCESS_TOKEN`
- `DOWNLOAD_ROOT`
- `UPDATE_ONLY`
- `ONLY_COURSES` (course codes like `FEB22009`)
- `EXCLUDED` (course codes)
- `FACULTY` (`ESE` enables block grouping)
- `GROUP_BY_BLOCKS`
- `BLOK*` (course codes per block)
- `DISABLE_BLOCKS`

## ESE Block Logic
Applied only when:
```env
FACULTY=ESE
GROUP_BY_BLOCKS=true
```
Behavior order:
1. Skip `EXCLUDED`
2. Apply `ONLY_COURSES` whitelist
3. Detect course block
4. Skip block if in `DISABLE_BLOCKS`
5. Download modules and files

## UI Notes
- `ui.py` uses Tkinter.
- Access token tutorial includes screenshots in `canvas_downloader/assets/`.
- The "What is a course code?" section uses `course.png`.
- The download destination section warns against using `Documents` due to common write restrictions.

## Windows .exe Packaging
### Local build
```bash
./build_exe.ps1
```
Outputs `canvas-downloader-windows.zip` containing the `.exe` and `.env.example`.

### GitHub Releases
Workflow: `.github/workflows/release-exe.yml`
- Triggers on tag pushes `v*`.
- Builds on `windows-latest`.
- Uploads `canvas-downloader-windows.zip` to the Release.

## Release Flow
1. Tag a release:
```bash
git tag v1.0.0
git push origin v1.0.0
```
2. GitHub Actions builds and uploads the zip to Releases.
