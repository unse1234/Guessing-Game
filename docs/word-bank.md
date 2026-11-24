# Drawing word bank

The backend ships one flat list of 8,526 short English prompts. The build copies the JSON with the API output. The server validates and normalizes it at startup. Gameplay uses the same in-memory bank for every room.

## Source and license

- **Open English WordNet 2025** supplies the vocabulary and sense definitions used for screening. Copyright 2019–present, the Open English WordNet Team, under CC BY 4.0. It incorporates Princeton WordNet 3.1, copyright 2011 Princeton University, under the WordNet License. [Open English WordNet release](https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition) · [Source license](https://github.com/globalwordnet/english-wordnet/blob/2025-edition/LICENSE.md) · [Included WordNet notice](wordnet-license.txt)
- **Open Images V7** trainable label names provide evidence that a concept has been pictured. The label annotations are copyright Google LLC under CC BY 4.0. [Labels and trainable classes](https://storage.googleapis.com/openimages/web/download_v7.html#download-image-labels-over-9m-images) · [Open Images license](https://storage.googleapis.com/openimages/web/factsfigures_v7.html#licenses)
- **wordfreq 3.1.1**, by Robyn Speer, supplies a familiarity estimate for individual words during offline screening. Its data is CC BY-SA 4.0 and includes SUBTLEX data by Marc Brysbaert and colleagues, freely available under the attribution terms described by wordfreq. The estimate also draws on Google Books Ngrams, the Leeds Internet Corpus, Wikipedia, ParaCrawl, OpenSubtitles, and the other sources credited by wordfreq. [wordfreq license and credits](https://github.com/rspeer/wordfreq#license)
- **Shutterstock's English keyword filter** was used alongside lexical definitions and project-specific exclusions for offline content screening. Copyright 2012–2020 Shutterstock, Inc., under CC BY 4.0. [Filter source and license](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words#license)

The curated JSON adapts these inputs through selection, spelling deduplication, and the addition of existing project prompts. The resulting data file is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keep the source credits and the WordNet notice with redistributed copies of the data. The build includes only prompt text.

## Updating the data

The offline generator checks WordNet definitions and relationships. Candidates must also appear as trainable image labels or have a wordfreq Zipf score of at least 4.0 for each component. It filters unsuitable terms, omits many generic and specialized entries, deduplicates variants with and without spaces or hyphens, and admits at most three components per prompt. Quality checks included reviewing a cross-section of the resulting list. Some specialized and regional vocabulary remains.

Download these files for a reproducible rebuild. Python and `wordfreq==3.1.1` are needed only when regenerating the list.

| Input                                                                                                                               | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [WordNet XML](https://en-word.net/static/english-wordnet-2025.xml.gz)                                                               | `9ca6d1dcb75f822fdd66617f7d9da48142ace38dd544d6ad5e2feca1674ad3fe` |
| [Open Images labels](https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv)                                     | `84a4373a0efb7fd6d93fe19b0e7ce6c1b855c233d13b9b78a9a33655c9fdce3`  |
| [Trainable IDs](https://storage.googleapis.com/openimages/v7/oidv7-classes-trainable.txt)                                           | `52ed63c72607cbc779e02a8eed8aaded72df1a5a80e4d79a16a834f6584c25a0` |
| [English keyword filter](https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en) | `af851ecef1d5f212caba17339b12ac39cc2fef7d78c74876f67237644fcee8bd` |

```powershell
python -m pip install wordfreq==3.1.1
python apps/api/scripts/build-word-bank.py english-wordnet-2025.xml.gz oidv7-class-descriptions.csv oidv7-classes-trainable.txt en apps/api/src/game/words/word-bank.json
pnpm exec prettier --write apps/api/src/game/words/word-bank.json
pnpm --filter @draw-and-guess/api... build
pnpm --filter @draw-and-guess/api exec node --test test/word-bank.test.mjs
node apps/api/scripts/benchmark-word-pool.mjs
```

The local benchmark on Windows with Node.js 26.13.1 and an AMD Ryzen 5 7430U measured 5,000 pools over 16 turns each after 500 warm-up games. Per-game mean selection time per turn was 0.27 µs median and 0.46 µs p95. The measurement includes pool creation and release.

## Selection and exhaustion

Each game creates an independent pool of virtual indices into the shared bank. Each draw picks a random unused slot and swaps it with the last unused slot. A sparse map records only changed positions. Three draws remove all three options from that game's pool. Reconnection restores the active turn's original options from the server. A game started after Play Again gets a fresh pool, and finished games release their swap maps.

With eight players and two rotations, a game can offer at most 48 prompts. The API refuses to start if the bank cannot cover that schedule. The sampler rejects a request for three options when fewer than three remain, before removing anything. It never falls back to earlier options.

The existing 15-second turn timer chooses randomly from the drawer's original three options on expiry. Private delivery and reconnect use the existing drawer-only events. The public drawing view contains a mask, and the answer can be revealed in the completed turn summary. An index built once at startup preserves the existing bank-wide chat masking rule. Because it also matches substrings, some unrelated guesses may appear as an ellipsis.
