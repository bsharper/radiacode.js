const common_options = {
  chart: {
    animations: {enabled: false},
    zoom: {autoScaleYaxis: true},
  },
  tooltip: {intersect: false},
  grid: {xaxis: {lines: {show: true}}},
  dataLabels: {enabled: false},
};
(function(){
    try {
    var el = document.getElementById('lib-version');
    var v = (window.RadiaCode && window.RadiaCode.VERSION) || window.RadiaCodeJS_VERSION;
    if (el && v) el.textContent = 'v' + v;
    } catch (_) {}
})();

var app = new Vue({
  el: '#app',
  components: {
    apexchart: VueApexCharts,
  },
  data: function() {
    return {
      device: null,
      isConnected: false,
      isConnecting: false,
      connectionStatus: 'Disconnected',
      connectionStatusText: 'Not connected to device',
      
      // Device information
      deviceInfo: {
        firmwareVersion: null,
        serialNumber: null,
        connectionType: null,
        lastUpdate: null
      },
      
      // Alarm limits
      alarmLimits: null,
      
      // Real-time data
      currentData: {
        countRate: 0,
        doseRate: 0,
        countRateError: 0,
        doseRateError: 0
      },
      
      // Smoothie chart
      countRateChart: null,
      doseRateChart: null,
      countRateTimeSeries: null,
      doseRateTimeSeries: null,
  // Bracket (±25%) helper series
  countRateUpperTimeSeries: null,
  countRateLowerTimeSeries: null,
  doseRateUpperTimeSeries: null,
  doseRateLowerTimeSeries: null,
  showCountErrorRange: false,
  showDoseErrorRange: false,
      // Auto-update functionality
      autoUpdateEnabled: false,
      updateInterval: 1000, // 500ms
      updateTimer: null,
      realTimeDataMessages: 0,
      realTimeDataMessagesMax: 5,
      
      // Logging
      logMessages: [],
      logCounter: 0,
      logExpanded: true, // Start expanded by default
      maxVisibleMessages: 500, // Limit DOM elements for performance
      logAutoScroll: true, // Whether to auto-scroll to bottom on new messages
      
      // Spectrum data
      spectrum_duration: 0,
      spectrum_series: [],
      spectrum_coef: [0, 0, 0],
      spectrum_accum: false,
      spectrum_logarithmic: true,
      spectrum_energy: true,
      
      // Rates data
      rates_series: [
        {name: 'Count Rate', data: [], yAxisIndex: 0},
        {name: 'Dose Rate', data: [], yAxisIndex: 1}
      ],
  // How many historical stored samples (if any) to preload into the CR/DR chart on connect
  historicalLoadCount: 100,
      
      // Real-time min/max stats
      stats: {
        countRate: {min: null, max: null},
        doseRate: {min: null, max: null},
      },
      
      // Persistent storage for realtime samples
      storage: {
        enabled: true,
        key: 'radiacode_realtime_v1',
        buffer: [],
        lastFlush: 0,
        flushInterval: 10000, // ms
        maxBufferSize: 100,   // flush when exceeded
        maxSamples: 200000,   // prune oldest beyond this
        totalSamples: 0,
        sizeBytes: 0,
        usingIndexedDB: false,
        db: null,
        dbName: 'radiacode_samples',
        storeName: 'samples_v1',
      },
      // Samples table / UI state
      samplesTableExpanded: false,
      sampleRows: [], // last N rows for UI
      sampleRowLimit: 200,
      autoScrollSamples: true,
      highlightNewSamples: true,
      // Sound status (null = unknown until first read)
      soundEnabled: null,
      // Reusable confirmation dialog state
      confirmDialog: {
        visible: false,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        // action: function to run on confirm
        action: null,
        // optional analytics key
        key: null,
      },
      
      ratesChartOptions: {
        ...common_options,
        title: {text: 'CountRate & DoseRate'},
        xaxis: {type: 'datetime'},
        yaxis: [
          {seriesName: 'countrate', title: {text: 'CPS'}, labels: {formatter:(v) => v.toFixed(2) + ' CPS'}},
          {seriesName: 'doserate',  title: {text: 'μSv/h'}, labels: {formatter:(v) => v.toFixed(6) + ' μSv/h'}, opposite: true},
        ],
      },
    }; // end return
  }, // end data
  watch: {
    spectrum_accum() {
      if (this.isConnected) {
        this.updateSpectrum();
      }
    }
  },
  computed: {
    visibleLogMessages() {
      // Show the most recent messages for performance
      if (this.logMessages.length <= this.maxVisibleMessages) {
        return this.logMessages;
      }
      return this.logMessages.slice(-this.maxVisibleMessages);
    },
    spectrumChartOptions() {
      const a0 = this.spectrum_coef[0], a1 = this.spectrum_coef[1], a2 = this.spectrum_coef[2];
      const fmt = this.spectrum_energy ? ((c) => (a0 + a1*c + a2*c*c).toFixed(0)) : undefined;
      const title = this.spectrum_energy ? 'keV' : 'channel';
      return{
        ...common_options,
        title: {text: `Spectrum, ${this.spectrum_duration} seconds`},
        xaxis: {type: 'numeric', title: {text: title}, tickAmount: 25, labels: {formatter:fmt}},
        yaxis: {logarithmic: this.spectrum_logarithmic, decimalsInFloat: 0},
        plotOptions: {bar: {columnWidth: '95%'}},
      };
    },
  },
  created() {
  this.log('RadiaCode Standalone Demo initialized');
  const v = (window.RadiaCode && window.RadiaCode.VERSION) || window.RadiaCodeJS_VERSION;
  if (v) this.log(`Library version: v${v}`);
    this.log('Connect to your device using Bluetooth or USB');
    this.loadStoredSamples();
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  },
  beforeDestroy: function() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.device && this.isConnected) {
      this.device.disconnect();
    }
    this.flushStorage(true);
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
  },
  methods: {
    log(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.logMessages.push({
        id: this.logCounter++,
        timestamp,
        message
      });
      
      // Auto-scroll to bottom only if user is already at the bottom and log is expanded
      this.$nextTick(() => {
        if (this.logExpanded && this.logAutoScroll) {
          const logEl = document.querySelector('.log');
          if (logEl) {
            logEl.scrollTop = logEl.scrollHeight;
          }
        }
      });
    },

    handleLogScroll() {
      const logEl = this.$refs.logContainer;
      if (logEl) {
        // Check if user is at the bottom (within 5px tolerance)
        const isAtBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 5;
        this.logAutoScroll = isAtBottom;
      }
    },

    toggleLogExpanded() {
      this.logExpanded = !this.logExpanded;
      
      // Auto-scroll to bottom when expanding (and reset auto-scroll to true)
      if (this.logExpanded) {
        this.logAutoScroll = true;
        this.$nextTick(() => {
          const logEl = document.querySelector('.log');
          if (logEl) {
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
      }
    },

    clearLog() {
      this.logMessages = [];
      this.logCounter = 0;
      this.logAutoScroll = true; // Reset auto-scroll when clearing
      this.log('Log cleared');
    },

    beforeUnloadHandler() { this.flushStorage(true); },

    async connectBluetooth() {
      try {
        this.isConnecting = true;
        this.connectionStatus = 'Connecting';
        this.connectionStatusText = 'Connecting via Bluetooth...';
        this.log('Attempting Bluetooth connection...');
        
        this.device = new RadiaCode(null, true); // Request Bluetooth
        window.device = this.device; // For debugging
        await this.device.connect();
        
        this.isConnected = true;
        this.connectionStatus = 'Connected';
        this.connectionStatusText = 'Connected via Bluetooth';
        this.deviceInfo.connectionType = 'Bluetooth';
        this.log('✅ Connected successfully via Bluetooth');
        window.device = this.device; // For debugging
        await this.initializeDevice();
        
      } catch (error) {
        this.log(`❌ Bluetooth connection failed: ${error.message}`);
        this.connectionStatus = 'Disconnected';
        this.connectionStatusText = `Connection failed: ${error.message}`;
        this.device = null;
      } finally {
        this.isConnecting = false;
      }
    },

    async connectUSB() {
      try {
        this.isConnecting = true;
        this.connectionStatus = 'Connecting';
        this.connectionStatusText = 'Connecting via USB...';
        this.log('Attempting USB connection...');
        
        if (!RadiaCodeUSBTransport.isSupported()) {
          throw new Error('Web USB is not supported in this browser');
        }
        
        this.device = new RadiaCode();
        window.device = this.device; 
        await this.device.connect();
        
        this.isConnected = true;
        this.connectionStatus = 'Connected';
        this.connectionStatusText = 'Connected via USB';
        this.deviceInfo.connectionType = 'USB';
        this.log('✅ Connected successfully via USB');
        
        await this.initializeDevice();
        
      } catch (error) {
        this.log(`❌ USB connection failed: ${error.message}`);
        this.connectionStatus = 'Disconnected';
        this.connectionStatusText = `Connection failed: ${error.message}`;
        this.device = null;
      } finally {
        this.isConnecting = false;
      }
    },

    async initializeDevice() {
      try {
        this.realTimeDataMessages = 0;
        this.log('Getting firmware version...');
        const version = await this.device.getFirmwareVersion();
        this.deviceInfo.firmwareVersion = `v${version.target.major}.${version.target.minor}`;
        this.log(`Firmware: ${this.deviceInfo.firmwareVersion}`);
        
        this.log('Getting serial number...');
        const serial = await this.device.getSerialNumber();
        this.deviceInfo.serialNumber = serial;
        this.log(`Device: ${serial}`);
        
        //this.log('Getting alarm limits...');
        //this.alarmLimits = await this.device.getAlarmLimits(); 
        // this.log(`Alarm limits: CR L1/L2=${this.alarmLimits.l1_count_rate}/${this.alarmLimits.l2_count_rate} ${this.alarmLimits.count_unit}, DR L1/L2=${this.alarmLimits.l1_dose_rate}/${this.alarmLimits.l2_dose_rate} µ${this.alarmLimits.dose_unit}/h`);

        // Test data buffer to see what we get
        // this.log('Testing initial data buffer...');
        // const testData = await this.device.data_buf();
        // this.log(`Got ${testData.length} records from data buffer`);
        
        // for (let i = 0; i < Math.min(3, testData.length); i++) {
        //   const record = testData[i];
        //   if (record instanceof RealTimeData) {
        //     this.log(`Sample data[${i}]: CR=${record.count_rate}, DR=${record.dose_rate}, CR_err=${record.count_rate_err}, DR_err=${record.dose_rate_err}`);
        //   } else {
        //     this.log(`Sample data[${i}]: ${record.constructor.name}`);
        //   }
        // }
        
        // Get initial spectrum
        this.log('Getting initial spectrum...');
        await this.updateSpectrum();

  // Load sound status
  await this.loadSoundStatus();
        
  // Initialize smoothie chart first (so we can optionally backfill it)
  this.initializeSmoothieChart();

  // Preload historical stored samples (if any) into rates chart before starting auto-update
  await this.loadHistoricalRates();

  // Start auto-update by default (after historical data is in place)
  this.toggleAutoUpdate();

        this.log('✅ Device initialization completed successfully');
        
      } catch (error) {
        this.log(`❌ Device initialization failed: ${error.message}`);
        // Don't throw the error - connection is still working
      }
    },

    initializeSmoothieChart() {
      // Create time series for count rate and dose rate
      this.countRateTimeSeries = new TimeSeries();
      this.doseRateTimeSeries = new TimeSeries();
      
      // Create the count rate chart
      this.countRateChart = new SmoothieChart({
        responsive: true,
        millisPerPixel: 10,
        maxValueScale: 1.1,
        minValueScale: 1.1,
        tooltip: true,
        grid: {
          strokeStyle: 'rgba(119, 119, 119, 0.2)',
          fillStyle: 'rgba(0, 0, 0, 0.02)',
          lineWidth: 1,
          millisPerLine: 5000,
          verticalSections: 6
        },
        labels: {
          fillStyle: 'rgba(0, 0, 0, 0.6)',
          fontSize: 12
        }
      });
      
      // Create the dose rate chart
      this.doseRateChart = new SmoothieChart({
        responsive: true,
        millisPerPixel: 10,
        maxValueScale: 1.1,
        minValueScale: 1.1,
        tooltip: true,
        grid: {
          strokeStyle: 'rgba(119, 119, 119, 0.2)',
          fillStyle: 'rgba(0, 0, 0, 0.02)',
          lineWidth: 1,
          millisPerLine: 5000,
          verticalSections: 6
        },
        labels: {
          fillStyle: 'rgba(0, 0, 0, 0.6)',
          fontSize: 12
        }
      });
      
      // Add time series to charts
      this.countRateChart.addTimeSeries(this.countRateTimeSeries, {
        strokeStyle: 'rgba(0, 123, 255, 1)',
        fillStyle: 'rgba(0, 123, 255, 0.1)',
        lineWidth: 2
      });
      
      this.doseRateChart.addTimeSeries(this.doseRateTimeSeries, {
        strokeStyle: 'rgba(40, 167, 69, 1)',
        fillStyle: 'rgba(40, 167, 69, 0.1)',
        lineWidth: 2
      });
      
      // Start streaming to canvases
      this.$nextTick(() => {
        const countCanvas = document.getElementById('countRateChart');
        const doseCanvas = document.getElementById('doseRateChart');
        
        if (countCanvas && doseCanvas) {
          this.countRateChart.streamTo(countCanvas, this.updateInterval+500);
          this.doseRateChart.streamTo(doseCanvas, this.updateInterval+500);
          this.log('✅ Real-time charts initialized');
        }
      });
    },

    destroySmoothieChart() {
      if (this.countRateChart) {
        this.countRateChart.stop();
        this.countRateChart = null;
      }
      if (this.doseRateChart) {
        this.doseRateChart.stop();
        this.doseRateChart = null;
      }
      this.countRateTimeSeries = null;
      this.doseRateTimeSeries = null;
    },

    async loadHistoricalRates() {
      try {
        if (!this.storage.enabled) return; // recording disabled; nothing to show
        const limit = this.historicalLoadCount;
        let rows = [];
        if (this.storage.usingIndexedDB && this.storage.db) {
          // Read all (simple) then slice; for moderate counts this is fine. Could be optimized later.
          const tx = this.storage.db.transaction(this.storage.storeName, 'readonly');
            const store = tx.objectStore(this.storage.storeName);
            rows = await new Promise(resolve => {
              const acc = [];
              store.openCursor().onsuccess = (e) => {
                const c = e.target.result; if (c) { acc.push(c.value); c.continue(); } else resolve(acc); };
            });
        } else {
          // Fallback localStorage format
          const obj = this.getStoredObject();
          if (Array.isArray(obj.samples)) {
            rows = obj.samples.map(a => ({ts:a[0], cr:a[1], dr:a[2], crErr:a[3], drErr:a[4], flags:a[5]}));
          }
        }
        if (!rows.length) { this.log('No historical samples to preload'); return; }
        const subset = rows.slice(-limit);
        // Populate rates_series
        this.rates_series[0].data = subset.map(r => [r.ts, r.cr]);
        this.rates_series[1].data = subset.map(r => [r.ts, r.dr]);
        // Update stats from historical data
        this.resetStats();
        for (const r of subset) this.updateStats(r.cr, r.dr);
        this.rates_series = [...this.rates_series]; // trigger reactive update
        // Optionally backfill smoothie charts so visual continuity exists (will just paint past window)
        if (this.countRateTimeSeries && this.doseRateTimeSeries) {
          for (const r of subset) {
            this.countRateTimeSeries.append(r.ts, r.cr);
            this.doseRateTimeSeries.append(r.ts, r.dr);
          }
        }
        this.log(`Preloaded ${subset.length} historical samples into rates chart`);
      } catch (e) {
        this.log('⚠️ Failed to load historical samples: ' + e.message);
      }
    },

    async loadAlarmSettings() {
      if (!this.isConnected || !this.device) return;
      
      try {
        this.log('Loading alarm settings...');
        this.alarmLimits = await this.device.getAlarmLimits();
        this.log(`✅ Alarm limits loaded: CR L1/L2=${this.alarmLimits.l1_count_rate}/${this.alarmLimits.l2_count_rate} ${this.alarmLimits.count_unit}, DR L1/L2=${this.alarmLimits.l1_dose_rate}/${this.alarmLimits.l2_dose_rate} µ${this.alarmLimits.dose_unit}/h`);
      } catch (error) {
        this.log(`❌ Failed to load alarm settings: ${error.message}`);
      }
    },

    async disconnect() {
      try {
        if (this.updateTimer) {
          clearInterval(this.updateTimer);
          this.updateTimer = null;
          this.autoUpdateEnabled = false;
        }
        this.flushStorage(true);
        if (this.device) {
          await this.device.disconnect();
          this.log('✅ Disconnected successfully');
        }
        
        // Destroy smoothie chart
        this.destroySmoothieChart();
        
        this.device = null;
        this.isConnected = false;
        this.connectionStatus = 'Disconnected';
        this.connectionStatusText = 'Not connected to device';
        
        // Clear device information
        this.deviceInfo = {
          firmwareVersion: null,
          serialNumber: null,
          connectionType: null,
          lastUpdate: null
        };
        
        // Clear alarm limits
        this.alarmLimits = null;
        window.deviceInfo = deviceInfo;
        
        // Reset current data
        this.currentData = {
          countRate: 0,
          doseRate: 0,
          countRateError: 0,
          doseRateError: 0
        };
        window.currentData = this.currentData;  
        
        this.resetStats();
        
      } catch (error) {
        this.log(`❌ Disconnect failed: ${error.message}`);
      }
    },

    toggleAutoUpdate() {
      if (this.autoUpdateEnabled) {
        // Stop auto-update
        if (this.updateTimer) {
          clearInterval(this.updateTimer);
          this.updateTimer = null;
        }
        this.autoUpdateEnabled = false;
        this.log('Auto-update stopped');
      } else {
        // Start auto-update
        this.autoUpdateEnabled = true;
        this.updateTimer = setInterval(() => {
          this.updateRatesData();
        }, this.updateInterval);
        this.storage.lastFlush = Date.now();
        this.log(`Auto-update started (${this.updateInterval/1000}s interval)`);
      }
    },

    async updateRatesData() {
      if (!this.isConnected || !this.device) return;
      try {
        const data = await this.device.data_buf();
        const now = new Date().getTime();
        // Process real-time data
        for (const record of data) {
          if (record instanceof RealTimeData) {
            // Debug logging - more detailed
            //this.log(`RealTimeData: CR=${record.count_rate.toFixed(2)} CPS, DR=${record.dose_rate.toFixed(6)} µSv/h, flags=0x${record.flags.toString(16)}`);
            this.realTimeDataMessages++;
            if (this.realTimeDataMessages <= this.realTimeDataMessagesMax) {
              this.log(`RealTimeData: CR=${record.count_rate.toFixed(2)} CPS, DR=${record.dose_rate.toFixed(6)} µSv/h, flags=0x${record.flags.toString(16)}`);
            }  
            if (this.realTimeDataMessages === this.realTimeDataMessagesMax) {
              this.log(`RealTimeData: stopping display after ${this.realTimeDataMessagesMax} messages`);
            }
            // Update current data
            this.currentData.countRate = record.count_rate;
            this.currentData.doseRate = record.dose_rate;
            this.currentData.countRateError = record.count_rate_err;
            this.currentData.doseRateError = record.dose_rate_err;
            
            // Add to smoothie chart
            if (this.countRateTimeSeries && this.doseRateTimeSeries) {
              this.countRateTimeSeries.append(now, record.count_rate);
              // Use original dose rate value (µSv/h) for dose rate chart
              this.doseRateTimeSeries.append(now, record.dose_rate);
            }
            
            
            // Add to rates series
            this.rates_series[0].data.push([now, record.count_rate]);
            this.rates_series[1].data.push([now, record.dose_rate]);

            window.dispatchEvent(new CustomEvent('update-cps', {
              detail: { message: record, cps: record.count_rate }
            }));
            
            // Update last update time
            this.deviceInfo.lastUpdate = new Date().toLocaleTimeString();
            
            // Keep only last 100 data points
            if (this.rates_series[0].data.length > 100) {
              this.rates_series[0].data = this.rates_series[0].data.slice(-100);
              this.rates_series[1].data = this.rates_series[1].data.slice(-100);
            }
            
            // Trigger chart update
            this.rates_series = [...this.rates_series];
            
            // ----- Min/Max update helper -----
            this.updateStats(record.count_rate, record.dose_rate);
            
            // ----- Storage (recording) helpers -----
            this.storeSample(now, record);
            
            break; // Only process the first real-time record
          }
        }
        
      } catch (error) {
        this.log(`❌ Failed to update rates data: ${error.message}`);
      }
    },

    async updateSpectrum() {
      if (!this.isConnected || !this.device) return;
      
      try {
        this.log('Updating spectrum...');
        
        const spectrum = this.spectrum_accum ? 
          await this.device.spectrum_accum() : 
          await this.device.spectrum();
        
        this.spectrum_duration = spectrum.duration;
        this.spectrum_coef = [spectrum.a0, spectrum.a1, spectrum.a2];
        
        // Convert spectrum data to chart format
        const counts = spectrum.counts;
        const data = [];
        
        if (this.spectrum_energy) {
          // Energy scale
          for (let i = 0; i < counts.length; i++) {
            const energy = spectrum.channelToEnergy(i + 0.5);
            data.push([energy, counts[i]]);
          }
        } else {
          // Channel scale
          for (let i = 0; i < counts.length; i++) {
            data.push([i, counts[i]]);
          }
        }
        
        this.spectrum_series = [{
          name: 'Counts',
          data: data
        }];
        
        this.log(`✅ Spectrum updated: ${spectrum.duration}s, ${spectrum.getTotalCounts()} total counts`);
        
      } catch (error) {
        this.log(`❌ Failed to update spectrum: ${error.message}`);
      }
    },

    async resetSpectrum() {
      if (!this.isConnected || !this.device) return;
      
      try {
        this.log('Resetting spectrum...');
        await this.device.spectrum_reset();
        this.log('✅ Spectrum reset successfully');
        
        // Wait a moment then update
        setTimeout(() => {
          this.updateSpectrum();
        }, 1000);
        
      } catch (error) {
        this.log(`❌ Failed to reset spectrum: ${error.message}`);
      }
    },

    // ----- Min/Max update helper -----
    updateStats(cr, dr) {
      if (cr != null) {
        if (this.stats.countRate.min === null || cr < this.stats.countRate.min) this.stats.countRate.min = cr;
        if (this.stats.countRate.max === null || cr > this.stats.countRate.max) this.stats.countRate.max = cr;
      }
      if (dr != null) {
        if (this.stats.doseRate.min === null || dr < this.stats.doseRate.min) this.stats.doseRate.min = dr;
        if (this.stats.doseRate.max === null || dr > this.stats.doseRate.max) this.stats.doseRate.max = dr;
      }
    },
    resetStats() {
      this.stats.countRate.min = this.stats.countRate.max = null;
      this.stats.doseRate.min = this.stats.doseRate.max = null;
    },
    // ----- Storage (recording) helpers -----
    loadStoredSamples() {
      // Attempt IndexedDB first, fallback to localStorage metrics
      this.initIndexedDB().then(()=>{
        this.refreshRecentSamples();
      }).catch(err => {
        this.log('⚠️ IndexedDB unavailable ('+err.message+'), using localStorage');
        try {
          const raw = localStorage.getItem(this.storage.key);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && Array.isArray(obj.samples)) {
              this.storage.totalSamples = obj.samples.length;
              this.storage.sizeBytes = raw.length;
            }
          }
        } catch (e) { this.log('⚠️ Failed to load stored samples: ' + e.message); }
      });
    },
    async initIndexedDB() {
      if (this.storage.db) return;
      if (!('indexedDB' in window)) throw new Error('No indexedDB in window');
      const req = indexedDB.open(this.storage.dbName, 1);
      return await new Promise((resolve, reject) => {
        req.onerror = () => reject(req.error || new Error('open failed'));
        req.onupgradeneeded = (e) => {
          const db = req.result;
          if (!db.objectStoreNames.contains(this.storage.storeName)) {
            const store = db.createObjectStore(this.storage.storeName, {keyPath: 'id', autoIncrement: true});
            store.createIndex('ts', 'ts');
          }
        };
        req.onsuccess = () => {
          this.storage.db = req.result;
          this.storage.usingIndexedDB = true;
          // Count existing rows quickly
          const tx = this.storage.db.transaction(this.storage.storeName, 'readonly');
            const store = tx.objectStore(this.storage.storeName);
            const countReq = store.count();
            countReq.onsuccess = () => { this.storage.totalSamples = countReq.result; };
          resolve();
        };
      });
    },
    getStoredObject() {
      try {
        const raw = localStorage.getItem(this.storage.key);
        if (raw) return JSON.parse(raw);
      } catch(_) {}
      return {version:1, samples:[]};
    },
    storeSample(ts, record) {
      if (!this.storage.enabled) return;
      const row = {
        ts,
        cr: Number(record.count_rate),
        dr: Number(record.dose_rate),
        crErr: Number(record.count_rate_err),
        drErr: Number(record.dose_rate_err),
        flags: record.flags >>> 0,
      };
      // Push to UI list
      const uiRow = {
        id: ts + '_' + Math.random().toString(36).slice(2,8),
        time: new Date(ts).toLocaleTimeString(),
        cr: row.cr,
        dr: row.dr,
        crErr: row.crErr,
        drErr: row.drErr,
        flagsHex: '0x'+ row.flags.toString(16),
        _flash: true,
      };
      this.sampleRows.push(uiRow);
      if (this.sampleRows.length > this.sampleRowLimit) this.sampleRows.splice(0, this.sampleRows.length - this.sampleRowLimit);
      // schedule flash removal
      setTimeout(()=> { uiRow._flash = false; }, 800);
      // Auto-scroll if enabled
      this.$nextTick(()=> {
        if (this.autoScrollSamples) {
          const el = this.$refs.samplesScroll; if (el) el.scrollTop = el.scrollHeight;
        }
      });
      // Buffer for persistence
      this.storage.buffer.push(row);
      const now = Date.now();
      if (this.storage.buffer.length >= this.storage.maxBufferSize || (now - this.storage.lastFlush) >= this.storage.flushInterval) {
        this.flushStorage();
      }
    },
    handleSamplesScroll() {
      const el = this.$refs.samplesScroll; if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
      this.autoScrollSamples = atBottom;
    },
    async refreshRecentSamples() {
      if (!this.storage.usingIndexedDB || !this.storage.db) return;
      const tx = this.storage.db.transaction(this.storage.storeName, 'readonly');
      const store = tx.objectStore(this.storage.storeName);
      // Use a cursor from the end by collecting then slicing (simple approach)
      const rows = [];
      return await new Promise(resolve => {
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { rows.push(cursor.value); cursor.continue(); }
          else {
            const recent = rows.slice(-this.sampleRowLimit);
            this.sampleRows = recent.map(r => ({
              id: r.id,
              time: new Date(r.ts).toLocaleTimeString(),
              cr: r.cr,
              dr: r.dr,
              crErr: r.crErr,
              drErr: r.drErr,
              flagsHex: '0x'+ (r.flags>>>0).toString(16),
              _flash: false,
            }));
            resolve();
          }
        };
      });
    },
    flushStorage(force) {
      if (!force && (!this.storage.buffer.length)) return;
      try {
        if (this.storage.usingIndexedDB && this.storage.db) {
          const tx = this.storage.db.transaction(this.storage.storeName, 'readwrite');
          const store = tx.objectStore(this.storage.storeName);
          for (const row of this.storage.buffer) store.add(row);
          // After commit, update counts & maybe prune
          tx.oncomplete = () => {
            this.storage.totalSamples += this.storage.buffer.length;
            this.storage.buffer = [];
            this.storage.lastFlush = Date.now();
            // TODO: pruning strategy for IndexedDB (lazy)
          };
        } else {
          const obj = this.getStoredObject();
          for (const row of this.storage.buffer) obj.samples.push([row.ts, row.cr, row.dr, row.crErr, row.drErr, row.flags]);
          if (obj.samples.length > this.storage.maxSamples) {
            const remove = obj.samples.length - this.storage.maxSamples;
              obj.samples.splice(0, remove);
          }
          const raw = JSON.stringify(obj);
          localStorage.setItem(this.storage.key, raw);
          this.storage.totalSamples = obj.samples.length;
          this.storage.sizeBytes = raw.length;
          this.storage.buffer = [];
          this.storage.lastFlush = Date.now();
        }
      } catch (e) {
        this.log('❌ Failed to flush storage: ' + e.message);
      }
    },
    toggleStorage() {
      this.storage.enabled = !this.storage.enabled;
      if (!this.storage.enabled) this.flushStorage(true);
      this.log(this.storage.enabled ? 'Recording resumed' : 'Recording paused');
    },
    clearStoredSamples() {
      try {
        if (this.storage.usingIndexedDB && this.storage.db) {
          const tx = this.storage.db.transaction(this.storage.storeName, 'readwrite');
          const store = tx.objectStore(this.storage.storeName);
          const clearReq = store.clear();
          clearReq.onsuccess = () => {
            this.storage.totalSamples = 0; this.sampleRows = []; this.storage.buffer = []; this.log('Stored samples cleared');
          };
        } else {
          localStorage.removeItem(this.storage.key);
          this.storage.totalSamples = 0;
          this.storage.sizeBytes = 0;
          this.storage.buffer = [];
          this.sampleRows = [];
        }
        this.log('Stored samples cleared');
      } catch(e) { this.log('❌ Clear failed: ' + e.message); }
    },
    exportStoredSamples() {
      try {
        this.flushStorage(true);
        let exportObj;
        if (this.storage.usingIndexedDB && this.storage.db) {
          // Read all rows (could be large) - simple approach
          exportObj = {version:1, samples:[]};
          const tx = this.storage.db.transaction(this.storage.storeName, 'readonly');
          const store = tx.objectStore(this.storage.storeName);
          const rows = [];
          const p = new Promise(resolve => {
            store.openCursor().onsuccess = (e) => { const c=e.target.result; if (c){ rows.push(c.value); c.continue(); } else resolve(); };
          });
          p.then(()=> {
            exportObj.samples = rows.map(r=>[r.ts, r.cr, r.dr, r.crErr, r.drErr, r.flags]);
            const blob = new Blob([JSON.stringify(exportObj)], {type:'application/json'});
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'radiacode_realtime_' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
            this.log('Exported stored samples');
          });
          return;
        } else {
          exportObj = this.getStoredObject();
        }
        const blob = new Blob([JSON.stringify(exportObj)], {type:'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'radiacode_realtime_' + new Date().toISOString().replace(/[:.]/g,'-') + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
        this.log('Exported stored samples');
      } catch(e) { this.log('❌ Export failed: ' + e.message); }
    },
    clearRatesData() {
      this.rates_series[0].data = [];
      this.rates_series[1].data = [];
      this.rates_series = [...this.rates_series];
      this.resetStats();
    },
    openConfirm(options) {
      // options: { key, title, message, confirmLabel, cancelLabel, action }
      this.confirmDialog = Object.assign({
        visible: true,
        title: 'Confirmation',
        message: 'Are you sure?',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        action: null,
        key: null,
      }, options || {});
      // trap basic escape key
      document.addEventListener('keydown', this._confirmEscListener);
    },
    confirmRun() {
      const act = this.confirmDialog.action;
      this.closeConfirm();
      if (typeof act === 'function') act();
    },
    closeConfirm() {
      this.confirmDialog.visible = false;
      document.removeEventListener('keydown', this._confirmEscListener);
    },
    _confirmEscListener(e) {
      if (e.key === 'Escape') {
        const vm = window.app || this; // fallback
        if (vm.confirmDialog && vm.confirmDialog.visible) vm.closeConfirm();
      }
    },
    requestSpectrumReset() {
      if (!this.isConnected) return;
      this.openConfirm({
        key: 'spectrum-reset',
        title: 'Reset Spectrum',
        message: 'Reset spectrum? Current spectrum counts will be cleared.',
        confirmLabel: 'Reset',
        action: () => { this.resetSpectrum(); }
      });
    },
    requestRatesClear() {
      if (!this.rates_series[0].data.length) return;
      this.openConfirm({
        key: 'rates-clear',
        title: 'Clear Rate History',
        message: 'Clear historical count & dose rate series? This cannot be undone.',
        confirmLabel: 'Clear',
        action: () => { this.clearRatesData(); this.log('Rate history cleared'); }
      });
    },
    async loadSoundStatus() {
      if (!this.isConnected || !this.device) return;
      try {
        if (typeof VSFR === 'undefined' || !this.device.batchReadVsfrs) {
          // Fallback: try a getter if library exposes one (placeholder)
          this.log('⚠️ VSFR constant or batchReadVsfrs not available; skipping sound status read');
          return;
        }
        this.log('Reading sound status...');
        const r = await this.device.batchReadVsfrs([VSFR.SOUND_ON]);
        this.soundEnabled = !!r[0];
        this.log('Sound status: ' + (this.soundEnabled ? 'ON' : 'OFF'));
      } catch (e) {
        this.soundEnabled = null;
        this.log('❌ Failed to read sound status: ' + e.message);
      }
    },
    async toggleSound() {
      if (!this.isConnected || !this.device) return;
      if (this.soundEnabled === null) {
        await this.loadSoundStatus();
        if (this.soundEnabled === null) return; // still unknown
      }
      try {
        const newVal = this.soundEnabled ? 0 : 1;
        await this.device.set_sound_on(newVal);
        this.soundEnabled = !!newVal;
        this.log('Set sound ' + (this.soundEnabled ? 'ON' : 'OFF'));
      } catch (e) {
        this.log('❌ Failed to set sound: ' + e.message);
      }
    },
    reloadUI() {
      // Preserve current device & essential flags
      if (!this.device) {
        this.log('Reload UI: no active device, nothing to preserve.');
        return;
      }
      const dev = this.device;
      const wasConnected = this.isConnected;
      const info = {...this.deviceInfo};
      const alarm = this.alarmLimits ? {...this.alarmLimits} : null;
      const sound = this.soundEnabled;
      // Stop timers / charts
      if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null; }
      if (this.countRateChart || this.doseRateChart) this.destroySmoothieChart();
      // Reset dynamic UI state
      this.autoUpdateEnabled = false;
      this.rates_series = [
        {name: 'Count Rate', data: [], yAxisIndex: 0},
        {name: 'Dose Rate', data: [], yAxisIndex: 1}
      ];
      this.resetStats();
      this.currentData = {countRate:0, doseRate:0, countRateError:0, doseRateError:0};
      this.spectrum_series = [];
      this.spectrum_duration = 0;
      // Recreate charts
      this.initializeSmoothieChart();
      // Restore preserved information
      this.device = dev;
      this.isConnected = wasConnected;
      this.deviceInfo = info;
      this.alarmLimits = alarm;
      this.soundEnabled = sound;
      // Optionally restart auto-update
      this.toggleAutoUpdate();
      this.log('UI reloaded (device preserved).');
  },
    toggleCountErrorRange() {
      this.showCountErrorRange = !this.showCountErrorRange;
      if (!this.countRateChart) return;
      if (this.showCountErrorRange) {
        this.countRateChart.addTimeSeries(this.countRateUpperTimeSeries, {strokeStyle:'rgba(0,123,255,0.30)', lineWidth:1});
        this.countRateChart.addTimeSeries(this.countRateLowerTimeSeries, {strokeStyle:'rgba(0,123,255,0.25)', lineWidth:1});
      } else {
        this.countRateChart.removeTimeSeries(this.countRateUpperTimeSeries);
        this.countRateChart.removeTimeSeries(this.countRateLowerTimeSeries);
      }
    },
    toggleDoseErrorRange() {
      this.showDoseErrorRange = !this.showDoseErrorRange;
      if (!this.doseRateChart) return;
      if (this.showDoseErrorRange) {
        this.doseRateChart.addTimeSeries(this.doseRateUpperTimeSeries, {strokeStyle:'rgba(40,167,69,0.30)', lineWidth:1});
        this.doseRateChart.addTimeSeries(this.doseRateLowerTimeSeries, {strokeStyle:'rgba(40,167,69,0.25)', lineWidth:1});
      } else {
        this.doseRateChart.removeTimeSeries(this.doseRateUpperTimeSeries);
        this.doseRateChart.removeTimeSeries(this.doseRateLowerTimeSeries);
      }
    }
  },
});
