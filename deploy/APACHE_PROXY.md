# Use http://localhost (port 80) with SiteChat

If you see **“It works!”**, Apache is answering on port **80**. SiteChat runs on **8000** by default.

## Fastest: use the right URL

Open **http://localhost:8000** (or **http://127.0.0.1:8000**).

## Optional: proxy port 80 → 8000

1. Start SiteChat:

   ```bash
   cd backend && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

2. Enable Apache proxy modules (macOS), then include [`apache-sitechat.conf`](apache-sitechat.conf) — see the comments at the top of that file.

3. Restart Apache: `sudo apachectl restart`

Then **http://localhost** will show SiteChat while Uvicorn runs on 8000.
