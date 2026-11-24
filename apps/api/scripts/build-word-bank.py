"""Build the flat drawing prompt list from the versioned sources in docs/word-bank.md."""

import argparse
import csv
import gzip
import json
import re
from functools import cache
from pathlib import Path
from xml.etree import ElementTree

from wordfreq import zipf_frequency


VISUAL_SENSES = {
    'noun.animal', 'noun.artifact', 'noun.body', 'noun.food', 'noun.location',
    'noun.object', 'noun.plant', 'noun.shape',
}
BLOCKED_ROOTS = {
    'oewn-04572661-n',  # Weapon
    'oewn-02706134-n',  # Ammunition
    'oewn-03310467-n',  # Explosive device
    'oewn-03252323-n',  # Drug
    'oewn-07900542-n',  # Alcoholic beverage
    'oewn-92461436-n',  # Tobacco product
    'oewn-06578068-n',  # Software
    'oewn-05244557-n',  # Anatomical system
}
VISIBLE_ANATOMY = {
    line
    for line in """
ankle|arm|armpit|back|beard|belly|belly button|bicep|bone|cheek|chest|chin|claw|
dimples|ear|elbow|eye|eyebrow|eyelash|face|feet|finger|fingernail|fist|foot|
freckle|front tooth|hair|hand|head|heart|heel|hip|index finger|jaw|knee|knuckle|
leg|lip|little finger|lower lip|mouth|mustache|moustache|neck|nose|nostril|
palm|pinkie|ponytail|pupil|rib|scar|shin|shoulder|skeleton|skin|skull|smile|
spine|stomach|teeth|tendon|thumb|toe|toenail|tongue|tooth|waist|wrist|wrinkle
""".replace('\n', '').split('|')
    if line
}
EXCLUDE_WORDS = set("""
access affair ai allowance alignment amount application area axis basis brink
boundary charge class code combination commodity comfort communication condition
connection course coverage data danger direction distance effect element
enforcement environment episode equipment exterior fault feature font format framework
function genre grade group habitat headquarters height here high identity indoor
information instance interior issue kill layout length level line link living
location local load man manner market material matrix medium method mode model
moment nature network nowhere number object objective offset operation order outdoor
part point position premise price product profile project range rate reference region
related relative resident rig roll route row section sequence series serum service
shape side size situation slot somewhere source space standard station status
straight structure stuff study surround system target technique terminal
text there thing tick title tone total trace trait type unit value variation
way weight whole width world zone wrong answer guess chat
add-on back-end beaten-up check contact device eight-spot formula game graham links
mass middle remote trump
""".split())
EXCLUDE_WORDS |= {
    'black body', 'body bag', 'body of work', 'consumer goods', 'double gold',
    'force feed', 'forward market', 'grade separation', 'hard shoulder',
    'hell on earth', 'high point', 'hot seat', 'human race', 'liberty cap',
    'medical dressing', 'piece of work', 'place of business', 'running pop',
    'safety measure', 'small white', 'solid fuel rocket', 'terminal point',
    'time zone', 'true bird', 'true bug', 'true cat', 'true frog', 'true pine',
}
SENSITIVE_TOKENS = set("""
abortion adult ammo anaesthetic anesthetic arsenic assault biological bomb bombs
cannabis chemical cigarette cigar cocaine corpse drugs explosive firing firearm
firearms genocide gun guns heroin kill killing lingerie marijuana methamphetamine
military missile narcotic nicotine nude naked nuclear pornography rifle rifles
sexual sex shotguns sniper stun suicide tobacco torture toxic vape vodka weapon
weapons whiskey wine whisky alcohol alcoholic beer blood booze cancer
cancerous casualty death drug funeral grave graveyard infection intravenous liquor
obituary poison poisoning prison psychiatric war
""".split())
UNSUITABLE_DEFINITION = re.compile(
    r'\b(?:vulgar|derogatory|obscene|racial slur|slang term|archaic|obsolete|'
    r'genitals?|sexual|pornograph\w*|orgasm|nudity|prostitut\w*|narcotic|tortur\w*)\b',
    re.IGNORECASE,
)
PROMPT = re.compile(r'[a-z]+(?:[ -][a-z]+){0,2}')
SEED = """
elephant|giraffe|penguin|dolphin|rabbit|butterfly|lion|turtle|owl|whale|apple|
banana|pizza|carrot|sandwich|popcorn|strawberry|pancake|watermelon|cupcake|
umbrella|backpack|pencil|clock|scissors|candle|glasses|key|balloon|bookshelf|
laptop|camera|computer|keyboard|robot|headphones|microphone|television|flashlight|
calculator|bridge|mountain|house|beach|castle|lighthouse|library|waterfall|volcano|
playground|bicycle|airplane|train|boat|bus|helicopter|scooter|spaceship|truck|submarine
""".replace('\n', '').split('|')


def build(source, labels_file, trainable_file, screening_file):
    with gzip.open(source, 'rb') as compressed:
        lexicon = ElementTree.parse(compressed).getroot().find('Lexicon')
    synsets = {node.get('id'): node for node in lexicon.findall('Synset')}
    trainable = set(trainable_file.read_text(encoding='utf-8').splitlines())
    with labels_file.open(encoding='utf-8', newline='') as file:
        labels = {
            row['DisplayName'].lower()
            for row in csv.DictReader(file)
            if row['LabelName'] in trainable
        }

    blocked = {
        tuple(re.findall(r'[a-z]+', line.lower()))
        for line in screening_file.read_text(encoding='utf-8').splitlines()
    }
    blocked.discard(())
    # Test whole tokens and phrases, so a fragment such as "ass" does not remove "glass".
    token_blocklist = {parts[0] for parts in blocked if len(parts) == 1}
    token_blocklist |= SENSITIVE_TOKENS

    @cache
    def blocked_ancestry(synset_id):
        return synset_id in BLOCKED_ROOTS or any(
            blocked_ancestry(relation.get('target'))
            for relation in synsets[synset_id].findall('SynsetRelation')
            if relation.get('relType') in {'hypernym', 'instance_hypernym'}
            and relation.get('target') in synsets
        )

    @cache
    def allowed_sense(synset_id):
        synset = synsets[synset_id]
        return (synset.get('lexfile') in VISUAL_SENSES
                and not blocked_ancestry(synset_id)
                and not UNSUITABLE_DEFINITION.search(synset.findtext('Definition', '')))

    @cache
    def familiarity(token):
        return zipf_frequency(token, 'en')

    def spelling_key(word):
        return word.replace('-', '').replace(' ', '')

    choices = {spelling_key(word): (float('inf'), word) for word in SEED}
    for entry in lexicon.findall('LexicalEntry'):
        lemma = entry.find('Lemma')
        word = lemma.get('writtenForm')
        if (lemma.get('partOfSpeech') != 'n' or not 3 <= len(word) <= 30
                or not PROMPT.fullmatch(word) or word in EXCLUDE_WORDS):
            continue
        tokens = tuple(re.split('[- ]', word))
        if token_blocklist.intersection(tokens) or any(
            tokens[start:end] in blocked
            for start in range(len(tokens))
            for end in range(start + 2, len(tokens) + 1)
        ):
            continue
        senses = [
            sense.get('synset') for sense in entry.findall('Sense')
            if allowed_sense(sense.get('synset'))
        ]
        if not any(
            synsets[sense].get('lexfile') != 'noun.body' or word in VISIBLE_ANATOMY
            for sense in senses
        ):
            continue
        frequency = min(familiarity(token) for token in tokens)
        if word not in labels and frequency < 4.0:
            continue
        key = spelling_key(word)
        rank = frequency + (1 if word in labels else 0)
        score = (rank, word)
        if key not in choices or score > choices[key]:
            choices[key] = score
    return sorted(word for _, word in choices.values())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ('wordnet', 'labels', 'trainable', 'screening', 'output'):
        parser.add_argument(argument, type=Path)
    args = parser.parse_args()
    words = build(args.wordnet, args.labels, args.trainable, args.screening)
    args.output.write_text(json.dumps(words, indent=2) + '\n', encoding='utf-8')
    print(f'{len(words):,} unique drawing prompts')
