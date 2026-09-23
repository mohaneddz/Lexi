"""
Fetches public-domain cover art for the built books from Wikimedia Commons.

Each cover is a search for a historical work that fits the book. Only files
Commons lists as public domain are accepted, and the file actually used is
printed so it can be credited in public/books/covers/ATTRIBUTION.md.
Existing covers are left alone; delete one to fetch it again.
"""

from __future__ import annotations

import io
import json
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
COVERS = ROOT / "public" / "books" / "covers"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "LexiBookCovers/1.0 (personal vocabulary app; cover art lookup)"
WIDTH = 960

try:
    # Some Python installs ship an outdated certificate store; certifi's is current.
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

# cover file -> Commons searches, tried in order until one finds a public-domain image.
COVER_SEARCHES = {
    "field-computing.jpg": ["Babbage Difference Engine", "Analytical Engine Babbage", "Jacquard loom punched cards"],
    "field-ai.jpg": ["Kempelen chess Turk automaton", "The Turk chess automaton", "Jaquet-Droz automaton writer"],
    "field-mathematics.jpg": ["Byrne Euclid elements 1847 page"],
    "field-physics.jpg": ["Newton Philosophiae Naturalis Principia Mathematica 1687 title page"],
    "field-chemistry.jpg": ["Lavoisier Traite elementaire de chimie", "Mendeleev periodic table 1869", "alchemist laboratory engraving"],
    "field-business.jpg": ["Inquiry into the Nature and Causes of the Wealth of Nations", "Wealth of Nations title page", "Pacioli Summa de arithmetica"],
    "field-law.jpg": ["Code civil des Français 1804 title page"],
    "general-dictionary.jpg": ["Samuel Johnson Dictionary of the English Language 1755 title page"],
    "cedict.jpg": ["Kangxi Dictionary page"],
    "mono-fr.jpg": ["Dictionnaire de l'Academie francoise 1694", "Dictionnaire de l'Académie française", "Littré Dictionnaire de la langue française"],
    "mono-de.jpg": ["Deutsches Wörterbuch Jacob Grimm", "Grimm Deutsches Wörterbuch", "Adelung Wörterbuch"],
    "mono-es.jpg": ["Diccionario de autoridades", "Tesoro de la lengua castellana Covarrubias", "Nebrija gramatica castellana"],
    "mono-zh.jpg": ["Shuowen Jiezi", "說文解字", "Kangxi Dictionary cover"],
    # Field books that used to borrow the matching WordNet topic book's cover.
    "field-zoology.jpg": ["Audubon Wild Turkey Birds of America plate 1", "Audubon Carolina Parakeet plate", "Audubon Snowy Owl plate"],
    "field-astronomy.jpg": ["Sidereus Nuncius moon Galileo", "Galileo moon drawings 1610"],
    "field-medicine.jpg": ["Albinus Tabulae sceleti rhinoceros", "Albinus skeleton rhinoceros Wandelaar", "Gray Anatomy 1918 heart plate"],
    "field-botany.jpg": ["Hooke Micrographia cork", "Micrographia Hooke plate"],
    # One cover per book where several used to share a single image or template.
    "swadesh.jpg": ["Pieter Bruegel Tower of Babel Vienna", "Tower of Babel Bruegel"],
    "trans-countries.jpg": ["1744 Bowen Map of the World in Hemispheres"],
    "wordnet-nouns.jpg": ["Orbis Pictus Comenius page", "Orbis sensualium pictus"],
    "wordnet-verbs.jpg": ["Muybridge The Horse in Motion 1878", "Muybridge horse in motion"],
    "wordnet-adjectives.jpg": ["Goethe Farbenkreis 1809", "Goethe color wheel"],
    "wordnet-adverbs.jpg": ["Huygens Horologium Oscillatorium clock", "Huygens pendulum clock drawing"],
    "topic-nature.jpg": ["The Great Wave off Kanagawa Hokusai", "Great Wave Kanagawa"],
    "topic-substances.jpg": ["Agricola De re metallica woodcut", "De re metallica Agricola"],
}

# Scans that carry a website watermark along the bottom edge: the share of
# the height to crop off.
CROP_BOTTOM = {"cedict.jpg": 0.045}

PUBLIC_DOMAIN = ("public domain", "pd-", "cc0", "pd ")


def open_url(url: str):
    """Opens a URL, pausing between requests and backing off when Commons rate-limits."""
    for attempt in range(5):
        time.sleep(1.5)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            return urllib.request.urlopen(request, context=SSL_CONTEXT)
        except urllib.error.HTTPError as error:
            if error.code != 429 or attempt == 4:
                raise
            time.sleep(10 * (attempt + 1))
    raise RuntimeError("unreachable")


def api(params: dict) -> dict:
    query = urllib.parse.urlencode({**params, "format": "json"})
    with open_url(f"{API}?{query}") as response:
        return json.load(response)


def candidates(search: str) -> list[dict]:
    result = api({
        "action": "query",
        "generator": "search",
        "gsrsearch": f"{search} filetype:bitmap",
        "gsrnamespace": 6,
        "gsrlimit": 12,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": WIDTH,
    })
    pages = sorted((result.get("query") or {}).get("pages", {}).values(), key=lambda page: page.get("index", 0))
    usable = []
    for page in pages:
        info = (page.get("imageinfo") or [{}])[0]
        license_name = ((info.get("extmetadata") or {}).get("LicenseShortName") or {}).get("value", "")
        if not license_name.lower().startswith(PUBLIC_DOMAIN):
            continue
        if info.get("width", 0) < 600 or info.get("height", 0) < 400:
            continue
        usable.append({"title": page["title"], "url": info.get("thumburl") or info["url"], "license": license_name})
    return usable


def save(url: str, target: Path) -> None:
    with open_url(url) as response:
        image = Image.open(io.BytesIO(response.read())).convert("RGB")
    crop = CROP_BOTTOM.get(target.name)
    if crop:
        image = image.crop((0, 0, image.width, round(image.height * (1 - crop))))
    if image.width > WIDTH:
        image = image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS)
    image.save(target, "JPEG", quality=84, optimize=True, progressive=True)


def main(only: list[str]) -> None:
    for name, searches in COVER_SEARCHES.items():
        target = COVERS / name
        if only and name not in only:
            continue
        if target.exists() and not only:
            print(f"{name}: already present")
            continue
        found = []
        for search in searches:
            found = candidates(search)
            if found:
                break
        if not found:
            print(f"{name}: no public-domain match for {searches}")
            continue
        choice = found[0]
        save(choice["url"], target)
        print(f"{name}: {choice['title']} ({choice['license']})")


if __name__ == "__main__":
    main(sys.argv[1:])
