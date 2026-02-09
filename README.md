# Canvas Course File Downloader

Download files from your Canvas courses into organized folders. Includes a GUI setup flow with screenshots and ESE-specific block grouping.

**Download (Windows)**
Get the latest `canvas-downloader-windows.zip` from the GitHub Releases page for this repo.

**For non-technical users (recommended)**
1. Go to the GitHub Releases page for this repo.
2. Download `canvas-downloader-windows.zip`.
3. Unzip it anywhere (e.g. Downloads).
4. Double-click `canvas-downloader.exe`.
5. Follow the on-screen setup wizard.

**Quick Start (source)**
1. Clone or download this repository.
2. (Optional) Create and activate a virtual environment.
3. Install dependencies:
```bash
python -m pip install python-dotenv requests matplotlib
```
4. Run the app:
```bash
python -m canvas_downloader
```

**CLI Mode (no GUI)**
```bash
python -m canvas_downloader --cli
```

**Canvas Access Token (summary)**
In Canvas:
1. Account -> Approved integrations
2. New access token
3. Enter a purpose and choose an expiration date
4. Copy the token and paste it into the app

The GUI includes step-by-step screenshots.

**Course Codes**
Use course codes like `FEB22009` for Only/Exclude/BLOK settings. The GUI includes a screenshot showing where to find the course code in Canvas.

**Download Destination Warning**
Recommendation: avoid choosing a folder inside `Documents`. Some systems block write access there. Use something like `C:/Users/youruser/Downloads/Courses` instead.

**ESE Block Grouping**
ESE students can group courses by block:
```env
FACULTY=ESE
GROUP_BY_BLOCKS=true
```
Set block mappings using course codes:
```env
BLOK1=FEB22002X,FEB21011S
BLOK2=FEB22008X,FEB21020X
```
Disable entire blocks:
```env
DISABLE_BLOCKS=BLOK1
```

**Configuration (.env)**
The GUI writes your settings to `.env`. You can also edit it manually if needed.

Example:
```env
CANVAS_BASE_URL=https://canvas.eur.nl/
CANVAS_ACCESS_TOKEN=PASTE_TOKEN_HERE
DOWNLOAD_ROOT=C:/Users/youruser/Downloads/Courses
UPDATE_ONLY=true
ONLY_COURSES=
EXCLUDED=
FACULTY=ESE
GROUP_BY_BLOCKS=true
BLOK1=FEB22002X,FEB21011S
BLOK2=
BLOK3=
DISABLE_BLOCKS=
```

**Build a Windows .exe (for maintainers)**
```bash
./build_exe.ps1
```

**Safety**
- Never commit `.env`.
- Keep your token private and revoke it if exposed.
