"""
Downloads the dictionary dumps build_books.py reads into scripts/books/.cache.
About 1.9 GB in total, fetched in parallel; files already present are skipped.
"""

from __future__ import annotations

import concurrent.futures
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parent / ".cache"
KAIKKI = "https://kaikki.org"

SOURCES = {
    # English Wiktionary, split by language of the headword.
    "en-English.jsonl.gz": f"{KAIKKI}/dictionary/English/kaikki.org-dictionary-English.jsonl.gz",
    "en-Arabic.jsonl.gz": f"{KAIKKI}/dictionary/Arabic/kaikki.org-dictionary-Arabic.jsonl.gz",
    "en-German.jsonl.gz": f"{KAIKKI}/dictionary/German/kaikki.org-dictionary-German.jsonl.gz",
    "en-French.jsonl.gz": f"{KAIKKI}/dictionary/French/kaikki.org-dictionary-French.jsonl.gz",
    "en-Spanish.jsonl.gz": f"{KAIKKI}/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz",
    "en-Chinese.jsonl.gz": f"{KAIKKI}/dictionary/Chinese/kaikki.org-dictionary-Chinese.jsonl.gz",
    # Each language's own Wiktionary, for native definitions.
    "fr-native.jsonl.gz": f"{KAIKKI}/frwiktionary/Fran%C3%A7ais/kaikki.org-dictionary-Fran%C3%A7ais.jsonl.gz",
    "de-native.jsonl.gz": f"{KAIKKI}/dewiktionary/Deutsch/kaikki.org-dictionary-Deutsch.jsonl.gz",
    "es-native.jsonl.gz": f"{KAIKKI}/eswiktionary/Espa%C3%B1ol/kaikki.org-dictionary-Espa%C3%B1ol.jsonl.gz",
    "zh-native.jsonl.gz": f"{KAIKKI}/zhwiktionary/%E6%BC%A2%E8%AA%9E/kaikki.org-dictionary-%E6%BC%A2%E8%AA%9E.jsonl.gz",
    "cedict.txt.gz": "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
}


def fetch(name: str, url: str) -> str:
    target = CACHE / name
    if target.exists() and target.stat().st_size > 0:
        return f"{name}: already downloaded"
    partial = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "Lexi book builder"})
    with urllib.request.urlopen(request) as response, open(partial, "wb") as handle:
        while chunk := response.read(1 << 20):
            handle.write(chunk)
    partial.replace(target)
    return f"{name}: {target.stat().st_size // (1 << 20)} MB"


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        for message in pool.map(lambda item: fetch(*item), SOURCES.items()):
            print(message, flush=True)


if __name__ == "__main__":
    main()
