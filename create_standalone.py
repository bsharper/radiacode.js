import os
import re
import shutil
import urllib3

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
    return shutil.which(bin_name) is not None

def check_terser_exists():
    return exists('terser') or exists('terser.cmd') or exists('terser.exe')

def compress_file(filename):
    global full_size, compressed_size
    if not check_terser_exists():
        print("Terser is not installed. Please install it to compress files.")
        return False
    output_filename = filename.replace('.js', '.min.js')
    rv = os.system(f"terser -c -o {output_filename} {filename}")
    if rv == 0:
        ofs = os.path.getsize(output_filename)
        ifs = os.path.getsize(filename)
        full_size += ifs
        compressed_size += ofs
        print(f"Compressed {filename} {bytes_string(ifs)} to {output_filename} {bytes_string(ofs)}")
        return output_filename
    else:
        print(f"Failed to compress {filename}")
        return False

def compress_js(script: str) -> str:
    if not check_terser_exists():
        print("Terser is not installed. Please install it to compress files.")
        return script
    from subprocess import Popen, PIPE
    proc = Popen(['terser', '-c'], stdin=PIPE, stdout=PIPE, stderr=PIPE)
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


def main():
    global full_size, compressed_size
    txt = open('index.html').read()
    txt = compress_inline_js(txt)
    lns = txt.split('\n')
    with open('standalone.html', 'w') as f:
        for ln in lns:
            m = re.match(r'\s*<script\s+src="(.*)"\s*>\s*</script>', ln)
            if m:
                external_file = m.group(1)
                if external_file.startswith('http://') or external_file.startswith('https://'):
                    resp = urllib3.request("GET", external_file)
                    if resp.status == 200:
                        data = resp.data.decode('utf-8')
                        print(f"Adding external script: {external_file} {bytes_string(len(data))}")
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
                    print(f"Adding local script: {external_file} {bytes_string(len(data))}")
                    f.write("<script>\n")
                    f.write("// Read from: " + external_file + "\n")
                    f.write(data)
                    f.write("\n</script>\n")
            else:
                f.write(ln + '\n')

    file_size = os.path.getsize('standalone.html')
    print (f"Standalone HTML file created as standalone.html {bytes_string(file_size)}")
    
if __name__ == "__main__":
    main()
    diff = (compressed_size/full_size) * 100 if full_size > 0 else 0
    print(f"Total size reduction: {compressed_size} bytes ({humanize_bytes(compressed_size)}) from {full_size} bytes ({humanize_bytes(full_size)})")
    print(f"Compression ratio: {diff:.2f}%")
    