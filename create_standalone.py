import urllib3
import re
import os

def main():
    lns = open('index.html').read().split('\n')
    with open('standalone.html', 'w') as f:
        for ln in lns:
            m = re.match(r'\s*<script\s+src="(.*)"\s*>\s*</script>', ln)
            if m:
                external_file = m.group(1)
                if "https" in external_file or "http" in external_file:
                    resp = urllib3.request("GET", external_file)
                    if resp.status == 200:
                        data = resp.data.decode('utf-8')
                        print(f"Adding external script: {external_file} ({len(data)} bytes)")
                        f.write("<script>\n")
                        f.write("// Fetched from: " + external_file + "\n")
                        f.write(data)
                        f.write("</script>\n")
                    else:
                        print (f"Failed to fetch {external_file}: {resp.status}")
                        break
                else:
                    data = open(external_file).read()
                    print(f"Adding local script: {external_file} ({len(data)} bytes)")
                    f.write("<script>\n")
                    f.write("// Read from: " + external_file + "\n")
                    f.write(data)
                    f.write("</script>\n")
            else:
                f.write(ln + '\n')

    file_size = os.path.getsize('standalone.html')
    print (f"Standalone HTML file created as standalone.html ({file_size} bytes)")
    
if __name__ == "__main__":
    main()