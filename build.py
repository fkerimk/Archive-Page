import json, os
from pathlib import Path
from PIL import Image

BASE_DIR = Path('root').resolve()
PREVIEWABLE_TYPES = ['.md', '.py', '.js', '.css', '.html', '.json', '.sh', '.bat', '.cmd', '.txt', '.log', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.apng', '.ico', '.mp4', '.webm', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.pdf', '.glb']
ARCHIVE_EXTS = ['.zip', '.rar', '.7z', '.tar.gz', '.tar.xz', '.tar.bz2', '.tar']

EXT_MAP = {
    '.md': 'md', '.pdf': 'pdf', '.glb': '3d',
    **{k: 'code' for k in ['.py', '.js', '.css', '.html', '.json', '.sh', '.bat', '.cmd']},
    **{k: 'text' for k in ['.txt', '.log']},
    **{k: 'img' for k in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.apng', '.ico']},
    **{k: 'pro-img' for k in ['.bmp', '.dds', '.psd', '.tga', '.tif', '.tiff']},
    **{k: 'vid' for k in ['.mp4', '.webm']},
    **{k: 'aud' for k in ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.ac3', '.mp2', '.opus']},
    **{k: 'zip' for k in ['.zip', '.rar', '.7z', '.tar', '.gz']}
}

def get_size(path: Path) -> str:
    try:
        size = path.stat().st_size
        for unit in ('B', 'KB', 'MB', 'GB'):
            if size < 1024: return f'{size:.1f} {unit}'
            size /= 1024
        return f'{size:.1f} TB'
    except OSError: return ''

def read_text(path: Path) -> str:
    return path.read_text('utf-8') if path.exists() else ''

def build_item(path: Path, hidden_names: set[str]) -> dict | None:
    name, is_dir = path.name, path.is_dir()
    if not is_dir and name in hidden_names: return None

    ext = '' if is_dir else path.suffix.lower()
    item = {
        'name': name, 'path': path.relative_to(BASE_DIR).as_posix(), 'is_dir': is_dir,
        'type': 'dir' if is_dir else EXT_MAP.get(ext, 'other'), 'ext': ext,
        'size': '' if is_dir else get_size(path), 'tags': [],
        'source_archive': None, 'source_archive_size': None,
        'has_details': False, 'details_content': None, 'img_resolution': None
    }

    if not is_dir:
        tags_file = path.with_name(name + '.tags')
        if tags_file.exists():
            item['tags'] = sorted([t.strip() for t in read_text(tags_file).split(',') if t.strip()], key=str.casefold)

        for a_ext in ARCHIVE_EXTS:
            if (arc := path.with_name(name + a_ext)).exists():
                item['source_archive'] = arc.relative_to(BASE_DIR).as_posix()
                item['source_archive_size'] = get_size(arc)
                break

        if (dtl := Path(f'{path}.md')).exists():
            item['has_details'] = True
            item['details_content'] = read_text(dtl)

        if item['type'] == 'img':
            try:
                with Image.open(path) as img: item['img_resolution'] = f'{img.width}x{img.height}'
            except OSError: pass

    return item

def generate_manifest():
    items = []
    for root, dirs, files in os.walk(BASE_DIR):
        rpath = Path(root)
        vis = set(files)
        hidden = {f for f in files if f.endswith('.tags') and f[:-5] in vis or f.endswith('.md') and f[:-3] in vis}
        hidden.update(f for f in files for ext in ARCHIVE_EXTS if f.endswith(ext) and f[:-len(ext)] in vis)

        for name in sorted(dirs + files, key=str.casefold):
            if (item := build_item(rpath / name, hidden)): items.append(item)

    items.sort(key=lambda i: (
        not i['is_dir'],
        i['ext'] not in PREVIEWABLE_TYPES if not i['is_dir'] else False,
        i['type'], i['name'].casefold()
    ))

    out_path = Path('static/files.json').resolve()
    out_path.write_text(json.dumps({'previewable_types': PREVIEWABLE_TYPES, 'items': items}, ensure_ascii=False, indent=2), 'utf-8')
    print(f'Manifest written to {out_path} with {len(items)} items.')

if __name__ == '__main__':
    generate_manifest()