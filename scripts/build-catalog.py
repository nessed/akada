"""
Regenerate `lib/catalog/<term>.ts` from the registrar course memo, with
meeting times and rooms merged in from LUMS Pro Planner.

    python scripts/build-catalog.py "Fall Semester 2026 - Course Memo.xlsx"

Two sources, because neither is complete on its own:

  * The **course memo** (registrar, one row per section) is authoritative for
    what exists — course codes, titles, credits, components, section labels,
    instructors. It publishes an actual day/time for only ~16% of sections.

  * **LUMS Pro Planner** (https://lumsproplanner.com/Courses.json) is a
    public, CORS-open dataset maintained by Muhammad Sohaib Shahzad, a LUMS
    student — "from a student, for the students". It carries a day, a start
    and an end time for every section it lists, and a room for 93% of them.
    Downloaded to a local snapshot so a build never depends on it being up.

The memo leads; the planner fills in when and where. Where only the planner
knows about a section, it is added — after add/drop the memo goes stale and
it does not.

Standard library only (an xlsx is just a zip of XML), so there is nothing to
install before running it.
"""

import argparse
import io
import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import OrderedDict

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

# Subject-area code -> the name a student would actually search for. Search
# matches this as well as the code, so "computer science" finds the CS list.
DEPARTMENTS = {
    'ACCT': 'Accounting', 'ACF': 'Accounting & Finance', 'AI': 'Artificial Intelligence',
    'ANTH': 'Anthropology', 'AST': 'Astronomy', 'BIO': 'Biology', 'CHE': 'Chemical Engineering',
    'CHEM': 'Chemistry', 'CLCA': 'Communication & Learning', 'CS': 'Computer Science',
    'DISC': 'Data Science', 'ECON': 'Economics', 'EDU': 'Education', 'EDUX': 'Education',
    'EE': 'Electrical Engineering', 'EMBA': 'Business Administration', 'ENGG': 'Engineering',
    'ENGL': 'English', 'ENV': 'Environmental Science', 'FINN': 'Finance',
    'FMG': 'Business Administration', 'GSL': 'Law', 'GSS': 'Gender Studies',
    'HIST': 'History', 'HMI': 'Business Administration', 'HSS': 'Humanities & Social Sciences',
    'HUM': 'Humanities', 'LANG': 'Languages', 'LAW': 'Law', 'MATH': 'Mathematics',
    'MBA': 'Business Administration', 'MECO': 'Managerial Economics', 'MGMT': 'Management',
    'MKTG': 'Marketing', 'ORSC': 'Organisational Science', 'PHIL': 'Philosophy',
    'PHY': 'Physics', 'POL': 'Political Science', 'PSY': 'Psychology', 'REL': 'Religion',
    'SCI': 'Science', 'SCP': 'Science', 'SCRM': 'Supply Chain Management',
    'SOC': 'Sociology', 'SS': 'Social Sciences', 'SSE': 'Science & Engineering',
    'SWR': 'Social Work', 'TME': 'Technology Management',
}

# Labelling every lecture "Lecture" is noise, so LEC maps to nothing; the rest
# are worth calling out because they enrol separately from the lecture.
COMPONENTS = {
    'LEC': None,
    'LAB': 'Lab', 'RAC': 'Recitation', 'PRT': 'Project', 'SEM': 'Seminar', 'FLD': 'Field',
}

# "Section 3" in the notes <-> "S3" on the row.
DETAIL_PREFIX = {'section': 'S', 'lab': 'L', 'recitation': 'R', 'project': 'P'}

DAY_ABBR = [
    ('monday', 'Mon'), ('tuesday', 'Tue'), ('wednesday', 'Wed'), ('thursday', 'Thu'),
    ('friday', 'Fri'), ('saturday', 'Sat'), ('sunday', 'Sun'),
]

PLACEHOLDER_NAMES = {'tba', 'tbd', 'staff', 'n/a', 'na', 'to be announced', 'to be determined'}

TIMES_A_WEEK = {'1': 'Once a week', '2': 'Twice a week'}

PLANNER_URL = 'https://lumsproplanner.com/Courses.json'
PLANNER_SNAPSHOT = 'scripts/planner-courses.json'

# The planner keys a section by component and number ("LEC" 1); the memo, and
# Zambeel, label the same thing "S1". These are the memo's own prefixes.
COMPONENT_PREFIX = {
    'LEC': 'S', 'LAB': 'L', 'RAC': 'R', 'REC': 'R', 'SEM': 'M', 'PRT': 'P', 'FLD': 'F',
}

DAY_SHORT = {
    'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed', 'thursday': 'Thu',
    'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun',
}


# -- xlsx reading ------------------------------------------------------

def read_sheet(path, sheet_name):
    """Yield the named worksheet's rows as lists of strings."""
    z = zipfile.ZipFile(path)

    shared = []
    try:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
    except KeyError:
        pass

    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    target = None
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).iter(NS + 'sheet'):
        if sheet.get('name') == sheet_name:
            target = rels[sheet.get(RNS + 'id')]
    if target is None:
        raise SystemExit('no "%s" sheet in %s' % (sheet_name, path))
    if not target.startswith('xl/'):
        target = 'xl/' + target.lstrip('/')

    def column_index(ref):
        letters = re.match(r'([A-Z]+)', ref).group(1)
        n = 0
        for ch in letters:
            n = n * 26 + ord(ch) - 64
        return n - 1

    for row in ET.fromstring(z.read(target)).iter(NS + 'row'):
        cells = {}
        for c in row.iter(NS + 'c'):
            kind, v, inline = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
            if kind == 'inlineStr' and inline is not None:
                value = ''.join(t.text or '' for t in inline.iter(NS + 't'))
            elif v is None:
                continue
            elif kind == 's':
                value = shared[int(v.text)]
            else:
                value = v.text
            cells[column_index(c.get('r'))] = value.strip()
        if cells:
            yield [cells.get(i, '') for i in range(max(cells) + 1)]


# -- field cleanup -----------------------------------------------------

PLACEHOLDER_PATTERN = re.compile(r'not announced|to be announced|to be determined', re.I)


def clean_person(value):
    """Instructor names, with registrar placeholders dropped rather than shown."""
    name = re.sub(r'\s+', ' ', value or '').strip(' ,;.')
    if name.lower().strip(' .') in PLACEHOLDER_NAMES:
        return ''
    return '' if PLACEHOLDER_PATTERN.search(name) else name


def format_teaching_staff(names):
    """
    Co-taught sections get one row per instructor. Two names fit a picker row;
    beyond that the count says more than a truncated list would.
    """
    unique = list(OrderedDict.fromkeys(n for n in names if n))
    if len(unique) <= 2:
        return ' & '.join(unique)
    return '%s & %d others' % (unique[0], len(unique) - 1)


def format_meeting(raw):
    """
    Normalise the handful of day/time spellings the memo uses into one short
    form: "Mon & Wed, 12:30 PM - 1:45 PM". Anything unrecognised is dropped
    rather than shown half-parsed.
    """
    text = re.sub(r'\s+', ' ', (raw or '').replace('–', '-').replace('—', '-')).strip()
    if not text:
        return ''

    times = re.findall(r'(\d{1,2}):(\d{2})\s*([APap])\.?[Mm]\.?', text)
    days_part = re.split(r'[,;]|\d', text, 1)[0].strip(' ,-')

    days = days_part
    for full, short in DAY_ABBR:
        days = re.sub(full, short, days, flags=re.I)
    days = re.sub(r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b', r'\1', days)
    days = re.sub(r'\s*(&|and|/)\s*', ' & ', days, flags=re.I).strip(' ,&')
    if not re.search(r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b', days):
        return ''

    if len(times) < 2:
        return days
    start, end = times[0], times[1]
    span = '%d:%s %sM - %d:%s %sM' % (
        int(start[0]), start[1], start[2].upper(),
        int(end[0]), end[1], end[2].upper(),
    )
    return '%s, %s' % (days, span)


def format_cadence(per_week, minutes):
    """
    Every row states how often a section meets and for how long, even the ones
    that never publish a slot on the timetable. It is not a time of day, but
    it is the only thing most sections can say about their shape, so it stands
    in for one: "Twice a week - 75 min".
    """
    if not per_week or not minutes:
        return ''
    how_often = TIMES_A_WEEK.get(per_week, '%s times a week' % per_week)
    return '%s - %s min' % (how_often, minutes)


def load_planner(refresh):
    """
    The planner snapshot, refreshed from the network only when asked. Builds
    stay reproducible and keep working when the site is down or gone.
    """
    if refresh or not os.path.exists(PLANNER_SNAPSHOT):
        print('fetching %s' % PLANNER_URL)
        with urllib.request.urlopen(PLANNER_URL, timeout=60) as response:
            payload = response.read().decode('utf-8')
        with io.open(PLANNER_SNAPSHOT, 'w', encoding='utf-8', newline='\n') as f:
            f.write(payload)
    with io.open(PLANNER_SNAPSHOT, encoding='utf-8') as f:
        return json.load(f)


def format_planner_meeting(schedule):
    """"Mon & Wed, 12:30 PM - 1:45 PM" out of the planner's day list and times."""
    days = [DAY_SHORT.get((day or '').lower(), '') for day in schedule.get('Days') or []]
    days = [day for day in days if day]
    start, end = schedule.get('Start Time'), schedule.get('End Time')
    if not days or not start or not end:
        return ''

    def meridiem(value):
        # "12:30pm" -> "12:30 PM"
        match = re.match(r'\s*(\d{1,2}):(\d{2})\s*([APap])\.?[Mm]?\.?\s*$', value or '')
        if not match:
            return (value or '').strip()
        return '%d:%s %sM' % (int(match.group(1)), match.group(2), match.group(3).upper())

    # Two days read best joined; a longer list wants commas, and a section
    # that runs every day should just say so.
    if len(days) == 7:
        spelled = 'Daily'
    elif len(days) > 2:
        spelled = ', '.join(days)
    else:
        spelled = ' & '.join(days)

    return '%s, %s - %s' % (spelled, meridiem(start), meridiem(end))


def format_room(venue):
    """
    "A-1 - Academic Block" is how the planner writes a room. The room and the
    building are joined with a comma rather than a middle dot, because the
    picker uses the dot to separate the fields around it.

    A venue that only says it does not know yet is dropped: an empty room
    reads as "not stated", which is the truth, where "Not Announced Yet"
    reads as a room.
    """
    room = re.sub(r'\s+', ' ', (venue or '').replace(' - ', ', ')).strip()
    if re.search(r'not announced|to be announced|tba|tbd', room, re.I):
        return ''
    return room


def planner_sections(planner):
    """
    Flatten the planner into { ('ACCT', '100'): { 'S1': {...} } }, keyed the
    way the memo labels a section so the two can be joined.
    """
    out = {}
    for subject, catalog in (planner.get('Course List') or {}).items():
        for number, course in catalog.items():
            sections = {}
            for component in course.get('Available Components') or []:
                prefix = COMPONENT_PREFIX.get(component, 'S')
                for index, section in (course.get(component) or {}).items():
                    label = '%s%s' % (prefix, index)
                    sections[label] = {
                        'component': COMPONENTS.get(component),
                        'meets': format_planner_meeting(section.get('Schedule') or {}),
                        'room': format_room(section.get('Venue')),
                        'instructor': format_teaching_staff(
                            [clean_person(name) for name in section.get('Instructors') or []]),
                    }
            if sections:
                out[(subject, number)] = {
                    'title': re.sub(r'\s+', ' ', course.get('Title') or ''),
                    'credits': course.get('Credits'),
                    'sections': sections,
                }
    return out


def parse_section_details(blob):
    """
    Pull { 'S1': {'meets': ..., 'instructor': ...} } out of the free-text
    "Section Details" block some courses carry in Additional Information.
    """
    if 'Section Details' not in (blob or ''):
        return {}

    tail = blob.split('Section Details', 1)[1]
    headings = list(re.finditer(
        r'^[ \t]*(Section|Lab|Recitation|Project)\s*(\d+)[ \t]*$', tail, re.M | re.I))

    details = {}
    for i, head in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(tail)
        body = tail[head.end():end]
        label = DETAIL_PREFIX[head.group(1).lower()] + head.group(2)
        meets = re.search(r'Day\s*/\s*Time\s*:\s*(.+)', body)
        instructor = re.search(r'Instructor\s*:\s*(.+)', body)
        details[label] = {
            'meets': format_meeting(meets.group(1)) if meets else '',
            'instructor': clean_person(instructor.group(1)) if instructor else '',
        }
    return details


def ts_string(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


# -- build -------------------------------------------------------------

def build(path, sheet_name, planner):
    rows = read_sheet(path, sheet_name)
    header = next(rows)
    at = {name: i for i, name in enumerate(header)}

    def cell(row, name):
        i = at.get(name, -1)
        return row[i] if 0 <= i < len(row) else ''

    courses = OrderedDict()
    for row in rows:
        subject, catalog = cell(row, 'Subj Area'), cell(row, 'Catalog')
        if not subject or not catalog:
            continue
        code = '%s %s' % (subject, catalog)

        course = courses.get(code)
        if course is None:
            credits = cell(row, 'Total Credits')
            try:
                credits = float(credits)
                credits = int(credits) if credits.is_integer() else credits
            except ValueError:
                credits = None
            course = courses[code] = {
                'code': code,
                'key': (subject, catalog),
                'title': re.sub(r'\s+', ' ', cell(row, 'Course Title')),
                'credits': credits,
                'department': DEPARTMENTS.get(subject, ''),
                'sections': OrderedDict(),
                'details': {},
            }
        course['details'].update(parse_section_details(cell(row, 'Additional Information')))

        label = cell(row, 'Section')
        if not label:
            continue
        # A co-taught section is one row per instructor, so repeat labels
        # collect names rather than overwrite each other.
        section = course['sections'].setdefault(label, {
            'id': label,
            'component': COMPONENTS.get(cell(row, 'Component')),
            'staff': [],
            'meets': '',
            'cadence': format_cadence(cell(row, 'Class(es) Per Week'),
                                      cell(row, 'Minutes Per Session')),
            'room': '',
        })
        section['staff'].append(clean_person(cell(row, 'Instructor Name')))

    schedule = planner_sections(planner)
    matched = added = 0

    for course in courses.values():
        published = schedule.get(course['key'], {})
        timings = published.get('sections', {})

        for label, section in course['sections'].items():
            detail = course['details'].get(label)
            section['instructor'] = (format_teaching_staff(section.pop('staff'))
                                     or (detail or {}).get('instructor', ''))
            # Three sources for when a section meets, best first: the planner,
            # which has one for everything it lists; the memo's own notes,
            # which cover a sixth of them; and failing both, how often and how
            # long it runs.
            timing = timings.get(label)
            if timing and timing['meets']:
                section['meets'] = timing['meets']
                section['room'] = timing['room']
                section['instructor'] = section['instructor'] or timing['instructor']
                matched += 1
            else:
                section['meets'] = (detail or {}).get('meets', '')
            if section['meets']:
                section['cadence'] = ''

        # A section the planner knows about and the memo does not — the memo
        # is a snapshot from before enrolment, and sections open after it.
        for label, timing in timings.items():
            if label in course['sections']:
                continue
            course['sections'][label] = {
                'id': label,
                'component': timing['component'],
                'instructor': timing['instructor'],
                'meets': timing['meets'],
                'room': timing['room'],
                'cadence': '',
            }
            added += 1

        # Lectures first, then the labs and recitations that enrol alongside
        # them, so the picker's list opens on the choice most people want.
        course['sections'] = OrderedDict(
            sorted(course['sections'].items(),
                   key=lambda kv: (bool(kv[1]['component']), kv[0])))

        del course['details']
        del course['key']

    print('planner: %d sections timed, %d added that the memo lacked' % (matched, added))

    return list(courses.values())


def render(courses, export_name, term, source):
    def section_literal(section):
        parts = ['id: ' + ts_string(section['id'])]
        for key in ('component', 'instructor', 'meets', 'room', 'cadence'):
            if section.get(key):
                parts.append('%s: %s' % (key, ts_string(section[key])))
        return '{ ' + ', '.join(parts) + ' }'

    out_path = 'lib/catalog/%s.ts' % export_name.lower().replace('_', '-')
    lines = [
        "import type { CatalogCourse } from './types';",
        '',
        '/**',
        ' * %s course catalog - GENERATED, do not edit by hand.' % term,
        ' *',
        ' * Source: %s (registrar memo, one row per section).' % source,
        ' * Regenerate with:',
        ' *   python scripts/build-catalog.py "%s" \\' % source,
        ' *       --out %s --export %s --term "%s"' % (out_path, export_name, term),
        ' *',
        ' * Sources: the registrar memo for what exists, and LUMS Pro Planner',
        ' * (https://lumsproplanner.com, by Muhammad Sohaib Shahzad) for when and',
        ' * where each section meets. A section with neither a published slot nor a',
        ' * planner entry carries `cadence` instead - how often it meets and for how',
        ' * long, which is all the memo says about when those ones run.',
        ' *',
        ' * Pointing the app at a different term is a one-line change in',
        ' * `lib/catalog/index.ts` - see ACTIVE_CATALOG there.',
        ' */',
        'export const %s: CatalogCourse[] = [' % export_name,
    ]

    by_department = OrderedDict()
    for course in courses:
        by_department.setdefault(course['department'] or 'Other', []).append(course)

    for department, group in by_department.items():
        lines.append('  // %s' % department)
        for course in group:
            head = ['code: ' + ts_string(course['code']),
                    'title: ' + ts_string(course['title'])]
            if course['credits'] is not None:
                head.append('credits: %s' % course['credits'])
            if course['department']:
                head.append('department: ' + ts_string(course['department']))
            sections = list(course['sections'].values())
            lines.append('  {')
            lines.append('    ' + ', '.join(head) + ',')
            if sections:
                lines.append('    sections: [')
                for section in sections:
                    lines.append('      ' + section_literal(section) + ',')
                lines.append('    ],')
            lines.append('  },')
        lines.append('')

    lines.append('];')
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook')
    parser.add_argument('--sheet', default='Courses')
    parser.add_argument('--out', default='lib/catalog/fall-2026.ts')
    parser.add_argument('--export', dest='export_name', default='FALL_2026')
    parser.add_argument('--term', default='Fall 2026')
    parser.add_argument('--refresh-planner', action='store_true',
                        help='re-download the planner snapshot before building')
    args = parser.parse_args()

    planner = load_planner(args.refresh_planner)
    courses = build(args.workbook, args.sheet, planner)
    with open(args.out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(render(courses, args.export_name, args.term, args.workbook))

    sections = sum(len(c['sections']) for c in courses)
    timed = sum(1 for c in courses for s in c['sections'].values() if s['meets'])
    roomed = sum(1 for c in courses for s in c['sections'].values() if s.get('room'))
    print('%s: %d courses, %d sections, %d timed, %d with a room'
          % (args.out, len(courses), sections, timed, roomed))


if __name__ == '__main__':
    main()
