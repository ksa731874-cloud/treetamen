from pathlib import Path

base = Path('.')
html_files = list(base.rglob('*.html'))
inserted = []
for path in html_files:
    text = path.read_text(encoding='utf-8')
    if '<meta name="robots"' in text or "<meta name='robots'" in text:
        continue

    lower_text = text.lower()
    head_index = lower_text.find('<head>')
    if head_index == -1:
        continue

    insert_pos = lower_text.find('<meta name="viewport"', head_index)
    if insert_pos == -1:
        insert_pos = lower_text.find('<meta charset="utf-8"', head_index)
    if insert_pos == -1:
        insert_pos = lower_text.find('<meta charset=', head_index)

    if insert_pos != -1:
        end_tag = text.find('>', insert_pos)
        if end_tag != -1:
            insert_pos = end_tag + 1
    else:
        insert_pos = head_index + len('<head>')

    if insert_pos == -1:
        continue

    robots_tag = '\n    <meta name="robots" content="noindex, nofollow, noimageindex">'
    text = text[:insert_pos] + robots_tag + text[insert_pos:]
    path.write_text(text, encoding='utf-8')
    inserted.append(str(path))

print(f'Updated {len(inserted)} HTML files')
for p in inserted:
    print(p)

robots_path = base / 'public' / 'robots.txt'
robots_path.write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')
print(f'Created {robots_path}')
