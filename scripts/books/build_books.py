"""
Builds Lexi's language books from real dictionary data.

Sources (all freely licensed, see public/books/SOURCES.md):
  - Wiktextract dumps of English Wiktionary from kaikki.org: the English
    dump's translation tables, and the Arabic, German, French, Spanish and
    Chinese dumps' English glosses. Both carry topic tags per sense, which
    is what the field books (Computing, Medicine, ...) are cut from.
  - Wiktextract dumps of the French, German, Spanish and Chinese
    Wiktionaries, for monolingual dictionaries with native definitions.
  - CC-CEDICT, for a full Chinese-English dictionary.

Run `python scripts/books/fetch_sources.py` first to download them into
scripts/books/.cache, then `python scripts/books/build_books.py`. Extracted
intermediates are cached next to the dumps, so re-runs only rebuild packs.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import orjson

from book_metadata import annotate

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / ".cache"
PACKS = ROOT / "public" / "books" / "packs"
CATALOG = ROOT / "public" / "books" / "catalog.json"

BOOK_VERSION = "1.0.0"
ID_PREFIX = "wikt"

LANGUAGES = {
    "ar": "Arabic",
    "de": "German",
    "fr": "French",
    "es": "Spanish",
    "zh": "Chinese",
}

# Translation-table language codes that count as each of our languages.
TRANSLATION_CODES = {
    "ar": {"ar"},
    "de": {"de"},
    "fr": {"fr"},
    "es": {"es"},
    "zh": {"cmn", "zh"},
}

# Cover per field; existing covers are reused where they already fit.
FIELDS = [
    {
        "id": "computing",
        "title": "Computing",
        "blurb": "hardware, software, programming, networks and the internet",
        "topics": {"computing", "programming", "computer", "software", "Internet", "networking", "computer-science",
                   "computer-hardware", "computer-graphics", "databases", "cryptography", "computer-languages",
                   "operating-systems", "web-design", "hacking", "video-games"},
        "categories": {"Computing", "Programming", "Internet", "Software", "Computer science", "Networking",
                       "Computer hardware", "Operating systems", "Programming languages", "Data management",
                       "Computer languages", "Cryptography", "Web design", "Software engineering", "Data processing"},
        "exclude": set(),
        "cover": "field-computing.jpg",
    },
    {
        "id": "ai",
        "title": "AI and Data Science",
        "blurb": "artificial intelligence, machine learning, statistics, probability and robotics",
        "topics": {"artificial-intelligence", "machine-learning", "statistics", "probability-theory", "robotics",
                   "data-science", "cybernetics"},
        "categories": {"Artificial intelligence", "Machine learning", "Statistics", "Probability theory", "Robotics",
                       "Data science", "Cybernetics", "Neural networks", "Natural language processing"},
        "exclude": set(),
        "cover": "field-ai.jpg",
    },
    {
        "id": "mathematics",
        "title": "Mathematics",
        "blurb": "algebra, geometry, calculus, number theory, logic and set theory",
        "topics": {"mathematics", "algebra", "geometry", "arithmetic", "calculus", "number-theory", "topology",
                   "set-theory", "trigonometry", "mathematical-analysis", "linear-algebra", "group-theory",
                   "category-theory", "combinatorics", "graph-theory", "logic"},
        "categories": {"Mathematics", "Geometry", "Algebra", "Arithmetic", "Calculus", "Number theory", "Topology",
                       "Set theory", "Trigonometry", "Mathematical analysis", "Linear algebra", "Logic",
                       "Combinatorics", "Graph theory", "Shapes", "Numbers"},
        # "mathematics" is added automatically as a parent of computing and
        # physics tags, so it only counts when no more specific field applies.
        "exclude": {"computing", "programming", "computer", "software", "Internet", "physics", "statistics",
                    "chemistry", "astronomy", "economics", "finance"},
        "cover": "field-mathematics.jpg",
    },
    {
        "id": "medicine",
        "title": "Medicine and Anatomy",
        "blurb": "anatomy, diseases, symptoms, surgery and pharmacology",
        "topics": {"medicine", "anatomy", "pathology", "pharmacology", "physiology", "surgery", "dentistry",
                   "ophthalmology", "cardiology", "neurology", "oncology", "virology", "immunology", "medical",
                   "hematology", "gynaecology", "obstetrics", "psychiatry", "pharmacy", "epidemiology", "nursing",
                   "dermatology", "orthopedics", "urology"},
        "categories": {"Medicine", "Anatomy", "Diseases", "Medical signs and symptoms", "Pharmacology", "Surgery",
                       "Body parts", "Organs", "Medical equipment", "Physiology", "Pathology", "Dentistry",
                       "Bones", "Drugs", "Infectious diseases", "Psychiatry"},
        "exclude": set(),
        "cover": "dict-topic-body.png",
    },
    {
        "id": "zoology",
        "title": "Zoology",
        "blurb": "mammals, birds, fish, insects, reptiles and animal anatomy",
        "topics": {"zoology", "ornithology", "entomology", "ichthyology", "mammalogy", "herpetology", "arachnology",
                   "malacology", "biology-zoology"},
        "categories": {"Zoology", "Mammals", "Birds", "Fish", "Insects", "Reptiles", "Amphibians", "Animals",
                       "Animal body parts", "Baby animals", "Female animals", "Male animals", "Rodents", "Carnivores",
                       "Birds of prey", "Cetaceans", "Primates", "Bovines", "Equids", "Canids", "Felids",
                       "Ungulates", "Spiders", "Crustaceans", "Molluscs", "Snakes", "Lizards", "Butterflies",
                       "Beetles", "Sharks", "Parrots", "Owls", "Anseriform birds", "Galliform birds",
                       "Passerines", "Waders", "Bats", "Deer", "Marsupials", "Worms", "Ants", "Bees"},
        "exclude": set(),
        "cover": "dict-topic-animals.jpg",
    },
    {
        "id": "astronomy",
        "title": "Astronomy and Space",
        "blurb": "stars, planets, constellations, cosmology and spaceflight",
        "topics": {"astronomy", "astrophysics", "cosmology", "space", "spaceflight", "astronautics", "planetology"},
        "categories": {"Astronomy", "Planets", "Stars", "Constellations", "Moons", "Astrophysics", "Cosmology",
                       "Galaxies", "Space", "Spaceflight", "Planets of the Solar System", "Celestial bodies",
                       "Dwarf planets", "Astronomical objects"},
        "exclude": set(),
        "cover": "dict-topic-astronomy.jpg",
    },
    {
        "id": "physics",
        "title": "Physics",
        "blurb": "mechanics, electricity, optics, thermodynamics and particle physics",
        "topics": {"physics", "mechanics", "optics", "electromagnetism", "thermodynamics", "quantum-mechanics",
                   "nuclear-physics", "electricity", "particle-physics", "acoustics", "relativity",
                   "fluid-dynamics", "quantum-physics", "electronics"},
        "categories": {"Physics", "Mechanics", "Optics", "Electromagnetism", "Thermodynamics", "Quantum mechanics",
                       "Nuclear physics", "Electricity", "Particle physics", "Subatomic particles", "Acoustics",
                       "Units of measure", "Electronics"},
        "exclude": {"astronomy", "astrophysics", "chemistry"},
        "cover": "field-physics.jpg",
    },
    {
        "id": "chemistry",
        "title": "Chemistry",
        "blurb": "elements, compounds, reactions, organic chemistry and biochemistry",
        "topics": {"chemistry", "biochemistry", "organic-chemistry", "inorganic-chemistry", "physical-chemistry",
                   "analytical-chemistry", "chemical-engineering", "mineralogy", "crystallography"},
        "categories": {"Chemistry", "Chemical elements", "Chemical compounds", "Biochemistry", "Organic chemistry",
                       "Inorganic compounds", "Organic compounds", "Acids", "Alkali metals", "Metals", "Minerals",
                       "Enzymes", "Proteins", "Amino acids", "Gases", "Alloys"},
        "exclude": set(),
        "cover": "field-chemistry.jpg",
    },
    {
        "id": "botany",
        "title": "Botany and Biology",
        "blurb": "plants, trees, flowers, fungi, cells, genetics and ecology",
        "topics": {"botany", "biology", "genetics", "cytology", "ecology", "mycology", "microbiology",
                   "evolutionary-theory", "taxonomy", "phycology", "horticulture"},
        "categories": {"Botany", "Plants", "Trees", "Flowers", "Herbs", "Fungi", "Biology", "Genetics",
                       "Cell biology", "Ecology", "Microbiology", "Grasses", "Shrubs", "Ferns", "Mosses",
                       "Legumes", "Rose family plants", "Mint family plants", "Conifers", "Palm trees"},
        "exclude": {"zoology", "medicine", "anatomy"},
        "cover": "dict-topic-plants.jpg",
    },
    {
        "id": "business",
        "title": "Business and Finance",
        "blurb": "economics, banking, accounting, trade, marketing and the stock market",
        "topics": {"business", "finance", "economics", "accounting", "banking", "marketing", "trade", "stock-market",
                   "commerce", "insurance", "management", "taxation", "real-estate"},
        "categories": {"Business", "Finance", "Economics", "Accounting", "Banking", "Marketing", "Trade",
                       "Currencies", "Money", "Stock market", "Commerce", "Management", "Taxation", "Insurance"},
        "exclude": set(),
        "cover": "field-business.jpg",
    },
    {
        "id": "law",
        "title": "Law and Government",
        "blurb": "courts, contracts, crime, legislation and government",
        "topics": {"law", "legal", "criminal-law", "international-law", "contract-law", "government", "politics"},
        "categories": {"Law", "Crime", "Criminal law", "Legal occupations", "Contract law", "Government",
                       "Politics", "Legislation", "Courts", "Crimes", "Criminals"},
        "exclude": set(),
        "cover": "field-law.jpg",
    },
]

# Books smaller than this aren't worth a card in the catalog.
MIN_FIELD_ENTRIES = 60
# Caps keep the bundled packs a sensible size while books ship inside the app.
MAX_FIELD_ENTRIES = 6000
MAX_GENERAL_ENTRIES = 25000
MAX_MONOLINGUAL_ENTRIES = 25000
MAX_TARGETS_PER_ENTRY = 4
MAX_GLOSS_CHARS = 160
MAX_DEFINITION_CHARS = 420

ARABIC_DIACRITICS = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
CJK = re.compile(r"[㐀-鿿豈-﫿]")


def log(message: str) -> None:
    print(message, flush=True)


def iter_jsonl_gz(path: Path, must_contain: bytes | None = None):
    """Streams a gzipped JSONL dump, skipping lines that can't matter before paying for a parse."""
    with gzip.open(path, "rb") as handle:
        for line in handle:
            if must_contain is not None and must_contain not in line:
                continue
            try:
                yield orjson.loads(line)
            except orjson.JSONDecodeError:
                continue


def sense_labels(sense: dict, lang_prefix: str) -> tuple[set[str], set[str]]:
    topics = set(sense.get("topics") or [])
    categories = set()
    for category in sense.get("categories") or []:
        orig = category.get("orig") or ""
        if orig.startswith(lang_prefix):
            categories.add(orig[len(lang_prefix):])
        elif category.get("name"):
            categories.add(category["name"])
    return topics, categories


def fields_for(topics: set[str], categories: set[str]) -> list[str]:
    matched = []
    for field in FIELDS:
        if topics & field["exclude"] and not categories & field["categories"]:
            continue
        if topics & field["topics"] or categories & field["categories"]:
            matched.append(field["id"])
    return matched


def clean_gloss(text: str, limit: int = MAX_GLOSS_CHARS) -> str:
    text = re.sub(r"\s+", " ", text).strip().rstrip(";:,")
    if len(text) > limit:
        cut = text[:limit].rsplit(" ", 1)[0]
        text = cut.rstrip(",;: ") + "..."
    return text


def plain(text: str) -> str:
    return unicodedata.normalize("NFC", text).strip()


# --- Extraction ---------------------------------------------------------------


def extract_english_concepts() -> list[dict]:
    """
    Reads the English dump's translation tables. Each (English word, sense)
    becomes a concept holding its translations into our languages, the
    fields its sense belongs to, and a popularity score: how many languages
    translate it at all, a decent stand-in for how common the word is.
    """
    out = CACHE / "extract-en-concepts.json"
    if out.exists():
        return json.loads(out.read_text(encoding="utf8"))

    log("Extracting English translation tables (this is the slow one)...")
    wanted = {code: lang for lang, codes in TRANSLATION_CODES.items() for code in codes}
    concepts = []
    for entry in iter_jsonl_gz(CACHE / "en-English.jsonl.gz", b'"translations"'):
        if entry.get("lang_code") != "en":
            continue
        word = entry.get("word") or ""
        if not word or len(word) > 40:
            continue
        senses = entry.get("senses") or []
        sense_fields = [fields_for(*sense_labels(sense, "en:")) for sense in senses]

        # Translations sit either on the sense they translate, or on the
        # entry with a `sense` label and _dis1 scores pointing at a sense.
        tables = [(translation, index) for index, sense in enumerate(senses) for translation in sense.get("translations") or []]
        tables += [(translation, None) for translation in entry.get("translations") or []]

        groups: dict[str, dict] = {}
        popularity: Counter = Counter()
        for translation, sense_index in tables:
            key = translation.get("sense") or (f"#{sense_index}" if sense_index is not None else "")
            popularity[key] += 1
            lang = wanted.get(translation.get("code") or translation.get("lang_code") or "")
            target = plain(translation.get("word") or "")
            if not lang or not target or len(target) > 60:
                continue
            if lang == "zh" and not CJK.search(target):
                continue
            # Tables list dialects alongside the standard language (Egyptian
            # or Gulf Arabic, Hokkien or Dungan Chinese); the books stick to
            # Modern Standard Arabic and Mandarin, and to words still in use.
            tags = translation.get("tags") or []
            if lang == "ar" and any(tag.endswith("-Arabic") for tag in tags):
                continue
            if lang == "zh" and translation.get("lang") not in ("Chinese Mandarin", "Mandarin"):
                continue
            if "obsolete" in tags or "archaic" in tags:
                continue

            group = groups.get(key)
            if group is None:
                # _dis1 scores how well this translation group fits each
                # sense; the best fit decides which fields it belongs to.
                fields: list[str] = []
                scores = [int(x) for x in (translation.get("_dis1") or "").split() if x.isdigit()]
                if sense_index is not None:
                    fields = sense_fields[sense_index]
                elif scores and len(scores) == len(senses):
                    fields = sense_fields[scores.index(max(scores))]
                elif len(senses) == 1:
                    fields = sense_fields[0]
                group = groups[key] = {"en": word, "pos": entry.get("pos") or "", "gloss": key, "fields": fields, "tr": {}}
            targets = group["tr"].setdefault(lang, [])
            if all(existing[0] != target for existing in targets):
                targets.append([target, translation.get("roman") or ""])

        for key, group in groups.items():
            group["pop"] = popularity[key]
            concepts.append(group)

    out.write_text(json.dumps(concepts, ensure_ascii=False), encoding="utf8")
    log(f"  {len(concepts)} concepts")
    return concepts


def mandarin_pinyin(entry: dict) -> str:
    for sound in entry.get("sounds") or []:
        tags = sound.get("tags") or []
        if "Mandarin" in tags and "Pinyin" in tags and sound.get("zh_pron"):
            # "jūn (jun¹)" -> "jūn"; the numbered form in brackets is redundant.
            return re.sub(r"\s*\(.*\)\s*$", "", sound["zh_pron"])
    return ""


def extract_foreign_terms(lang: str) -> list[dict]:
    """
    Reads one language's dump from English Wiktionary: native words with
    English glosses, kept only where a sense falls in one of the fields.
    """
    out = CACHE / f"extract-{lang}-terms.json"
    if out.exists():
        return json.loads(out.read_text(encoding="utf8"))

    name = LANGUAGES[lang]
    log(f"Extracting {name} field terms...")
    terms = []
    for entry in iter_jsonl_gz(CACHE / f"en-{name}.jsonl.gz"):
        word = plain(entry.get("word") or "")
        if not word or len(word) > 40:
            continue
        if lang == "zh" and not CJK.search(word):
            continue
        by_field: dict[str, list[str]] = defaultdict(list)
        for sense in entry.get("senses") or []:
            glosses = sense.get("glosses") or []
            if not glosses or "form-of" in (sense.get("tags") or []):
                continue
            for field in fields_for(*sense_labels(sense, f"{lang}:")):
                by_field[field].append(clean_gloss(glosses[-1]))
        if not by_field:
            continue

        aliases = []
        for form in entry.get("forms") or []:
            tags = form.get("tags") or []
            # Chinese headwords are traditional; the simplified form is how
            # most people will type it.
            if "canonical" in tags or "romanization" in tags or "Simplified-Chinese" in tags:
                aliases.append(plain(form.get("form") or ""))
        pinyin = mandarin_pinyin(entry) if lang == "zh" else ""
        if pinyin:
            aliases.append(pinyin)
        terms.append({
            "word": word,
            "aliases": [alias for alias in dict.fromkeys(aliases) if alias and alias != word],
            "fields": {field: glosses[:2] for field, glosses in by_field.items()},
        })

    out.write_text(json.dumps(terms, ensure_ascii=False), encoding="utf8")
    log(f"  {len(terms)} {name} field terms")
    return terms


NATIVE_FILES = {"fr": "fr-native.jsonl.gz", "de": "de-native.jsonl.gz", "es": "es-native.jsonl.gz", "zh": "zh-native.jsonl.gz"}
NATIVE_LANGUAGE_NAMES = {"fr": "Français", "de": "Deutsch", "es": "Español", "zh": "漢語"}
# Glosses that only point at another entry ("Pluriel de ...") aren't definitions.
FORM_OF_PATTERNS = {
    "fr": re.compile(r"^(pluriel|féminin|masculin|participe|première|deuxième|troisième|forme|variante|ancienne orthographe|orthographe)\b", re.I),
    "de": re.compile(r"^(nominativ|genitiv|dativ|akkusativ|plural|singular|\d\. person|variante|alte schreibung)\b", re.I),
    "es": re.compile(r"^(forma|plural|femenino|masculino|primera|segunda|tercera|participio|gerundio|variante)\b", re.I),
    "zh": re.compile(r"^(“.*”的|同“|見“|见“|異體|异体)"),
}


def extract_native(lang: str) -> list[dict]:
    """Native-language headwords with their definitions, from that language's own Wiktionary."""
    out = CACHE / f"extract-{lang}-native.json"
    if out.exists():
        return json.loads(out.read_text(encoding="utf8"))

    log(f"Extracting {LANGUAGES[lang]} native definitions...")
    form_of = FORM_OF_PATTERNS[lang]
    entries = []
    for entry in iter_jsonl_gz(CACHE / NATIVE_FILES[lang]):
        word = plain(entry.get("word") or "")
        if not word or len(word) > 40 or " " in word.strip() and lang != "zh" and len(word.split()) > 3:
            continue
        if lang == "zh" and not CJK.search(word):
            continue
        definitions = []
        for sense in entry.get("senses") or []:
            glosses = sense.get("glosses") or []
            if not glosses:
                continue
            gloss = clean_gloss(glosses[-1], 220)
            tags = sense.get("tags") or []
            if not gloss or form_of.search(gloss) or "form-of" in tags or "alt-of" in tags:
                continue
            definitions.append(gloss)
        if definitions:
            entries.append({"word": word, "pos": entry.get("pos") or "", "defs": definitions[:3]})

    out.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf8")
    log(f"  {len(entries)} {LANGUAGES[lang]} definitions")
    return entries


def parse_cedict() -> list[dict]:
    pattern = re.compile(r"^(\S+) (\S+) \[([^\]]+)\] /(.+)/$")
    entries = []
    with gzip.open(CACHE / "cedict.txt.gz", "rt", encoding="utf8") as handle:
        for line in handle:
            if line.startswith("#"):
                continue
            match = pattern.match(line.strip())
            if not match:
                continue
            traditional, simplified, pinyin, glosses = match.groups()
            senses = [gloss for gloss in glosses.split("/") if gloss]
            # Pure cross-references and surnames make up a lot of CEDICT
            # without teaching anything on their own.
            useful = [gloss for gloss in senses if not re.match(r"^(variant of|old variant of|surname |see |CL:|also written|erhua variant)", gloss)]
            if not useful:
                continue
            entries.append({
                "source": simplified,
                "aliases": [alias for alias in dict.fromkeys([traditional, numbered_to_marked(pinyin), re.sub(r"\d", "", pinyin)]) if alias != simplified],
                "target": clean_gloss("; ".join(useful[:4]), 200),
            })
    return entries


TONE_MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def numbered_to_marked(pinyin: str) -> str:
    """ni3 hao3 -> nǐ hǎo, so the search matches however pinyin is typed."""
    def convert(syllable: str) -> str:
        match = re.match(r"^([a-zü:]+)([1-5])$", syllable.lower().replace("u:", "ü"))
        if not match:
            return syllable
        body, tone = match.group(1), int(match.group(2))
        if tone == 5:
            return body
        for vowel in ("a", "e"):
            if vowel in body:
                return body.replace(vowel, TONE_MARKS[vowel][tone - 1], 1)
        if "ou" in body:
            return body.replace("o", TONE_MARKS["o"][tone - 1], 1)
        for index in range(len(body) - 1, -1, -1):
            if body[index] in TONE_MARKS:
                return body[:index] + TONE_MARKS[body[index]][tone - 1] + body[index + 1:]
        return body
    return " ".join(convert(part) for part in pinyin.split())


# --- Book assembly ------------------------------------------------------------


def dedupe(entries: list[dict], key_fields: tuple[str, ...]) -> list[dict]:
    seen = set()
    unique = []
    for entry in entries:
        key = tuple(entry[field].casefold() for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        unique.append(entry)
    return unique


def split_chinese(word: str) -> tuple[str, str]:
    """Wiktionary writes Mandarin translations as "統計學家 /统计学家": returns (simplified, traditional)."""
    if " /" in word:
        traditional, simplified = (part.strip() for part in word.split(" /", 1))
        return simplified, traditional
    return word, ""


def translation_entry(source: str, source_lang: str, targets: list[list[str]], target_lang: str) -> dict:
    words = []
    aliases = []
    for target, roman in targets[:MAX_TARGETS_PER_ENTRY]:
        if target_lang == "zh":
            target, traditional = split_chinese(target)
            if traditional:
                aliases.append(traditional)
        words.append(target)
        if roman:
            aliases.append(roman)
    if target_lang == "ar":
        aliases += [ARABIC_DIACRITICS.sub("", word) for word in words if ARABIC_DIACRITICS.search(word)]
    entry = {
        "source": source,
        "target": "; ".join(words),
        "sourceLanguage": source_lang,
        "targetLanguage": LANGUAGES.get(target_lang, target_lang),
    }
    unique_aliases = [alias for alias in dict.fromkeys(aliases) if alias and alias != source]
    if unique_aliases:
        entry["aliases"] = unique_aliases
    return entry


def build_field_books(concepts: list[dict], terms_by_lang: dict[str, list[dict]]) -> list[dict]:
    books = []
    for field in FIELDS:
        field_concepts = sorted((c for c in concepts if field["id"] in c["fields"]), key=lambda c: -c["pop"])
        for lang, name in LANGUAGES.items():
            entries = []
            for concept in field_concepts:
                targets = concept["tr"].get(lang)
                if targets:
                    entries.append(translation_entry(concept["en"], "English", targets, lang))
            # Native terms glossed in English, so the book also covers words
            # that have no English headword with a translation table.
            for term in terms_by_lang[lang]:
                glosses = term["fields"].get(field["id"])
                if not glosses:
                    continue
                entry = {
                    "source": term["word"],
                    "target": "; ".join(dict.fromkeys(glosses)),
                    "sourceLanguage": name,
                    "targetLanguage": "English",
                }
                if term["aliases"]:
                    entry["aliases"] = term["aliases"]
                entries.append(entry)

            entries = dedupe(entries, ("source", "target"))[:MAX_FIELD_ENTRIES]
            if len(entries) < MIN_FIELD_ENTRIES:
                log(f"  skipping {field['title']} ({name}): only {len(entries)} entries")
                continue
            book_id = f"{ID_PREFIX}-{field['id']}-en-{lang}"
            books.append({
                "id": book_id,
                "title": f"{field['title']} Vocabulary (English to {name})",
                "type": "translation",
                "description": (
                    f"{len(entries):,} {field['title'].lower()} terms between English and {name}: "
                    f"{field['blurb']}. Built from Wiktionary's translation tables and its {name} entries."
                ),
                "source": "Wiktionary (via Wiktextract)",
                "inputLanguages": ["English"],
                "outputLanguages": [name],
                "cover": field["cover"],
                "entries": entries,
            })
    return books


def build_general_books(concepts: list[dict]) -> list[dict]:
    books = []
    # Proper names are widely translated but aren't vocabulary.
    ranked = sorted((c for c in concepts if c["pos"] != "name"), key=lambda c: -c["pop"])
    for lang, name in LANGUAGES.items():
        entries = [translation_entry(c["en"], "English", c["tr"][lang], lang) for c in ranked if c["tr"].get(lang)]
        entries = dedupe(entries, ("source", "target"))[:MAX_GENERAL_ENTRIES]
        books.append({
            "id": f"{ID_PREFIX}-general-en-{lang}",
            "title": f"General Dictionary (English to {name})",
            "type": "translation",
            "description": (
                f"The {len(entries):,} most widely translated English words and senses with their {name} "
                f"equivalents, from Wiktionary's translation tables."
            ),
            "source": "Wiktionary (via Wiktextract)",
            "inputLanguages": ["English"],
            "outputLanguages": [name],
            "cover": "general-dictionary.jpg",
            "entries": entries,
        })

    # Direct pairs into Arabic: when one English sense lists both a German
    # and an Arabic translation, those two words mean the same thing.
    for lang in ("de", "fr", "es", "zh"):
        name = LANGUAGES[lang]
        entries = []
        for concept in ranked:
            sources = concept["tr"].get(lang)
            targets = concept["tr"].get("ar")
            if not sources or not targets:
                continue
            source_word, source_traditional = split_chinese(sources[0][0]) if lang == "zh" else (sources[0][0], "")
            entry = translation_entry(source_word, name, targets, "ar")
            extra = [split_chinese(word)[0] if lang == "zh" else word for word, _ in sources[1:3]]
            extra += [alias for alias in (source_traditional, sources[0][1]) if alias]
            if extra:
                entry["aliases"] = list(dict.fromkeys(extra + entry.get("aliases", [])))
            entries.append(entry)
        entries = dedupe(entries, ("source", "target"))[:MAX_GENERAL_ENTRIES]
        books.append({
            "id": f"{ID_PREFIX}-general-{lang}-ar",
            "title": f"General Dictionary ({name} to Arabic)",
            "type": "translation",
            "description": (
                f"{len(entries):,} {name} words paired directly with Arabic, matched through shared senses in "
                f"Wiktionary's translation tables rather than word-by-word through English."
            ),
            "source": "Wiktionary (via Wiktextract)",
            "inputLanguages": [name],
            "outputLanguages": ["Arabic"],
            "cover": "general-dictionary.jpg",
            "entries": entries,
        })
    return books


def build_cedict_book() -> dict:
    entries = dedupe(parse_cedict(), ("source", "target"))
    for entry in entries:
        entry["sourceLanguage"] = "Chinese"
        entry["targetLanguage"] = "English"
        if not entry["aliases"]:
            del entry["aliases"]
    return {
        "id": "cedict-zh-en",
        "title": "CC-CEDICT Chinese-English Dictionary",
        "type": "translation",
        "description": (
            f"{len(entries):,} entries from CC-CEDICT, the community Chinese-English dictionary. Search by "
            f"simplified or traditional characters, or by pinyin with or without tone marks."
        ),
        "source": "CC-CEDICT (MDBG)",
        "inputLanguages": ["Chinese"],
        "outputLanguages": ["English"],
        "cover": "cedict.jpg",
        "entries": entries,
    }


MONOLINGUAL_TITLES = {
    "fr": ("Dictionnaire du Wiktionnaire", "French definitions of French words, from the French Wiktionary (Wiktionnaire)."),
    "de": ("Wörterbuch aus dem Wiktionary", "German definitions of German words, from the German Wiktionary."),
    "es": ("Diccionario del Wikcionario", "Spanish definitions of Spanish words, from the Spanish Wiktionary (Wikcionario)."),
    "zh": ("維基詞典漢語詞典", "Chinese definitions of Chinese words, from the Chinese Wiktionary (維基詞典)."),
}


def build_monolingual_books(concepts: list[dict]) -> list[dict]:
    books = []
    for lang, (title, blurb) in MONOLINGUAL_TITLES.items():
        name = LANGUAGES[lang]
        # Words that appear in English translation tables come first: they
        # are the everyday vocabulary, where the rest skews rare or obsolete.
        common = Counter()
        for concept in concepts:
            for word, _ in concept["tr"].get(lang, []):
                common[word] += concept["pop"]
        native = extract_native(lang)
        native.sort(key=lambda entry: -common.get(entry["word"], 0))
        entries = []
        for entry in native:
            if len(entries) >= MAX_MONOLINGUAL_ENTRIES:
                break
            definitions = entry["defs"]
            text = definitions[0] if len(definitions) == 1 else " ".join(f"{i}. {d}" for i, d in enumerate(definitions, 1))
            entries.append({"term": entry["word"], "language": name, "definition": clean_gloss(text, MAX_DEFINITION_CHARS)})
        entries = dedupe(entries, ("term", "definition"))
        books.append({
            "id": f"{ID_PREFIX}-mono-{lang}",
            "title": title,
            "type": "dictionary",
            "description": f"{len(entries):,} entries. {blurb}",
            "source": "Wiktionary (via Wiktextract)",
            "inputLanguages": [name],
            "outputLanguages": [name],
            "cover": f"mono-{lang}.jpg",
            "entries": entries,
        })
    return books


def write_books(books: list[dict]) -> None:
    PACKS.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(CATALOG.read_text(encoding="utf8"))
    built_ids = {book["id"] for book in books}
    catalog = [item for item in catalog if item["id"] not in built_ids]

    for book in books:
        cover_url = f"/books/covers/{book['cover']}"
        payload = {
            "id": book["id"],
            "title": book["title"],
            "version": BOOK_VERSION,
            "type": book["type"],
            "description": book["description"],
            "coverUrl": cover_url,
            "inputLanguages": book["inputLanguages"],
            "outputLanguages": book["outputLanguages"],
            "entries": book["entries"],
        }
        pack_path = PACKS / f"{book['id']}.v1.json"
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        pack_path.write_text(data, encoding="utf8")
        catalog.append(annotate({
            "id": book["id"],
            "title": book["title"],
            "type": book["type"],
            "version": BOOK_VERSION,
            "description": book["description"],
            "source": book["source"],
            "sourceUrl": f"/books/packs/{pack_path.name}",
            "inputLanguages": book["inputLanguages"],
            "outputLanguages": book["outputLanguages"],
            "sizeBytes": len(data.encode("utf8")),
            "coverUrl": cover_url,
        }))
        log(f"  {book['id']}: {len(book['entries']):,} entries, {len(data) // 1024:,} KB")

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def main() -> None:
    concepts = extract_english_concepts()
    terms_by_lang = {lang: extract_foreign_terms(lang) for lang in LANGUAGES}

    books = []
    books += build_field_books(concepts, terms_by_lang)
    books += build_general_books(concepts)
    books.append(build_cedict_book())
    books += build_monolingual_books(concepts)

    log(f"Writing {len(books)} books...")
    write_books(books)
    log("Done.")


if __name__ == "__main__":
    sys.exit(main())
