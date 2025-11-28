# Canvas Course File Downloader

A simple tool that downloads course files from your Canvas LMS account and saves them into organized folders.  
Works for any university that uses Canvas.  
No coding required — just install, create a `.env`, and run.

---

## 1. Installation

Install using pip:

```bash
pip install canvas-downloader
```

Then run:

```bash
python -m canvas_downloader
```

---

## 2. Getting Your Canvas API Token

Canvas requires an API token for external tools.

Inside Canvas:

1. Log into Canvas using your university’s Canvas URL  
   (e.g., `https://eur.instructure.com`, `https://youruni.instructure.com`)

2. Left sidebar → **Account**

3. Click **Settings**

4. Scroll to **Approved Integrations** or **Access Tokens**

5. Click **+ New Access Token** (or “Generate Token”)

6. Give it a name (e.g. “canvas-downloader”)

7. Click **Generate Token**

8. Canvas will show the token **once** → copy it immediately

You will paste this into your `.env` file.

---

## 3. Create Your `.env` File

In the folder where you will run the downloader, create a file named:

```
.env
```

with:

```env
# Canvas connection
CANVAS_BASE_URL=https://youruniversity.instructure.com
CANVAS_ACCESS_TOKEN=PASTE_YOUR_TOKEN_HERE

# Where downloaded files should be saved
DOWNLOAD_ROOT=/path/to/save/files

# Faculty (optional)
# Only set FACULTY=ESE if you are at Erasmus School of Economics.
# All other universities/faculties leave this empty.
FACULTY=

# ESE only: enable BLOK grouping
GROUP_BY_BLOCKS=false

# Only download new files? (recommended)
UPDATE_ONLY=true

# ESE-only: manual BLOK mappings
BLOK1=
BLOK2=
BLOK3=

# OPTIONAL: skip entire blocks (comma-separated)
# Example: DISABLE_BLOCKS=BLOK1
DISABLE_BLOCKS=

# OPTIONAL: skip specific courses entirely
EXCLUDED=

# OPTIONAL: only download these specific courses
# (course_code or sis_course_id)
ONLY_COURSES=
```

---

## 4. ESE-Only Features

If you are at **Erasmus School of Economics**, you may enable block grouping:

```env
FACULTY=ESE
GROUP_BY_BLOCKS=true
```

Then assign courses to blocks manually:

```env
BLOK1=FEB22002X|2025, FEB21011S|2025
BLOK2=FEB22008X|2025
BLOK3=
```

### Disable entire blocks (useful later in the year)

For example, while you are in BLOK2:

```env
DISABLE_BLOCKS=BLOK1
```

You can disable multiple blocks:

```env
DISABLE_BLOCKS=BLOK1, BLOK2
```

---

## 5. Running the Downloader

Run:

```bash
python -m canvas_downloader
```

It will:

1. Read your `.env`  
2. Fetch your active Canvas courses  
3. Show course identifiers  
4. Skip `EXCLUDED` courses  
5. Skip entire `DISABLE_BLOCKS`  
6. Group into BLOKs only if ESE mode is enabled  
7. Download files from all modules  
8. Skip existing files if `UPDATE_ONLY=true`

---

## 6. Choosing Specific Courses Only

Instead of mapping everything or excluding past courses, you may select only the courses you care about:

```env
ONLY_COURSES=FEB22008X|2025, FEB21020X|2025
```

The script will download **only these** courses.

---

## 7. Updating Frequently

Just re-run:

```bash
python -m canvas_downloader
```

If `UPDATE_ONLY=true`, only new files are downloaded.

---

## 8. Safety Notes

- `.env` contains your Canvas token → **keep it private**  
- Never commit `.env`  
- If your token leaks, disable it in Canvas immediately  

Happy downloading 📚