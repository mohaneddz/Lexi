"""
Adds authors, a long introduction, tags, license and homepage to every book
in public/books/catalog.json, for the book detail panel on the Books page.

build_books.py calls annotate() on the books it writes; run this file on its
own to annotate the rest of the catalog (older books it doesn't build).
"""

from __future__ import annotations

import json
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[2] / "public" / "books" / "catalog.json"

LANGUAGE_NAMES = {"ar": "Arabic", "de": "German", "fr": "French", "es": "Spanish", "zh": "Chinese"}

WIKTIONARY_AUTHORS = ["Wiktionary contributors", "Tatu Ylonen (Wiktextract)"]
WIKTIONARY_LICENSE = "CC BY-SA 4.0"

WIKTIONARY_BACKGROUND = (
    "Wiktionary is the free, collaborative dictionary from the Wikimedia Foundation, written by volunteers in "
    "many languages since 2002. Each entry records meanings, usage labels, subject tags and translation tables. "
    "Wiktextract, by Tatu Ylonen, parses those pages into structured data, which kaikki.org publishes and "
    "which this book was cut from."
)

FIELD_INTROS = {
    "computing": ("Computing", "the vocabulary of computers and software: hardware, programming, operating systems, networks, databases, security and the internet"),
    "ai": ("AI and Data Science", "the vocabulary of artificial intelligence and data: machine learning, statistics, probability, robotics and related methods"),
    "mathematics": ("Mathematics", "mathematical vocabulary across algebra, geometry, calculus, number theory, logic, topology and set theory"),
    "medicine": ("Medicine", "medical vocabulary: anatomy, diseases and symptoms, surgery, pharmacology and the clinical specialties"),
    "zoology": ("Zoology", "the animal kingdom: mammals, birds, fish, insects, reptiles and amphibians, with the terms used to describe their bodies and behaviour"),
    "astronomy": ("Astronomy", "the sky and space: stars, planets, moons, constellations, galaxies, cosmology and spaceflight"),
    "physics": ("Physics", "physics vocabulary: mechanics, electricity and magnetism, optics, thermodynamics, quantum and particle physics"),
    "chemistry": ("Chemistry", "chemistry vocabulary: the elements, compounds and minerals, reactions, and organic and biochemistry"),
    "botany": ("Botany and Biology", "plants, trees, flowers and fungi, together with the vocabulary of cells, genetics and ecology"),
    "business": ("Business", "the language of business and money: economics, banking, accounting, trade, marketing and the stock market"),
    "law": ("Law", "legal and civic vocabulary: courts, contracts, crime, legislation and government"),
}


def wiktionary_book(book: dict) -> dict:
    parts = book["id"].split("-")  # wikt-<kind>-<from>-<to>
    kind = parts[1]
    source_lang = LANGUAGE_NAMES.get(parts[2], "English") if len(parts) > 2 else "English"
    target_lang = LANGUAGE_NAMES.get(parts[3], "") if len(parts) > 3 else ""

    if kind == "mono":
        language = LANGUAGE_NAMES[parts[2]]
        edition = {"fr": "French (Wiktionnaire)", "de": "German", "es": "Spanish (Wikcionario)", "zh": "Chinese (維基詞典)"}[parts[2]]
        about = (
            f"A monolingual {language} dictionary: {language} words explained in {language}, taken from the {edition} "
            f"edition of Wiktionary rather than the English one, so the definitions are written by native speakers for "
            f"native speakers. It keeps up to 25,000 headwords, putting everyday vocabulary first (words that appear in "
            f"translation tables), and leaves out entries that only point at another form, such as plurals or conjugations. "
            f"Each entry keeps its first few senses.\n\n{WIKTIONARY_BACKGROUND}"
        )
        tags = [language, "Monolingual", "General vocabulary", "Definitions"]
    elif kind == "general":
        if source_lang == "English":
            about = (
                f"A general English to {target_lang} dictionary built from the translation tables of the English Wiktionary. "
                f"Every English word and sense that has a {target_lang} translation is ranked by how many languages "
                f"translate it at all, a good stand-in for how common it is, and the top 25,000 are kept. Proper names are "
                f"left out, and so are regional dialect forms and obsolete words, so what remains is the standard modern "
                f"language.\n\n{WIKTIONARY_BACKGROUND}"
            )
        else:
            about = (
                f"{source_lang} words paired directly with Arabic. When a single English sense lists both a {source_lang} and "
                f"an Arabic translation, those two words mean the same thing, so they are paired without going word by word "
                f"through English, which would mix up words with several meanings. Arabic is Modern Standard Arabic; dialect "
                f"forms listed in the tables are left out.\n\n{WIKTIONARY_BACKGROUND}"
            )
        tags = [source_lang, target_lang, "General vocabulary", "Translation"]
    else:
        field_title, field_scope = FIELD_INTROS[kind]
        about = (
            f"A specialist vocabulary for {field_scope}, between English and {target_lang}. It combines two directions: "
            f"English words from the English Wiktionary whose sense is tagged with this field and has a {target_lang} "
            f"translation, and {target_lang} words from Wiktionary's own {target_lang} entries tagged with the field and "
            f"glossed in English. Wiktionary adds broad parent tags automatically (every computing word is also tagged "
            f"mathematics), so those only count when no more specific field applies.\n\n{WIKTIONARY_BACKGROUND}"
        )
        tags = [field_title, "English", target_lang, "Specialist vocabulary", "Translation"]

    return {
        "authors": WIKTIONARY_AUTHORS,
        "about": about,
        "tags": tags,
        "license": WIKTIONARY_LICENSE,
        "homepage": "https://kaikki.org/",
    }


WORDNET_BACKGROUND = (
    "WordNet is a lexical database of English begun in 1985 at Princeton University's Cognitive Science Laboratory "
    "under the psychologist George A. Miller, later directed by Christiane Fellbaum. Instead of listing words "
    "alphabetically, it groups them into sets of synonyms (synsets), each with a short definition, and links those "
    "sets by meaning: kinds of, parts of, opposites. It is one of the most widely used resources in linguistics and "
    "natural language processing."
)


def static_book(book: dict) -> dict | None:
    book_id = book["id"]
    if book_id.startswith("cedict-"):
        return {
            "authors": ["MDBG", "CC-CEDICT contributors", "Paul Denisowski (original CEDICT)"],
            "about": (
                "CC-CEDICT is the community-maintained Chinese-English dictionary used by most Chinese learning apps and "
                "dictionaries online. It grew out of CEDICT, started by Paul Denisowski in 1997, and has been maintained "
                "by MDBG since. Each entry gives the traditional and simplified characters, the Mandarin pronunciation "
                "in pinyin, and one or more English glosses.\n\nIn this book you can search by simplified or traditional "
                "characters, or by pinyin with tone marks or without them. Entries that are only cross-references "
                "(\"variant of\", surnames) are left out."
            ),
            "tags": ["Chinese", "English", "Mandarin", "Pinyin", "General vocabulary", "Translation"],
            "license": "CC BY-SA 4.0",
            "homepage": "https://www.mdbg.net/chinese/dictionary?page=cedict",
        }
    if book_id.startswith("dict-wordnet-"):
        part = book_id.split("-")[-1]
        return {
            "authors": ["Princeton University", "George A. Miller", "Christiane Fellbaum"],
            "about": (
                f"English {part} from WordNet, each with its WordNet definition.\n\n{WORDNET_BACKGROUND}"
            ),
            "tags": ["English", part.capitalize(), "Definitions", "WordNet"],
            "license": "WordNet License",
            "homepage": "https://wordnet.princeton.edu/",
        }
    if book_id.startswith("dict-topic-"):
        topic = book_id.split("-", 2)[-1].replace("-", " ")
        return {
            "authors": ["Princeton University", "George A. Miller", "Christiane Fellbaum"],
            "about": (
                f"English words about {topic}, gathered from WordNet's topic hierarchy: every word whose meaning falls "
                f"under the matching WordNet categories, with its definition.\n\n{WORDNET_BACKGROUND}"
            ),
            "tags": ["English", topic.capitalize(), "Definitions", "WordNet"],
            "license": "WordNet License",
            "homepage": "https://wordnet.princeton.edu/",
        }
    if book_id.startswith("dict-webster-"):
        return {
            "authors": ["Noah Webster", "G. & C. Merriam Co."],
            "about": (
                "Definitions from Webster's Revised Unabridged Dictionary, the 1913 edition published by G. & C. Merriam "
                "Co. and descended from Noah Webster's American Dictionary of the English Language of 1828. Its "
                "copyright has expired, which is why it underlies so many free dictionaries. The definitions are "
                "thorough and often literary, with quotations from classic writers, though the language and some senses "
                "are over a century old."
            ),
            "tags": ["English", "Definitions", "Historical", "Public domain"],
            "license": "Public domain",
            "homepage": "https://github.com/matthewreagan/WebstersEnglishDictionary",
        }
    if book_id.startswith("trans-countries-"):
        return {
            "authors": ["Mohammed Le Doze", "mledoze/countries contributors"],
            "about": (
                "Every country's name in English paired with its name in another language, including the official long "
                "forms (\"Federal Republic of Germany\" as well as \"Germany\"). It comes from mledoze/countries, an "
                "open dataset of world countries maintained on GitHub, which collects names, codes, currencies and "
                "languages for every country and territory."
            ),
            "tags": ["Geography", "Countries", "Translation"] + book["outputLanguages"],
            "license": "ODbL",
            "homepage": "https://github.com/mledoze/countries",
        }
    if book_id.startswith("swadesh-"):
        return {
            "authors": ["Morris Swadesh (list)", "Wiktionary contributors"],
            "about": (
                "The Swadesh list is a set of about 200 basic meanings (pronouns, body parts, numbers, natural "
                "features, simple actions and qualities) that the American linguist Morris Swadesh chose in the 1950s "
                "as vocabulary nearly every language has its own words for. Linguists use it to compare languages and "
                "estimate how closely they are related; for a learner it is the core vocabulary to know first. The "
                "translations come from Wiktionary's Swadesh list appendices."
            ),
            "tags": ["Core vocabulary", "Swadesh list", "Translation"] + book["inputLanguages"] + book["outputLanguages"],
            "license": WIKTIONARY_LICENSE,
            "homepage": "https://en.wiktionary.org/wiki/Appendix:Swadesh_lists",
        }
    return None


def annotate(book: dict) -> dict:
    """Returns the book with authors, about, tags, license and homepage filled in, when it's one we know."""
    metadata = wiktionary_book(book) if book["id"].startswith("wikt-") else static_book(book)
    if metadata:
        metadata["tags"] = list(dict.fromkeys(tag for tag in metadata["tags"] if tag))
        book.update(metadata)
    return book


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf8"))
    catalog = [annotate(book) for book in catalog]
    missing = [book["id"] for book in catalog if "about" not in book]
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"Annotated {len(catalog) - len(missing)} of {len(catalog)} books." + (f" No metadata for: {missing}" if missing else ""))


if __name__ == "__main__":
    main()
