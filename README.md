# radiacode-web

A web-based interface for RadiaCode radiation detection devices. Connects via USB or Bluetooth

![Screenshot example](screenshot.jpg)

## About

This project is based on [https://github.com/cdump/radiacode](https://github.com/cdump/radiacode) and provides a browser-based interface for connecting to and interacting with RadiaCode devices.

## Usage

1. Clone this repo: `git clone https://github.com/bsharper/radiacode-web`
2. Open `index.html` in a Chrome-based browser (Chrome, Edge, or other Chromium-based browsers)
3. Click "Connect Bluetooth" to connect to your RadiaCode device

## Standalone

There is very simple `create_standalone.py` script that will generate a fully self-contained HTML file called "standalone.html". It does this by inlining all external script references. The resulitng file (standalone.html) should work anywhere, even without internet. You can generate the file locally or just use the "standalone.html" in the repo. 

## Requirements

- Chrome-based browser with Web Bluetooth API support
- RadiaCode device with Bluetooth capability

## Note

USB and Bluetooth are working now.

## License

See the [LICENSE](LICENSE) file for details.
