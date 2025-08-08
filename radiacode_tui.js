#!/usr/bin/env node

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const chalk = require('chalk');
const gradient = require('gradient-string');
const figlet = require('figlet');

const {
  RadiaCode,
  RadiaCodeFactory,
  RadiaCodeUSBTransport,
  RadiaCodeBluetoothTransport,
  RealTimeData,
} = require('./radiacode');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatTime(ts = new Date()) {
  return ts.toTimeString().split(' ')[0];
}

function banner(text) {
  const f = figlet.textSync(text, { font: 'Small', horizontalLayout: 'fitted' });
  return gradient.atlas.multiline(f);
}

class RadiaCodeTUI {
  constructor() {
    this.screen = blessed.screen({ smartCSR: true, title: 'RadiaCode TUI' });
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Widgets
    this.header = this.grid.set(0, 0, 2, 12, blessed.box, {
      tags: true,
      style: { fg: 'white' },
      content: banner('RadiaCode') + `\n{center}${chalk.gray('USB/BLE Geiger — Ctrl+C to quit')}{/center}`,
      align: 'center',
      border: { type: 'line' },
      label: ' RadiaCode TUI ',
    });

    this.info = this.grid.set(2, 0, 3, 6, contrib.table, {
      label: ' Device Info ',
      keys: false,
      interactive: false,
      columnSpacing: 2,
      columnWidth: [18, 40],
      fg: 'white',
    });

    // Replace donuts with progress bars for broader terminal compatibility
    this.cpsGauge = this.grid.set(2, 6, 3, 3, blessed.progressbar, {
      label: ' CPS ',
      orientation: 'horizontal',
      pch: '█',
      style: {
        bar: { bg: 'cyan' },
        border: { fg: 'cyan' },
        fg: 'white'
      }
    });

    this.doseGauge = this.grid.set(2, 9, 3, 3, blessed.progressbar, {
      label: ' μSv/h ',
      orientation: 'horizontal',
      pch: '█',
      style: {
        bar: { bg: 'green' },
        border: { fg: 'green' },
        fg: 'white'
      }
    });

    this.lineCPS = this.grid.set(5, 0, 4, 6, contrib.line, {
      label: ' Count Rate (CPS) ', style: { line: 'cyan', text: 'white' },
      wholeNumbersOnly: false, showLegend: true, legend: { width: 14 },
      xLabelPadding: 3, xPadding: 2, showNthLabel: 10
    });

    this.lineDose = this.grid.set(5, 6, 4, 6, contrib.line, {
      label: ' Dose Rate (μSv/h) ', style: { line: 'green', text: 'white' },
      wholeNumbersOnly: false, showLegend: true, legend: { width: 18 },
      xLabelPadding: 3, xPadding: 2, showNthLabel: 10
    });

    this.log = this.grid.set(9, 0, 3, 12, contrib.log, {
      label: ' Activity Log ', fg: 'white', selectedFg: 'white'
    });

    // Data buffers
    this.maxPoints = 120; // ~2 minutes
    this.x = [];
    this.cps = [];
    this.dose = [];
    this.cpsMax = 50;    // dynamic scaling baseline
    this.doseMax = 0.5;  // dynamic scaling baseline

    // Device state
    this.device = null;
    this.pollTimer = null;
    this.connectedType = '—';
    this.serial = '-';
    this.fw = '-';
    this.lastUpdate = '-';

    this.bindKeys();
    this.renderInfo();
    this.screen.render();
  }

  bindKeys() {
    this.screen.key(['escape', 'q'], () => this.exit());
    this.screen.key(['C-c'], () => this.exit());
  }

  logLine(msg) {
    const line = `[${formatTime()}] ${msg}`;
    this.log.log(line);
  }

  renderInfo() {
    const rows = [
      ['Connection', this.connectedType],
      ['Serial', this.serial],
      ['Firmware', this.fw],
      ['Last Update', this.lastUpdate],
    ];
    this.info.setData({ headers: ['Field', 'Value'], data: rows });
  }

  updateCharts(timeLabel, cps, dose) {
    this.x.push(timeLabel);
    this.cps.push(cps);
    this.dose.push(dose);

    if (this.x.length > this.maxPoints) {
      this.x.shift(); this.cps.shift(); this.dose.shift();
    }

    if (cps > this.cpsMax) this.cpsMax = cps * 1.2;
    if (dose > this.doseMax) this.doseMax = dose * 1.2;

    this.lineCPS.setData([{ title: 'CPS', x: this.x, y: this.cps }]);
    this.lineDose.setData([{ title: 'μSv/h', x: this.x, y: this.dose }]);

    const cpsPct = Math.max(0, Math.min(100, Math.round((cps / this.cpsMax) * 100)));
    const dosePct = Math.max(0, Math.min(100, Math.round((dose / this.doseMax) * 100)));

    // Update gauges
    if (typeof this.cpsGauge.setProgress === 'function') this.cpsGauge.setProgress(cpsPct);
    if (typeof this.doseGauge.setProgress === 'function') this.doseGauge.setProgress(dosePct);
    if (typeof this.cpsGauge.setLabel === 'function') this.cpsGauge.setLabel(` CPS ${cps.toFixed(1)} `);
    if (typeof this.doseGauge.setLabel === 'function') this.doseGauge.setLabel(` μSv/h ${dose.toFixed(4)} `);
  }

  async connect() {
    this.logLine(chalk.cyan('Connecting…'));

    try {
      // Prefer USB, then fall back to BLE if USB connect fails
      const tryOrder = [];
      if (RadiaCodeUSBTransport.isSupported()) tryOrder.push('usb');
      if (RadiaCodeBluetoothTransport.isSupported()) tryOrder.push('ble');
      if (tryOrder.length === 0) throw new Error('No supported transports (USB/BLE) available');

      let lastErr = null;
      for (const t of tryOrder) {
        try {
          if (t === 'usb') {
            this.logLine('Trying USB…');
            this.device = new RadiaCode();
            await this.device.connect();
            this.connectedType = 'USB';
          } else {
            this.logLine('Trying Bluetooth…');
            this.device = new RadiaCode(null, true);
            await this.device.connect();
            this.connectedType = 'Bluetooth';
          }
          break;
        } catch (err) {
          lastErr = err;
          this.logLine(chalk.yellow(`${t.toUpperCase()} failed: ${err.message}`));
          this.device = null;
        }
      }

      if (!this.device) throw lastErr || new Error('Connection failed');

      const version = await this.device.getFirmwareVersion();
      const serial = await this.device.getSerialNumber();
      this.serial = serial.trim();
      this.fw = `v${version.target.major}.${version.target.minor} (${version.target.date})`;
      this.renderInfo();

      this.logLine(chalk.green(`Connected via ${this.connectedType}`));
      this.logLine(`Serial: ${this.serial}`);
      this.logLine(`Firmware: ${this.fw}`);

      this.startPolling();
    } catch (err) {
      this.logLine(chalk.red(`Connection error: ${err.message}`));
      this.logLine('Press Ctrl+C to exit.');
    } finally {
      this.screen.render();
    }
  }

  startPolling() {
    if (!this.device) return;
    if (this.pollTimer) clearInterval(this.pollTimer);

    this.pollTimer = setInterval(() => this.pollOnce(), 500);
    this.logLine('Polling every 500ms…');
  }

  async pollOnce() {
    try {
      const data = await this.device.data_buf();
      const now = new Date();

      let rt = null;
      for (const record of data) {
        if (record instanceof RealTimeData) { rt = record; break; }
      }

      if (rt) {
        const cpsVal = Number(rt.count_rate) || 0;
        const doseVal = Number(rt.dose_rate) || 0;
        this.lastUpdate = formatTime(now);
        this.renderInfo();
        this.updateCharts(this.lastUpdate, cpsVal, doseVal);
      }
    } catch (err) {
      this.logLine(chalk.red(`Poll error: ${err.message}`));
    } finally {
      this.screen.render();
    }
  }

  async exit() {
    try {
      if (this.pollTimer) clearInterval(this.pollTimer);
      if (this.device) await this.device.disconnect();
    } catch (_) { /* ensure teardown proceeds */ }
    this.screen.destroy();
    process.exit(0);
  }
}

(async () => {
  const app = new RadiaCodeTUI();
  await app.connect();
})();
