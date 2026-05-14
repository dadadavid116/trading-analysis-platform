"""
routers/news.py — Crypto news feed endpoint.

Fetches and merges RSS feeds from CoinTelegraph and CoinDesk,
returns the most recent articles as JSON.
"""

import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/news", tags=["news"])

RSS_SOURCES = [
    ("CoinTelegraph", "https://cointelegraph.com/rss"),
    ("CoinDesk",      "https://www.coindesk.com/arc/outboundfeeds/rss/"),
]

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def _parse_feed(source: str, xml_text: str) -> list:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    channel = root.find("channel")
    if channel is None:
        return []

    items = []
    for item in channel.findall("item"):
        title   = _strip_html(item.findtext("title", "") or "")
        url     = (item.findtext("link", "") or "").strip()
        pub_raw = (item.findtext("pubDate", "") or "").strip()
        desc    = _strip_html(item.findtext("description", "") or "")[:220]

        # Parse RFC-2822 date → ISO 8601
        try:
            published = parsedate_to_datetime(pub_raw).isoformat()
        except Exception:
            published = ""

        if title and url:
            items.append({
                "title":     title,
                "url":       url,
                "published": published,
                "summary":   desc,
                "source":    source,
            })

    return items


@router.get("/feed")
async def get_news_feed(
    limit: int = Query(40, ge=1, le=100, description="Max articles to return"),
):
    """
    Return merged crypto news from CoinTelegraph and CoinDesk RSS feeds,
    sorted newest-first.
    """
    all_items: List[dict] = []

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for source, url in RSS_SOURCES:
            try:
                resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                resp.raise_for_status()
                all_items.extend(_parse_feed(source, resp.text))
            except Exception:
                continue

    if not all_items:
        raise HTTPException(status_code=502, detail="Could not fetch news from any source")

    # Sort newest-first; items without dates go to the end
    all_items.sort(key=lambda x: x["published"], reverse=True)
    return all_items[:limit]
