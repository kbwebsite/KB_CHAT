from fastapi import APIRouter, Depends, HTTPException
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import success_response
import re

router = APIRouter(prefix="/api", tags=["link-preview"])

@router.post("/link-preview")
def get_link_preview(payload: dict, current_user: User = Depends(get_current_user)):
    url = payload.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL required")
    if not re.match(r'^https?://', url):
        raise HTTPException(status_code=400, detail="Invalid URL")
    try:
        import urllib.request
        import urllib.error
        from html.parser import HTMLParser

        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; KBChat/2.0)"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "text/html" not in content_type:
                return success_response({"url": url, "domain": _get_domain(url), "title": url, "description": "", "image": None})
            html = resp.read(500000).decode("utf-8", errors="ignore")

        from html.parser import HTMLParser
        class OGParser(HTMLParser):
            def __init__(self):
                super().__init__()
                self.title = ""
                self.description = ""
                self.image = ""
                self._in_title = False
                self._og = {}
            def handle_starttag(self, tag, attrs):
                d = dict(attrs)
                if tag == "title":
                    self._in_title = True
                prop = d.get("property", d.get("name", ""))
                if prop.startswith("og:"):
                    self._og[prop[3:]] = d.get("content", "")
            def handle_data(self, data):
                if self._in_title:
                    self.title += data
            def handle_endtag(self, tag):
                if tag == "title":
                    self._in_title = False

        p = OGParser()
        p.feed(html)
        title = p._og.get("title") or p.title or ""
        description = p._og.get("description") or p.description or ""
        image = p._og.get("image") or ""
        if not title:
            t_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
            if t_match:
                title = t_match.group(1).strip()
        if not description:
            d_match = re.search(r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']', html, re.IGNORECASE)
            if d_match:
                description = d_match.group(1).strip()
        if not image:
            i_match = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\'](.*?)["\']', html, re.IGNORECASE)
            if i_match:
                image = i_match.group(1).strip()
        return success_response({
            "url": url,
            "domain": _get_domain(url),
            "title": title[:200],
            "description": description[:500],
            "image": image if image else None,
        })
    except Exception:
        return success_response({"url": url, "domain": _get_domain(url), "title": url, "description": "", "image": None})

def _get_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace("www.", "")
    except:
        return url
