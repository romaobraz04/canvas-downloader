# Canvas Course File Downloader

A simple tool that downloads course files from your Canvas LMS account and saves them into organized folders.  
Works for any university that uses Canvas.

⚠️ **Note:**  
This tool is **not yet published on PyPI**.  
During development, you install it **locally** following the instructions below.

A future version will support:

```
pip install canvas-downloader
```

---

## 1. Installation (local development version)

1. Clone or download this repository:

```
git clone https://github.com/yourusername/canvas-downloader.git
```

2. Open the folder:

```
cd canvas-downloader
```

3. Install locally in “editable” mode:

```
pip install -e .
```

This makes the package importable and provides:

```
python -m canvas_downloader
```

---

## 2. Get Your Canvas API Token

Canvas requires an API token for external tools.

Inside Canvas:

1. Log into your university’s Canvas  
2. Left sidebar → **Account**  
3. Choose **Settings**  
4. Scroll to **Approved Integrations** or **Access Tokens**  
5. Click **+ New Access Token**  
6. Give it a name  
7. Click **Generate Token**  
8. Copy the token (you will only see it once)

Paste this into your `.env` file (see below).

---

## 3. Create Your `.env` File

Create a file named `.env` in the root folder:

```env
CANVAS_BASE_URL=https://youruniversity.instructure.com
CANVAS_ACCESS_TOKEN=PASTE_TOKEN_HERE

# Where downloaded files should be saved
DOWNLOAD_ROOT=/path/to/folder

# Enable ESE-specific block grouping
FACULTY=
GROUP_BY_BLOCKS=false

UPDATE_ONLY=true

# ESE-only: course mappings
BLOK1=
BLOK2=
BLOK3=

# Disable entire blocks (e.g. past blocks)
DISABLE_BLOCKS=

# Skip specific courses
EXCLUDED=

# Only download these specific courses (optional)
ONLY_COURSES=
```

---

## 4. For Erasmus School of Economics (ESE students only)

To enable ESE block grouping:

```env
FACULTY=ESE
GROUP_BY_BLOCKS=true
```

Fill the block mappings:

```env
BLOK1=COURSEID1, COURSEID2
BLOK2=...
BLOK3=...
```

Disable past blocks:

```env
DISABLE_BLOCKS=BLOK1
```

---

## 5. Running the Downloader

From the project root:

```bash
python -m canvas_downloader
```

This will:

- Load `.env`
- Fetch active courses
- Skip blocks listed in `DISABLE_BLOCKS`
- Skip courses in `EXCLUDED`
- Apply whitelist if `ONLY_COURSES` is set
- Download new files (if `UPDATE_ONLY=true`)

---

## 6. Updating

Just run the same command again:

```bash
python -m canvas_downloader
```

Only new files will be downloaded if `UPDATE_ONLY=true`.

---

## 7. Safety

- Never commit `.env`  
- Keep your Canvas token private  
- Revoke your token immediately if exposed  

A GUI setup wizard and PyPI release are planned for future versions.

Happy downloading 📚