import os
import re
import base64
import shutil
import urllib3
from pathlib import Path
from urllib.parse import unquote

from html.parser import HTMLParser
from typing import List

full_size = 0
compressed_size = 0

class _ScriptExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self._collect = False
        self._has_src = False
        self._buffer: List[str] = []
        self.scripts: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            attrs_dict = {name.lower(): val for name, val in attrs}
            if "src" in attrs_dict:
                self._has_src = True
                self._collect = False
            else:
                self._has_src = False
                self._collect = True
                self._buffer = []

    def handle_endtag(self, tag):
        if tag.lower() == "script":
            if self._collect and not self._has_src:
                content = "".join(self._buffer)
                self.scripts.append(content)
            self._collect = False
            self._has_src = False
            self._buffer = []

    def handle_data(self, data):
        if self._collect and not self._has_src:
            self._buffer.append(data)

    def handle_comment(self, data):
        if self._collect and not self._has_src:
            # keep comments inside script if present
            self._buffer.append(f"<!--{data}-->")

    def handle_entityref(self, name):
        if self._collect and not self._has_src:
            self._buffer.append(f"&{name};")

    def handle_charref(self, name):
        if self._collect and not self._has_src:
            self._buffer.append(f"&#{name};")


def final_pass_check(filename):
    if exists("html-minifier-next"):
        print("[+] Running final pass with html-minifier-next...", flush=True, end="")
        output_filename = filename.replace('.html', '.min.html')
        os.system(f"npx html-minifier-next --collapse-whitespace --remove-comments --minify-css true --minify-js true {filename} -o {output_filename}")
        before_size = os.path.getsize(filename)
        after_size = os.path.getsize(output_filename)
        print(f"done ({bytes_string(before_size)} -> {bytes_string(after_size)}")
        
        
            
def embed_fonts_in_css(css_file, output_file):
    css_path = Path(css_file).resolve()
    base_dir = css_path.parent

    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    def replace_font_url(match):
        url = match.group(1).strip('\'"')
        if "?" in url:
            url = url.split('?')[0]
        if url.startswith('data:'):
            return match.group(0)  # already embedded

        font_path = base_dir / unquote(url)
        font_path = font_path.resolve()
        if not font_path.exists():
            print(f"[!] Font file not found: {font_path}")
            return match.group(0)

        ext = font_path.suffix.lower().lstrip('.')
        mime = {
            'woff2': 'font/woff2',
            'woff': 'font/woff',
            'ttf': 'font/ttf',
            'otf': 'font/otf',
            'eot': 'application/vnd.ms-fontobject',
            'svg': 'image/svg+xml',
        }.get(ext, 'application/octet-stream')
        print (f"\t[+] Embedding font: {os.path.basename(font_path)} ({mime})")

        with open(font_path, 'rb') as f:
            encoded = base64.b64encode(f.read()).decode('utf-8')

        data_url = f"data:{mime};base64,{encoded}"
        return f"url('{data_url}')"

    # Replace all font-face url(...) instances
    css_out = re.sub(r"url\(([^)]+)\)", replace_font_url, css)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(css_out)

    print(f"[+] Embedded fonts written to: {os.path.basename(output_file)}")

def humanize_bytes(n: int) -> str:
    for unit in ("B", "kB", "MB", "GB", "TB", "PB", "EB"):
        if n < 1000 or unit == "EB":
            s = f"{n:.1f} {unit}"
            # drop trailing .0 (e.g., "1.0 MB" -> "1 MB")
            return s.replace(".0 ", " ")
        n /= 1000
    # fallback, shouldn't normally hit because of "EB" cap
    return f"{n:.1f} EB"


def bytes_string(n: int) -> str:
    return f"{n} bytes ({humanize_bytes(n)})"

def exists(bin_name: str) -> bool:
    # First, check the PATH
    if shutil.which(bin_name) is not None:
        return True

    # Also check common local Node.js bin folders (project-local installs)
    # Search upwards from both CWD and this script's directory
    start_points = {Path.cwd().resolve(), Path(__file__).resolve().parent}
    candidate_dirs = set()
    for start in start_points:
        for p in [start, *start.parents]:
            for nm in ("node_modules", "node_libraries"):
                candidate_dirs.add(p / nm / ".bin")

    # Build candidate executable names (Windows extensions if needed)
    candidates = {bin_name}
    if os.name == 'nt' and not any(bin_name.lower().endswith(ext) for ext in ('.cmd', '.exe', '.bat')):
        for ext in ('.cmd', '.exe', '.bat'):
            candidates.add(bin_name + ext)

    for d in candidate_dirs:
        if d.is_dir():
            for name in candidates:
                exe_path = d / name
                if exe_path.exists() and os.access(exe_path, os.X_OK):
                    return True

    return False

def check_terser_exists():
    return exists('terser')

def compress_file(filename):
    global full_size, compressed_size
    if not check_terser_exists():
        print("Terser is not installed. Please install it to compress files.")
        return False
    output_filename = filename.replace('.js', '.min.js')
    rv = os.system(f"npx terser -c -o {output_filename} {filename}")
    if rv == 0:
        ofs = os.path.getsize(output_filename)
        ifs = os.path.getsize(filename)
        full_size += ifs
        compressed_size += ofs
        print(f"[-] Compressed {filename} {bytes_string(ifs)} to {output_filename} {bytes_string(ofs)}")
        return output_filename
    else:
        print(f"Failed to compress {filename}")
        return False

def compress_js(script: str) -> str:
    if not check_terser_exists():
        print("Terser is not installed. Please install it to compress files.")
        return script
    from subprocess import Popen, PIPE
    # Using shell=True with a list causes the shell to interpret stdin (the JS) as shell script.
    # Run npx directly with arguments and no shell so terser reads from stdin.
    proc = Popen(['npx', '--yes', 'terser', '-c'], stdin=PIPE, stdout=PIPE, stderr=PIPE, shell=False)
    stdout, stderr = proc.communicate(script.encode('utf-8'))
    if proc.returncode != 0:
        print(f"Terser error: {stderr.decode('utf-8')}")
        return script
    compressed_script = stdout.decode('utf-8')
    return compressed_script

def compress_inline_js(html_content: str) -> str:  
    global full_size, compressed_size
    parser = _ScriptExtractor()
    parser.feed(html_content)
    ar = list(parser.scripts)
    for i, script in enumerate(ar):
        compressed_script = compress_js(script)
        if compressed_script != script:
            full_size += len(script)
            compressed_size += len(compressed_script)
            print (f"Compressed inline script {i+1} from {bytes_string(len(script))} to {bytes_string(len(compressed_script))}")
            html_content = html_content.replace(script, compressed_script)
    return html_content

def inline_css(html_content: str) -> str:
    css_files = re.findall(r'<link\s+rel="stylesheet"\s+href="([^"]+)"', html_content)
    for css_file in css_files:
        if not css_file.startswith('http://') and not css_file.startswith('https://'):
            #print (f"Processing local CSS file: {css_file}")
            css_path = Path(css_file).resolve()
            if css_path.exists():
                with open(css_path, 'r', encoding='utf-8') as f:
                    css_content = f.read()
                if re.search(r"url\(([^)]+)\)", css_content):
                    print(f"[+] Embedding fonts in CSS file: {css_file}")
                    new_css_file = os.path.basename(css_file.replace('.css', '.min.css'))
                    embed_fonts_in_css(css_path, css_path.with_name(new_css_file))
                    css_content = open(css_path.with_name(new_css_file), 'r', encoding='utf-8').read()
                style_tag = f"<style>\n/* Content from {css_file} */\n {css_content}\n</style>"
                html_before = len(html_content)
                #html_content = html_content.replace(f'<link rel="stylesheet" href="{css_file}">', style_tag)
                replace_reg = rf'<link.*rel="stylesheet".*href="{css_file}".*>'
                html_content = re.sub(replace_reg, lambda _: style_tag, html_content, flags=re.IGNORECASE)
                html_after = len(html_content)
                print (f"[+] Replaced {css_file} with inline style tag, size changed from {bytes_string(html_before)} to {bytes_string(html_after)}")
            else:
                print(f"CSS file not found: {css_file}")
    return html_content

def main():
    global full_size, compressed_size
    txt = open('index.html', 'r', encoding='utf-8').read()
    txt = compress_inline_js(txt)
    txt = inline_css(txt)
    lns = txt.split('\n')
    with open('standalone.html', 'w', encoding='utf-8') as f:
        for ln in lns:
            m = re.match(r'\s*<script\s+src="(.*)"\s*>\s*</script>', ln)
            if m:
                external_file = m.group(1)
                if external_file.startswith('http://') or external_file.startswith('https://'):
                    resp = urllib3.request("GET", external_file)
                    if resp.status == 200:
                        data = resp.data.decode('utf-8')
                        print(f"[+] Adding external script: {external_file} {bytes_string(len(data))}")
                        f.write("<script>\n")
                        f.write("// Fetched from: " + external_file + "\n")
                        f.write(data)
                        f.write("\n</script>\n")
                    else:
                        print (f"Failed to fetch {external_file}: {resp.status}")
                        break
                else:
                    if not external_file.endswith('.min.js'):
                        compressed_filename = compress_file(external_file)
                        if compressed_filename:
                            external_file = compressed_filename
                    data = open(external_file).read()
                    print(f"[+] Adding local script: {external_file} {bytes_string(len(data))}")
                    f.write("<script>\n")
                    f.write("// Read from: " + external_file + "\n")
                    f.write(data)
                    f.write("\n</script>\n")
            else:
                f.write(ln + '\n')

    file_size = os.path.getsize('standalone.html')
    print (f"Standalone HTML file created as standalone.html {bytes_string(file_size)}")
    
if __name__ == "__main__":
    if not check_terser_exists() and not exists('html-minifier-next'):
        print ("="*60)
        print ("WARNING: install terser and html-minifier-next to work properly")
        print ("> npm install terser html-minifier-next")
        print ("You can still run this script and it will create a standalone.html file, but it won't be compressed.")
        print ("="*60)
    main()
    diff = (compressed_size/full_size) * 100 if full_size > 0 else 0
    print(f"Total size reduction: {compressed_size} bytes ({humanize_bytes(compressed_size)}) from {full_size} bytes ({humanize_bytes(full_size)})")
    print(f"Compression ratio: {diff:.2f}%")
    final_pass_check('standalone.html')

