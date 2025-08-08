/**
 * RadiaCode Web Library - Consolidated Implementation
 * 
 * A complete JavaScript implementation for communicating with RadiaCode radiation detection devices.
 * This consolidated version includes all transport layers and communication protocols in a single file.
 * 
 * Features:
 * - Support for both Bluetooth and USB transports
 * - Real-time radiation measurements similar to Python implementation
 * - Spectrum acquisition and analysis
 * - Device configuration management
 * - Energy calibration support
 * 
 * Compatible with the Python RadiaCode library API for familiar usage patterns.
 */

// ============================================================================
// COMMON DEFINITIONS AND UTILITIES
// ============================================================================

// Library version
const RADIACODE_JS_VERSION = '1.0.1';

// Command types (from Python implementation)
const COMMAND = {
    GET_STATUS: 0x0005,
    SET_EXCHANGE: 0x0007,
    GET_VERSION: 0x000A,
    GET_SERIAL: 0x000B,
    FW_IMAGE_GET_INFO: 0x0012,
    FW_SIGNATURE: 0x0101,
    RD_HW_CONFIG: 0x0807,
    RD_VIRT_SFR: 0x0824,
    WR_VIRT_SFR: 0x0825,
    RD_VIRT_STRING: 0x0826,
    WR_VIRT_STRING: 0x0827,
    RD_VIRT_SFR_BATCH: 0x082A,
    WR_VIRT_SFR_BATCH: 0x082B,
    RD_FLASH: 0x081C,
    SET_TIME: 0x0A04
};

// Virtual String command IDs (from types.py)
const VS = {
    CONFIGURATION: 2,
    SERIAL_NUMBER: 8,
    TEXT_MESSAGE: 0xF,
    DATA_BUF: 0x100,
    SFR_FILE: 0x101,
    SPECTRUM: 0x200,
    SPEC_ACCUM: 0x201,
    ENERGY_CALIB: 0x202
};

// Virtual Special Function Register IDs (VSFR)
const VSFR = {
    DEVICE_CTRL:       0x0500,
    DEVICE_LANG:       0x0502,
    DEVICE_ON:         0x0503,
    DEVICE_TIME:       0x0504,

    DISP_CTRL:         0x0510,
    DISP_BRT:          0x0511,
    DISP_CONTR:        0x0512,
    DISP_OFF_TIME:     0x0513,
    DISP_ON:           0x0514,
    DISP_DIR:          0x0515,
    DISP_BACKLT_ON:    0x0516,

    SOUND_CTRL:        0x0520,
    SOUND_VOL:         0x0521,
    SOUND_ON:          0x0522,
    SOUND_BUTTON:      0x0523,

    VIBRO_CTRL:        0x0530,
    VIBRO_ON:          0x0531,

    LEDS_CTRL:         0x0540,
    LED0_BRT:          0x0541,
    LED1_BRT:          0x0542,
    LED2_BRT:          0x0543,
    LED3_BRT:          0x0544,
    LEDS_ON:           0x0545,

    ALARM_MODE:        0x05E0,
    PLAY_SIGNAL:       0x05E1,

    MS_CTRL:           0x0600,
    MS_MODE:           0x0601,
    MS_SUB_MODE:       0x0602,
    MS_RUN:            0x0603,

    BLE_TX_PWR:        0x0700,

    DR_LEV1_uR_h:      0x8000,
    DR_LEV2_uR_h:      0x8001,
    DS_LEV1_100uR:     0x8002,
    DS_LEV2_100uR:     0x8003,
    DS_UNITS:          0x8004,
    CPS_FILTER:        0x8005,
    RAW_FILTER:        0x8006,
    DOSE_RESET:        0x8007,
    CR_LEV1_cp10s:     0x8008,
    CR_LEV2_cp10s:     0x8009,

    USE_nSv_h:         0x800C,

    CHN_TO_keV_A0:     0x8010,
    CHN_TO_keV_A1:     0x8011,
    CHN_TO_keV_A2:     0x8012,
    CR_UNITS:          0x8013,
    DS_LEV1_uR:        0x8014,
    DS_LEV2_uR:        0x8015,

    CPS:               0x8020,
    DR_uR_h:           0x8021,
    DS_uR:             0x8022,

    TEMP_degC:         0x8024,
    ACC_X:             0x8025,
    ACC_Y:             0x8026,
    ACC_Z:             0x8027,
    OPT:               0x8028,

    RAW_TEMP_degC:     0x8033,
    TEMP_UP_degC:      0x8034,
    TEMP_DN_degC:      0x8035,

    VBIAS_mV:          0xC000,
    COMP_LEV:          0xC001,
    CALIB_MODE:        0xC002,
    DPOT_RDAC:         0xC004,
    DPOT_RDAC_EEPROM:  0xC005,
    DPOT_TOLER:        0xC006,

    SYS_MCU_ID0:       0xFFFF0000,
    SYS_MCU_ID1:       0xFFFF0001,
    SYS_MCU_ID2:       0xFFFF0002,

    SYS_DEVICE_ID:     0xFFFF0005,
    SYS_SIGNATURE:     0xFFFF0006,
    SYS_RX_SIZE:       0xFFFF0007,
    SYS_TX_SIZE:       0xFFFF0008,
    SYS_BOOT_VERSION:  0xFFFF0009,
    SYS_TARGET_VERSION:0xFFFF000A,
    SYS_STATUS:        0xFFFF000B,
    SYS_MCU_VREF:      0xFFFF000C,
    SYS_MCU_TEMP:      0xFFFF000D,
    SYS_FW_VER_BT:     0xFFFF010
};

// VSFR data format specifications (format string for data type)
const VSFR_FORMATS = {
    [VSFR.DEVICE_CTRL]:       'I', // uint32
    [VSFR.DEVICE_LANG]:       'I', // uint32
    [VSFR.DEVICE_ON]:         'I', // uint32
    [VSFR.DEVICE_TIME]:       'I', // uint32

    [VSFR.DISP_CTRL]:         'I', // uint32
    [VSFR.DISP_BRT]:          'I', // uint32
    [VSFR.DISP_CONTR]:        'I', // uint32
    [VSFR.DISP_OFF_TIME]:     'I', // uint32
    [VSFR.DISP_ON]:           'I', // uint32
    [VSFR.DISP_DIR]:          'I', // uint32
    [VSFR.DISP_BACKLT_ON]:    'I', // uint32

    [VSFR.SOUND_CTRL]:        'I', // uint32
    [VSFR.SOUND_VOL]:         'I', // uint32
    [VSFR.SOUND_ON]:          'I', // uint32
    [VSFR.SOUND_BUTTON]:      'I', // uint32

    [VSFR.VIBRO_CTRL]:        'I', // uint32
    [VSFR.VIBRO_ON]:          'I', // uint32

    [VSFR.LEDS_CTRL]:         'I', // uint32
    [VSFR.LED0_BRT]:          'I', // uint32
    [VSFR.LED1_BRT]:          'I', // uint32
    [VSFR.LED2_BRT]:          'I', // uint32
    [VSFR.LED3_BRT]:          'I', // uint32
    [VSFR.LEDS_ON]:           'I', // uint32

    [VSFR.ALARM_MODE]:        'I', // uint32
    [VSFR.PLAY_SIGNAL]:       'I', // uint32

    [VSFR.MS_CTRL]:           'I', // uint32
    [VSFR.MS_MODE]:           'I', // uint32
    [VSFR.MS_SUB_MODE]:       'I', // uint32
    [VSFR.MS_RUN]:            'I', // uint32

    [VSFR.BLE_TX_PWR]:        'I', // uint32

    [VSFR.DR_LEV1_uR_h]:      'I', // uint32
    [VSFR.DR_LEV2_uR_h]:      'I', // uint32
    [VSFR.DS_LEV1_100uR]:     'I', // uint32
    [VSFR.DS_LEV2_100uR]:     'I', // uint32
    [VSFR.DS_UNITS]:          'I', // uint32 (boolean flag)
    [VSFR.CPS_FILTER]:        'I', // uint32
    [VSFR.RAW_FILTER]:        'I', // uint32
    [VSFR.DOSE_RESET]:        'I', // uint32
    [VSFR.CR_LEV1_cp10s]:     'I', // uint32
    [VSFR.CR_LEV2_cp10s]:     'I', // uint32

    [VSFR.USE_nSv_h]:         'I', // uint32

    [VSFR.CHN_TO_keV_A0]:     'I', // uint32
    [VSFR.CHN_TO_keV_A1]:     'I', // uint32
    [VSFR.CHN_TO_keV_A2]:     'I', // uint32
    [VSFR.CR_UNITS]:          'I', // uint32 (boolean flag)
    [VSFR.DS_LEV1_uR]:        'I', // uint32
    [VSFR.DS_LEV2_uR]:        'I', // uint32

    [VSFR.CPS]:               'I', // uint32
    [VSFR.DR_uR_h]:           'I', // uint32
    [VSFR.DS_uR]:             'I', // uint32

    [VSFR.TEMP_degC]:         'I', // uint32
    [VSFR.ACC_X]:             'I', // uint32
    [VSFR.ACC_Y]:             'I', // uint32
    [VSFR.ACC_Z]:             'I', // uint32
    [VSFR.OPT]:               'I', // uint32

    [VSFR.RAW_TEMP_degC]:     'I', // uint32
    [VSFR.TEMP_UP_degC]:      'I', // uint32
    [VSFR.TEMP_DN_degC]:      'I', // uint32

    [VSFR.VBIAS_mV]:          'I', // uint32
    [VSFR.COMP_LEV]:          'I', // uint32
    [VSFR.CALIB_MODE]:        'I', // uint32
    [VSFR.DPOT_RDAC]:         'I', // uint32
    [VSFR.DPOT_RDAC_EEPROM]:  'I', // uint32
    [VSFR.DPOT_TOLER]:        'I', // uint32

    [VSFR.SYS_MCU_ID0]:       'I', // uint32
    [VSFR.SYS_MCU_ID1]:       'I', // uint32
    [VSFR.SYS_MCU_ID2]:       'I', // uint32

    [VSFR.SYS_DEVICE_ID]:     'I', // uint32
    [VSFR.SYS_SIGNATURE]:     'I', // uint32
    [VSFR.SYS_RX_SIZE]:       'I', // uint32
    [VSFR.SYS_TX_SIZE]:       'I', // uint32
    [VSFR.SYS_BOOT_VERSION]:  'I', // uint32
    [VSFR.SYS_TARGET_VERSION]:'I', // uint32
    [VSFR.SYS_STATUS]:        'I', // uint32
    [VSFR.SYS_MCU_VREF]:      'I', // uint32
    [VSFR.SYS_MCU_TEMP]:      'I', // uint32
    [VSFR.SYS_FW_VER_BT]:     'I'  // uint32
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ----------------------------------------------------------------------------
// Debug logging (env-driven)
// - Uses the `debug` package when available (Node/CommonJS)
// - Falls back to a simple namespaced console logger in browsers controlled by
//   localStorage.debug (same convention as `debug`), e.g.:
//     localStorage.debug = 'radiacode:*'   // enable all radiacode logs
//     localStorage.debug = 'radiacode:usb' // only USB transport
// ----------------------------------------------------------------------------
const createLogger = (() => {
    let factory = null;
    // Prefer Node/CommonJS debug if available
    try {
        if (typeof module !== 'undefined' && module.exports) {
            // eslint-disable-next-line global-require
            const dbg = require('debug');
            factory = (ns) => dbg(ns);
        }
    } catch (_) { /* ignore */ }

    if (!factory) {
        // Browser fallback: simple namespace matcher using localStorage.debug
        const getPattern = () => {
            try {
                if (typeof localStorage !== 'undefined') {
                    return localStorage.debug || localStorage.DEBUG || '';
                }
            } catch (_) { /* ignore */ }
            return '';
        };

        const escapeRe = (s) => s.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        const toRegex = (glob) => new RegExp('^' + escapeRe(glob).replace(/\*/g, '.*?') + '$');
        const compile = (str) => {
            const tokens = String(str || '').split(/[\s,]+/).filter(Boolean);
            const enables = [];
            const disables = [];
            for (const t of tokens) {
                if (t.startsWith('-')) disables.push(toRegex(t.slice(1)));
                else enables.push(toRegex(t));
            }
            return (ns) => {
                if (disables.some((re) => re.test(ns))) return false;
                if (enables.length === 0) return false;
                return enables.some((re) => re.test(ns));
            };
        };

        let matcher = compile(getPattern());
        try {
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('storage', (e) => {
                    if (!e.key) return;
                    const k = e.key.toLowerCase();
                    if (k === 'debug') matcher = compile(getPattern());
                });
            }
        } catch (_) { /* ignore */ }

        factory = (ns) => {
            const fn = (...args) => {
                if (!matcher(ns)) return;
                console.log(`${ns}:`, ...args);
            };
            // Expose enabled flag similar to `debug`
            Object.defineProperty(fn, 'enabled', {
                get: () => matcher(ns)
            });
            return fn;
        };
    }
    return factory;
})();

// Error classes
class DeviceNotFound extends Error {
    constructor(message) {
        super(message);
        this.name = 'DeviceNotFound';
    }
}

class ConnectionClosed extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConnectionClosed';
    }
}

class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}

class MultipleUSBReadFailure extends Error {
    constructor(message) {
        super(message || 'Multiple USB Read Failures');
        this.name = 'MultipleUSBReadFailure';
    }
}

/**
 * BytesBuffer - A utility class for handling binary data similar to the Python version
 */
class BytesBuffer {
    constructor(data) {
        this.data = new Uint8Array(data);
        this.position = 0;
    }

    read(length) {
        if (this.position + length > this.data.length) {
            throw new Error('Insufficient data in buffer');
        }
        const result = this.data.slice(this.position, this.position + length);
        this.position += length;
        return result;
    }

    readUint8() {
        const result = this.data[this.position];
        this.position += 1;
        return result;
    }

    readUint16LE() {
        const result = (this.data[this.position + 1] << 8) | this.data[this.position];
        this.position += 2;
        return result;
    }

    readUint32LE() {
        const result = (this.data[this.position + 3] << 24) | 
                      (this.data[this.position + 2] << 16) | 
                      (this.data[this.position + 1] << 8) | 
                      this.data[this.position];
        this.position += 4;
        return result >>> 0; // Convert to unsigned
    }

    readInt32LE() {
        const result = (this.data[this.position + 3] << 24) | 
                      (this.data[this.position + 2] << 16) | 
                      (this.data[this.position + 1] << 8) | 
                      this.data[this.position];
        this.position += 4;
        return result;
    }

    readFloatLE() {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        for (let i = 0; i < 4; i++) {
            view.setUint8(i, this.data[this.position + i]);
        }
        this.position += 4;
        return view.getFloat32(0, true); // true = little endian
    }

    // Read a length-prefixed string, like Python's unpack_string
    readString() {
        const length = this.readUint8();
        const bytes = this.read(length);
        const decoder = new TextDecoder('ascii');
        return decoder.decode(bytes);
    }

    remaining() {
        return this.data.length - this.position;
    }

    size() {
        return this.data.length - this.position;
    }

    getBytes() {
        return this.data;
    }
}

// ============================================================================
// DATA TYPES AND STRUCTURES
// ============================================================================

/**
 * Real-time radiation measurement data from the device (matching Python RealTimeData)
 */
class RealTimeData {
    constructor(dt, count_rate, count_rate_err, dose_rate, dose_rate_err, flags, real_time_flags) {
        this.dt = dt;                          // Timestamp of the measurement
        this.count_rate = count_rate;          // Number of counts per second
        this.count_rate_err = count_rate_err;  // Count rate error percentage
        this.dose_rate = dose_rate;            // Radiation dose rate measurement
        this.dose_rate_err = dose_rate_err;    // Dose rate measurement error percentage
        this.flags = flags;                    // Status flags for the measurement
        this.real_time_flags = real_time_flags;// Real-time status flags
    }
}

/**
 * Raw radiation measurement data without error calculations
 */
class RawData {
    constructor(dt, count_rate, dose_rate) {
        this.dt = dt;                          // Timestamp of the measurement
        this.count_rate = count_rate;          // Number of counts per second
        this.dose_rate = dose_rate;            // Radiation dose rate measurement
    }
}

/**
 * Database record for dose rate measurements
 */
class DoseRateDB {
    constructor(dt, count, count_rate, dose_rate, dose_rate_err, flags) {
        this.dt = dt;                          // Timestamp of the measurement
        this.count = count;                    // Total number of counts in the measurement period
        this.count_rate = count_rate;          // Number of counts per second
        this.dose_rate = dose_rate;            // Radiation dose rate measurement
        this.dose_rate_err = dose_rate_err;    // Dose rate measurement error percentage
        this.flags = flags;                    // Status flags for the measurement
    }
}

/**
 * Periodic device status and accumulated dose data
 */
class RareData {
    constructor(dt, duration, dose, temperature, charge_level, flags) {
        this.dt = dt;                          // Timestamp of the status reading
        this.duration = duration;              // Duration of dose accumulation in seconds
        this.dose = dose;                      // Accumulated radiation dose
        this.temperature = temperature;        // Device temperature reading
        this.charge_level = charge_level;      // Battery charge level
        this.flags = flags;                    // Status flags
    }
}

/**
 * Radiation energy spectrum measurement data (matching Python Spectrum)
 */
class Spectrum {
    constructor(duration, a0, a1, a2, counts) {
        this.duration = duration;              // Measurement duration in seconds
        this.a0 = a0;                         // Energy calibration coefficient (offset)
        this.a1 = a1;                         // Energy calibration coefficient (linear)
        this.a2 = a2;                         // Energy calibration coefficient (quadratic)
        this.counts = counts;                  // List of counts per energy channel
    }

    /**
     * Convert channel number to energy using calibration coefficients
     * @param {number} channel - Channel number
     * @returns {number} Energy in keV
     */
    channelToEnergy(channel) {
        return this.a0 + this.a1 * channel + this.a2 * channel * channel;
    }

    /**
     * Get total counts in the spectrum
     * @returns {number} Total counts
     */
    getTotalCounts() {
        return this.counts.reduce((sum, count) => sum + count, 0);
    }

    /**
     * Get energy range for all channels
     * @returns {Array<number>} Array of energies corresponding to each channel
     */
    getEnergies() {
        return this.counts.map((_, index) => this.channelToEnergy(index + 0.5));
    }
}

/**
 * Device alarm limits configuration (matching Python AlarmLimits)
 */
class AlarmLimits {
    constructor(l1_count_rate, l2_count_rate, l1_dose_rate, l2_dose_rate, l1_dose, l2_dose, dose_unit, count_unit) {
        this.l1_count_rate = l1_count_rate;    // Level 1 count rate alarm threshold
        this.l2_count_rate = l2_count_rate;    // Level 2 count rate alarm threshold
        this.l1_dose_rate = l1_dose_rate;      // Level 1 dose rate alarm threshold
        this.l2_dose_rate = l2_dose_rate;      // Level 2 dose rate alarm threshold
        this.l1_dose = l1_dose;                // Level 1 accumulated dose alarm threshold
        this.l2_dose = l2_dose;                // Level 2 accumulated dose alarm threshold
        this.dose_unit = dose_unit;            // Dose unit ('Sv' or 'R')
        this.count_unit = count_unit;          // Count rate unit ('cpm' or 'cps')
    }
}

// ============================================================================
// TRANSPORT LAYER
// ============================================================================

/**
 * Abstract base class for RadiaCode transports
 */
class RadiaCodeTransport {
    constructor() {
        this.isConnected = false;
        this.isClosing = false;
    }

    static isSupported() {
        throw new Error('isSupported() must be implemented by transport');
    }

    async connect() {
        throw new Error('connect() must be implemented by transport');
    }

    async send(data) {
        throw new Error('send() must be implemented by transport');
    }

    async receive(timeout = 10000) {
        throw new Error('receive() must be implemented by transport');
    }

    async disconnect() {
        throw new Error('disconnect() must be implemented by transport');
    }

    connected() {
        return this.isConnected;
    }

    cleanup() {
        this.isConnected = false;
        this.isClosing = false;
    }
}

// ============================================================================
// BLUETOOTH TRANSPORT
// ============================================================================

// RadiaCode Bluetooth Service and Characteristic UUIDs
const RADIACODE_SERVICE_UUID = 'e63215e5-7003-49d8-96b0-b024798fb901';
const WRITE_CHARACTERISTIC_UUID = 'e63215e6-7003-49d8-96b0-b024798fb901';
const NOTIFY_CHARACTERISTIC_UUID = 'e63215e7-7003-49d8-96b0-b024798fb901';

/**
 * Bluetooth transport implementation for RadiaCode devices
 */
class RadiaCodeBluetoothTransport extends RadiaCodeTransport {
    constructor() {
        super();
        this.device = null;
        this.server = null;
        this.service = null;
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        
        this.responseBuffer = new Uint8Array(0);
        this.responseSize = 0;
        this.pendingResponse = null;
        this.responsePromiseResolve = null;
        this.responsePromiseReject = null;
        
        this.maxPacketSize = 18;
    }

    static isSupported() {
        const nav = (typeof navigator !== 'undefined') ? navigator : (typeof globalThis !== 'undefined' ? globalThis.navigator : undefined);
        return !!(nav && 'bluetooth' in nav);
    }

    async connect() {
        if (!RadiaCodeBluetoothTransport.isSupported()) {
            throw new DeviceNotFound('Web Bluetooth is not supported in this browser');
        }

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{
                    services: [RADIACODE_SERVICE_UUID]
                }],
                optionalServices: [RADIACODE_SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', this.onDisconnected.bind(this));
            this.server = await this.device.gatt.connect();
            this.service = await this.server.getPrimaryService(RADIACODE_SERVICE_UUID);
            this.writeCharacteristic = await this.service.getCharacteristic(WRITE_CHARACTERISTIC_UUID);
            this.notifyCharacteristic = await this.service.getCharacteristic(NOTIFY_CHARACTERISTIC_UUID);

            await this.notifyCharacteristic.startNotifications();
            this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

            this.isConnected = true;
            return true;

        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            throw new DeviceNotFound(`Failed to connect to RadiaCode device: ${error.message}`);
        }
    }

    onDisconnected() {
        console.log('Bluetooth device disconnected');
        this.isConnected = false;
        this.cleanup();
        
        if (this.responsePromiseReject) {
            this.responsePromiseReject(new ConnectionClosed('Device disconnected'));
        }
    }

    handleNotification(event) {
        //console.log(event);
        const value = new Uint8Array(event.target.value.buffer);
        //console.log(value);
        if (this.responseSize === 0) {
            if (value.length < 4) {
                console.error('Invalid response packet: too short');
                return;
            }
            const dataView = new DataView(value.buffer, value.byteOffset, value.byteLength);
            const payloadSize = dataView.getUint32(0, true);
            this.responseSize = 4 + payloadSize;
            this.responseBuffer = new Uint8Array(value.slice(4));
        } else {
            const newBuffer = new Uint8Array(this.responseBuffer.length + value.length);
            newBuffer.set(this.responseBuffer);
            newBuffer.set(value, this.responseBuffer.length);
            this.responseBuffer = newBuffer;
        }
        
        this.responseSize -= value.length;
        
        if (this.responseSize < 0) {
            console.error('Response size mismatch');
            if (this.responsePromiseReject) this.responsePromiseReject(new Error('Response size mismatch'));
            this.responseBuffer = new Uint8Array(0);
            this.responseSize = 0;
            return;
        }
        
        if (this.responseSize === 0) {
            this.pendingResponse = new BytesBuffer(this.responseBuffer);
            this.responseBuffer = new Uint8Array(0);
            
            if (this.responsePromiseResolve) {
                this.responsePromiseResolve(this.pendingResponse);
                this.responsePromiseResolve = null;
                this.responsePromiseReject = null;
            }
        }
    }

    async send(data) {
        if (!this.isConnected) throw new ConnectionClosed('Device not connected');
        if (this.isClosing) throw new ConnectionClosed('Connection is closing');

        const requestBytes = new Uint8Array(data);
        for (let pos = 0; pos < requestBytes.length; pos += this.maxPacketSize) {
            const chunk = requestBytes.slice(pos, Math.min(pos + this.maxPacketSize, requestBytes.length));
            await this.writeCharacteristic.writeValue(chunk);
        }
    }

    async receive(timeout = 10000) {
        if (!this.isConnected) throw new ConnectionClosed('Device not connected');
        if (this.isClosing) throw new ConnectionClosed('Connection is closing');
        if (this.responsePromiseResolve) throw new Error('Concurrent receive operations are not supported.');

        return new Promise((resolve, reject) => {
            this.responsePromiseResolve = resolve;
            this.responsePromiseReject = reject;
            
            setTimeout(() => {
                if (this.responsePromiseReject === reject) {
                    this.responsePromiseResolve = null;
                    this.responsePromiseReject = null;
                    reject(new TimeoutError('Response timeout'));
                }
            }, timeout);
        });
    }

    async disconnect() {
        this.isClosing = true;
        try {
            if (this.device && this.device.gatt.connected) {
                if (this.notifyCharacteristic) {
                    await this.notifyCharacteristic.stopNotifications();
                }
                this.server.disconnect();
            }
        } catch (error) {
            console.warn('Error during Bluetooth disconnect:', error);
        }
        this.cleanup();
    }

    cleanup() {
        super.cleanup();
        this.device = null;
        this.server = null;
        this.service = null;
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        this.responseBuffer = new Uint8Array(0);
        this.responseSize = 0;
        this.pendingResponse = null;
        this.responsePromiseResolve = null;
        this.responsePromiseReject = null;
    }

    connected() {
        return this.isConnected && this.device && this.device.gatt.connected;
    }
}

// ============================================================================
// USB TRANSPORT
// ============================================================================

// RadiaCode USB device identifiers (from Python implementation)
const RADIACODE_USB_VENDOR_ID = 0x0483;
const RADIACODE_USB_PRODUCT_ID = 0xF123;

/**
 * USB transport implementation for RadiaCode devices
 */
class RadiaCodeUSBTransport extends RadiaCodeTransport {
    constructor(serialNumber = null, timeoutMs = 3000) {
        super();
        this.device = null;
        this.interface = null;
        this.serialNumber = serialNumber;
        this.timeoutMs = timeoutMs;
    // Deprecated flag retained for backward-compat only; use DEBUG env/localStorage
    this.usbDebug = false;
    this.usbLog = createLogger('radiacode:usb');
        // Fixed endpoint numbers matching Python implementation
        this.endpointOut = 1;    // Write endpoint (0x1 in Python)
        this.endpointIn = 1;     // Read endpoint (0x81 in Python, but WebUSB uses just the number)
    }

    static isSupported() {
        const nav = (typeof navigator !== 'undefined') ? navigator : (typeof globalThis !== 'undefined' ? globalThis.navigator : undefined);
        return !!(nav && 'usb' in nav);
    }

    async connect() {
        if (!RadiaCodeUSBTransport.isSupported()) {
            throw new DeviceNotFound('Web USB is not supported in this browser');
        }

        try {
            const filters = [{
                vendorId: RADIACODE_USB_VENDOR_ID,
                productId: RADIACODE_USB_PRODUCT_ID
            }];
            
            if (this.serialNumber) {
                filters[0].serialNumber = this.serialNumber;
            }

            this.device = await navigator.usb.requestDevice({ filters });

            await this.device.open();
            
            if (this.device.configuration === null) {
                await this.device.selectConfiguration(1);
            }

            this.interface = this.device.configuration.interfaces[0];
            await this.device.claimInterface(this.interface.interfaceNumber);

            // Log interface configuration for debugging
            const alternate = this.interface.alternates[0];
            this.usbLog('Interface configuration:', {
                interfaceNumber: this.interface.interfaceNumber,
                alternateCount: this.interface.alternates.length,
                endpoints: alternate.endpoints.map(ep => ({
                    endpointNumber: ep.endpointNumber,
                    direction: ep.direction,
                    type: ep.type,
                    packetSize: ep.packetSize
                }))
            });
            
            this.endpointOut = 1;
            this.endpointIn = 1;
            this.usbLog(`🔌 Using fixed endpoints: OUT=${this.endpointOut}, IN=${this.endpointIn}`);


            // HACK: not sure why this isn't needed, but it makes things work if I comment it out

            //await this.clearPendingData();

            await new Promise(resolve => setTimeout(resolve, 50));

            this.isConnected = true;
            this.usbLog('RadiaCode USB device connected successfully');
            return true;

        } catch (error) {
            console.error('USB connection failed:', error);
            throw new DeviceNotFound(`Failed to connect to RadiaCode USB device: ${error.message}`);
        }
    }

    async clearPendingData() {
    this.usbLog(`Clearing pending data from USB device...`);
        let clearedBytes = 0;
        let attempts = 0;
        
        try {
            // Match Python implementation exactly: keep reading until timeout
            while (true) {
                attempts++;
                try {
                    this.usbLog(`Clear attempt ${attempts}: reading pending data...`);
                    
                    // Use 256 bytes like Python implementation, with 100ms timeout
                    const result = await this.device.transferIn(this.endpointIn, 256);
                    
                    if (result.status !== 'ok') {
                        this.usbLog(`Clear attempt ${attempts}: USB transfer status not OK (${result.status}), stopping`);
                        break;
                    }
                    
                    if (result.data && result.data.byteLength > 0) {
                        clearedBytes += result.data.byteLength;
                        this.usbLog(`Clear attempt ${attempts}: cleared ${result.data.byteLength} bytes (total: ${clearedBytes})`);
                        // Continue loop - there might be more data
                    } else {
                        this.usbLog(`Clear attempt ${attempts}: no data received, buffer is empty`);
                        break;
                    }
                } catch (error) {
                    // This is expected when no more data - equivalent to USBTimeoutError in Python
                    this.usbLog(`Clear attempt ${attempts}: ${error.message} - no more data available`);
                    break;
                }
            }
        } catch (error) {
            console.log(`Clear operation failed: ${error.message}`);
        }
        
        if (clearedBytes > 0) {
            this.usbLog(`✅ Cleared ${clearedBytes} bytes of pending data in ${attempts} attempts`);
        } else {
            this.usbLog(`✅ No pending data found (checked in ${attempts} attempts)`);
        }
    }

    async send(data) {
        if (!this.isConnected) throw new ConnectionClosed('Device not connected');
        if (this.isClosing) throw new ConnectionClosed('Connection is closing');

        try {
            this.usbLog(`Sending ${data.byteLength} bytes to endpoint ${this.endpointOut}:`, Array.from(new Uint8Array(data)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            const result = await this.device.transferOut(this.endpointOut, data);
            
            if (result.status !== 'ok') {
                throw new Error(`USB transfer failed: ${result.status}`);
            }
            this.usbLog(`Successfully sent ${result.bytesWritten} bytes`);
            
            // Add a small delay after sending to ensure device processes the command
            await new Promise(resolve => setTimeout(resolve, 10));
            
        } catch (error) {
            console.error('USB send error:', error);
            throw new Error(`Failed to send USB data: ${error.message}`);
        }
    }

    async receive(timeout = 10000) {
        if (!this.isConnected) throw new ConnectionClosed('Device not connected');
        if (this.isClosing) throw new ConnectionClosed('Connection is closing');

        try {
            // Simplified approach matching Python implementation more closely
            let trials = 0;
            const maxTrials = 3;
            let initialData;

            // Create a timeout promise for the entire operation
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new TimeoutError(`USB read timeout after ${timeout}ms`)), timeout)
            );

            // First, try to read initial data with retries like Python implementation
            while (trials < maxTrials) {
                try {
                    this.usbLog(`Attempting to read from endpoint ${this.endpointIn}, trial ${trials + 1}`);
                    
                    // Use 256 bytes like Python implementation (this is buffer size, not packet size)
                    const transferPromise = this.device.transferIn(this.endpointIn, 256);
                    const result = await Promise.race([transferPromise, timeoutPromise]);
                    
                    if (result.status !== 'ok') {
                        throw new Error(`USB transfer failed: ${result.status}`);
                    }

                    initialData = new Uint8Array(result.data.buffer);
                    this.usbLog(`Received ${initialData.length} bytes on trial ${trials + 1}`);
                    
                    if (initialData.length > 0) {
                        break;
                    } else {
                        trials++;
                        // Add a small delay before retrying
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                } catch (error) {
                    if (error instanceof TimeoutError) {
                        throw error; // Don't retry on timeout
                    }
                    console.error(`Trial ${trials + 1} failed:`, error);
                    trials++;
                    if (trials >= maxTrials) {
                        throw new MultipleUSBReadFailure(`${trials} USB Read Failures in sequence`);
                    }
                    // Add a small delay before retrying
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            if (trials >= maxTrials) {
                throw new MultipleUSBReadFailure(`${trials} USB Read Failures in sequence`);
            }

            if (initialData.length < 4) {
                throw new Error('USB response too short - missing length header');
            }

            const dataView = new DataView(initialData.buffer, 0, 4);
            const responseLength = dataView.getUint32(0, true);
            this.usbLog(`Expected response length: ${responseLength}`);
            
            let responseData = initialData.slice(4);

            while (responseData.length < responseLength) {
                const remainingBytes = responseLength - responseData.length;
                this.usbLog(`Reading additional ${remainingBytes} bytes...`);
                
                const readSize = Math.min(remainingBytes, 256);
                const transferPromise = this.device.transferIn(this.endpointIn, readSize);
                const result = await Promise.race([transferPromise, timeoutPromise]);
                
                if (result.status !== 'ok') {
                    throw new Error(`USB transfer failed: ${result.status}`);
                }

                const additionalData = new Uint8Array(result.data.buffer);
                const combined = new Uint8Array(responseData.length + additionalData.length);
                combined.set(responseData);
                combined.set(additionalData, responseData.length);
                responseData = combined;
            }

            this.usbLog(`Successfully received complete response: ${responseData.length} bytes`);
            return new BytesBuffer(responseData);

        } catch (error) {
            console.error('USB receive error:', error);
            throw error; // Re-throw the original error instead of wrapping it
        }
    }

    async disconnect() {
        this.isClosing = true;
        try {
            if (this.device) {
                if (this.interface) {
                    await this.device.releaseInterface(this.interface.interfaceNumber);
                }
                await this.device.close();
            }
        } catch (error) {
            console.warn('Error during USB disconnect:', error);
        }
        this.cleanup();
    }

    cleanup() {
        super.cleanup();
        this.device = null;
        this.interface = null;
    }

    connected() {
        return this.isConnected && this.device && this.device.opened;
    }
}

// ============================================================================
// DATA BUFFER DECODERS
// ============================================================================

/**
 * Decode data buffer contents similar to Python decode_VS_DATA_BUF
 */
function decodeDataBuffer(buffer, baseTime) {
    const br = new BytesBuffer(buffer);
    const ret = [];
    let nextSeq = null;
    
    while (br.size() >= 7) {
        const seq = br.readUint8();
        const eid = br.readUint8();
        const gid = br.readUint8();
        const tsOffset = br.readInt32LE();
        
        const dt = new Date(baseTime.getTime() + tsOffset * 10);
        
        if (nextSeq !== null && nextSeq !== seq) {
            console.warn(`Sequence jump while processing eid=${eid} gid=${gid}, expect:${nextSeq}, got:${seq}`);
            break;
        }
        
        nextSeq = (seq + 1) % 256;
        
        if (eid === 0 && gid === 0) { // GRP_RealTimeData
            const count_rate = br.readFloatLE();
            const dose_rate = br.readFloatLE();
            const count_rate_err = br.readUint16LE();
            const dose_rate_err = br.readUint16LE();
            const flags = br.readUint16LE();
            const rt_flags = br.readUint8();
            
            ret.push(new RealTimeData(
                dt,
                count_rate,
                count_rate_err / 10,
                dose_rate * 10000, // HACK: this makes the dose rate match the display on the device, need to investigate
                dose_rate_err / 10,
                flags,
                rt_flags
            ));
        } else if (eid === 0 && gid === 1) { // GRP_RawData
            const count_rate = br.readFloatLE();
            const dose_rate = br.readFloatLE();
            
            ret.push(new RawData(dt, count_rate, dose_rate));
        } else if (eid === 0 && gid === 2) { // GRP_DoseRateDB
            const count = br.readUint32LE();
            const count_rate = br.readFloatLE();
            const dose_rate = br.readFloatLE();
            const dose_rate_err = br.readUint16LE();
            const flags = br.readUint16LE();
            
            ret.push(new DoseRateDB(
                dt,
                count,
                count_rate,
                dose_rate,
                dose_rate_err / 10,
                flags
            ));
        } else if (eid === 0 && gid === 3) { // GRP_RareData
            const duration = br.readUint32LE();
            const dose = br.readFloatLE();
            const temperature = br.readUint16LE();
            const charge_level = br.readUint16LE();
            const flags = br.readUint16LE();
            let rd = new RareData(
                dt,
                duration,
                dose,
                (temperature - 2000) / 100,
                charge_level / 100,
                flags
            );
            window.latestRareData = rd; // Store latest rare data globally
            console.log(`RareData: dt=${dt}, duration=${duration}, dose=${dose}, temperature=${temperature}, charge_level=${charge_level}, flags=${flags}`);
            ret.push(rd);
        } else {
            // Skip unknown data types
            //console.warn(`Unknown data type: eid=${eid}, gid=${gid}`);
            break;
        }
    }
    
    return ret;
}

/**
 * Decode spectrum data similar to Python decode_RC_VS_SPECTRUM
 */
function decodeSpectrum(buffer, formatVersion = 1) {
    const br = new BytesBuffer(buffer);
    
    const ts = br.readUint32LE();
    const a0 = br.readFloatLE();
    const a1 = br.readFloatLE();
    const a2 = br.readFloatLE();
    
    let counts;
    if (formatVersion === 0) {
        counts = [];
        while (br.size() > 0) {
            counts.push(br.readUint32LE());
        }
    } else {
        // Format version 1 - compressed format
        counts = [];
        let last = 0;
        
        while (br.size() > 0) {
            const u16 = br.readUint16LE();
            const cnt = (u16 >> 4) & 0x0FFF;
            const vlen = u16 & 0x0F;
            
            for (let i = 0; i < cnt; i++) {
                let v;
                if (vlen === 0) {
                    v = 0;
                } else if (vlen === 1) {
                    v = br.readUint8();
                } else if (vlen === 2) {
                    v = last + br.readInt8();
                } else if (vlen === 3) {
                    v = last + br.readInt16LE();
                } else if (vlen === 4) {
                    const a = br.readUint8();
                    const b = br.readUint8();
                    const c = br.readInt8();
                    v = last + ((c << 16) | (b << 8) | a);
                } else if (vlen === 5) {
                    v = last + br.readInt32LE();
                } else {
                    throw new Error(`Unsupported vlen=${vlen} in spectrum decoder`);
                }
                
                last = v;
                counts.push(v);
            }
        }
    }
    
    return new Spectrum(ts, a0, a1, a2, counts);
}

// Add missing readInt8 and readInt16LE methods to BytesBuffer
BytesBuffer.prototype.readInt8 = function() {
    const result = this.data[this.position];
    this.position += 1;
    return result > 127 ? result - 256 : result;
};

BytesBuffer.prototype.readInt16LE = function() {
    const result = (this.data[this.position + 1] << 8) | this.data[this.position];
    this.position += 2;
    return result > 32767 ? result - 65536 : result;
};

// ============================================================================
// DEVICE COMMUNICATION PROTOCOL
// ============================================================================

/**
 * RadiaCode device communication protocol implementation
 */
class RadiaCodeDevice {
    constructor(transport) {
        this.transport = transport;
        this.sequenceNumber = 0;
    // Deprecated flag retained for backward-compat only; use DEBUG env/localStorage
        this.debug = false;
        this.baseTime = new Date();
        this.spectrumFormatVersion = 1;
        this.log = createLogger('radiacode:device');
        this.commandLookup = {};
        this.deviceTextMessage = "";
        for (const [key, value] of Object.entries(COMMAND)) {
            this.commandLookup[value] = key;
        }
    }

    /**
     * Execute a command on the device
     */
    async execute(command, args = null, timeout = 10000) {
        {
            const cmdName = this.commandLookup[command] || command;
            this.log(`Executing command: ${cmdName}, args: ${args ? args.length : 0} bytes`);
        }
        
        if (!this.transport.connected()) throw new ConnectionClosed('Device not connected');

        const reqSeqNo = 0x80 + this.sequenceNumber;
        this.sequenceNumber = (this.sequenceNumber + 1) % 32;

        const header = new ArrayBuffer(4);
        const headerView = new DataView(header);
        headerView.setUint16(0, command, true);
        headerView.setUint8(2, 0);
        headerView.setUint8(3, reqSeqNo);
        const requestHeaderBytes = new Uint8Array(header);

        const argsBytes = args || new Uint8Array(0);
        const requestPayload = new Uint8Array(4 + argsBytes.length);
        requestPayload.set(requestHeaderBytes, 0);
        requestPayload.set(argsBytes, 4);

        const fullRequest = new ArrayBuffer(4 + requestPayload.length);
        const fullRequestView = new DataView(fullRequest);
        fullRequestView.setUint32(0, requestPayload.length, true);
        new Uint8Array(fullRequest, 4).set(requestPayload);

    this.log(`Sending request: command=${command}, seqNo=${reqSeqNo}, argsLength=${argsBytes.length}`);
        
        await this.transport.send(new Uint8Array(fullRequest));

        const response = await this.transport.receive(timeout);
        const responseHeader = response.read(4);
        
        let headersMatch = true;
        for (let i = 0; i < 4; i++) {
            if (requestHeaderBytes[i] !== responseHeader[i]) {
                headersMatch = false;
                break;
            }
        }
        
    this.log(`Received response: command=${responseHeader[0]}, seqNo=${responseHeader[3]}, length=${response.size()}`);
        
        if (!headersMatch) {
            const reqHex = Array.from(requestHeaderBytes).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
            const resHex = Array.from(responseHeader).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
            throw new Error(`Header mismatch. Sent: [${reqHex}], Received: [${resHex}]`);
        }
        
        {
            const cmdName = this.commandLookup[command] || command;
            this.log(`Command ${cmdName} (${command}) executed successfully, response length: ${response.size()}`);
            // Dump response object in verbose mode; debug packages typically include toString
            this.log(response);
        }
        
        return response;
    }

    /**
     * Connect to the device and initialize it
     */
    async connect() {
        const result = await this.transport.connect();
        if (result) {
            await this.initialize();
        }
        return result;
    }

    /**
     * Initialize the device after connection
     */
    async initialize() {
        this.log('Initializing device...');
        const exchangeData = new Uint8Array([0x01, 0xff, 0x12, 0xff]);
        await this.execute(COMMAND.SET_EXCHANGE, exchangeData);
        await this.setLocalTime(new Date());

        // Reset DEVICE_TIME to 0 (matches Python device_time(0)) so timestamps align
        try {
            const payload = new ArrayBuffer(8);
            const view = new DataView(payload);
            view.setUint32(0, VSFR.DEVICE_TIME, true);
            view.setUint32(4, 0, true);
            const resp = await this.execute(COMMAND.WR_VIRT_SFR, new Uint8Array(payload));
            const retcode = resp.readUint32LE();
            if (retcode !== 1) {
                throw new Error(`DEVICE_TIME write failed with retcode ${retcode}`);
            }
            // consume any unexpected trailing bytes (firmware quirk)
            if (resp.size() !== 0) {
                console.warn(`DEVICE_TIME write returned ${resp.size()} extra byte(s), discarding`);
                while (resp.size() > 0) resp.read(1);
            }
        } catch (e) {
            console.warn('DEVICE_TIME reset failed:', e?.message || e);
        }

        this.baseTime = new Date(Date.now() + 128000); // Add 128 seconds like Python
        try {
            this.deviceTextMessage = await this.readVirtualString(VS.TEXT_MESSAGE);
        } catch (e) {
            // likely means no text message set
            this.deviceTextMessage = '';
        }
        this.log(`Device text message: ${this.deviceTextMessage}`);
        this.log('Device initialized successfully');
    }

    /**
     * Set the device's local time
     */
    async setLocalTime(date) {
        // Use the same format as Python: day, month, year-2000, 0, second, minute, hour, 0
        const timeData = new ArrayBuffer(8);
        const view = new DataView(timeData);
        
        view.setUint8(0, date.getDate());           // day
        view.setUint8(1, date.getMonth() + 1);      // month (0-based in JS, 1-based for device)
        view.setUint8(2, date.getFullYear() - 2000); // year - 2000
        view.setUint8(3, 0);                        // padding
        view.setUint8(4, date.getSeconds());        // second
        view.setUint8(5, date.getMinutes());        // minute
        view.setUint8(6, date.getHours());          // hour
        view.setUint8(7, 0);                        // padding
        
        await this.execute(COMMAND.SET_TIME, new Uint8Array(timeData));
    }
    
    /**
     * Get device firmware version
     */
    async getFirmwareVersion() {
        const response = await this.execute(COMMAND.GET_VERSION);
    
        const boot_minor = response.readUint16LE();
        const boot_major = response.readUint16LE();
        const boot_date = response.readString();
        
        const target_minor = response.readUint16LE();
        const target_major = response.readUint16LE();
        const target_date = response.readString().trim();
    
        return {
            boot: { major: boot_major, minor: boot_minor, date: boot_date },
            target: { major: target_major, minor: target_minor, date: target_date }
        };
    }

    /**
     * Get the user-facing serial number string
     */
    async getSerialNumber() {
        return await this.readVirtualString(VS.SERIAL_NUMBER);
    }

    /**
     * Get the low-level hardware serial number
     */
    async getHardwareSerialNumber() {
        const response = await this.execute(COMMAND.GET_SERIAL);
        const serialLen = response.readUint32LE();
        
        if (serialLen % 4 !== 0) {
            throw new Error(`Invalid serial length: ${serialLen}, must be divisible by 4`);
        }
        
        const serialGroups = [];
        for (let i = 0; i < serialLen / 4; i++) {
            serialGroups.push(response.readUint32LE());
        }
        
        return serialGroups.map(v => v.toString(16).toUpperCase().padStart(8, '0')).join('-');
    }

    /**
     * Generic function to read a virtual string from the device
     */
    async readVirtualString(commandId) {
        const args = new ArrayBuffer(4);
        new DataView(args).setUint32(0, commandId, true);

        const response = await this.execute(COMMAND.RD_VIRT_STRING, new Uint8Array(args));

        const retcode = response.readUint32LE();
        const flen = response.readUint32LE();

        if (retcode !== 1) {
            throw new Error(`readVirtualString for command ${commandId} failed with retcode ${retcode}`);
        }

        // Firmware workaround: sometimes there is a trailing 0x00 after payload
        let trailingNull = false;
        if (response.size() === flen + 1) {
            const peekIndex = response.position + flen;
            if (peekIndex < response.data.length && response.data[peekIndex] === 0x00) {
                trailingNull = true;
            }
        }

        const stringData = response.read(flen);
        if (trailingNull && response.size() === 1) {
            response.read(1); // consume the extra null
        }
    const decoder = new TextDecoder('ascii');
    this.log(`Read virtual string (command ${commandId}):`, stringData);
    return decoder.decode(stringData);
    }

    /**
     * Read virtual string data as raw binary (for DATA_BUF, SPECTRUM, etc.)
     */
    async readVirtualBinary(commandId) {
        const args = new ArrayBuffer(4);
        new DataView(args).setUint32(0, commandId, true);

        const response = await this.execute(COMMAND.RD_VIRT_STRING, new Uint8Array(args));

        const retcode = response.readUint32LE();
        const flen = response.readUint32LE();

        if (retcode !== 1) {
            throw new Error(`readVirtualBinary for command ${commandId} failed with retcode ${retcode}`);
        }

        // Firmware workaround: sometimes there is a trailing 0x00 after payload
        let trailingNull = false;
        if (response.size() === flen + 1) {
            const peekIndex = response.position + flen;
            if (peekIndex < response.data.length && response.data[peekIndex] === 0x00) {
                trailingNull = true;
            }
        }

        const dataBytes = response.read(flen);
        if (trailingNull && response.size() === 1) {
            response.read(1); // consume the extra null
        }
        return dataBytes;
    }

    /**
     * Get device status
     */
    async getStatus() {
        const response = await this.execute(COMMAND.GET_STATUS);
        return {
            raw: response.getBytes()
        };
    }

    /**
     * Get buffered measurement data from the device
     * @returns {Array} Array of RealTimeData, DoseRateDB, RareData, etc.
     */
    async data_buf() {
        const data = await this.readVirtualBinary(VS.DATA_BUF);
        return decodeDataBuffer(data, this.baseTime);
    }

    /**
     * Get single real-time data record from the device 
     * @returns {RealTimeData} RealTimeData
     */
    async real_time_data(tries = 10) {
        let data = await this.data_buf();
        for (const record of data) {
          if (record instanceof RealTimeData) 
            return record;
        }
        if (tries > 0) {
            await sleep(100);
            return this.real_time_data(tries - 1);
        }
        return null;
    }

    /**
     * Get current spectrum data from the device (matching Python spectrum())
     * @returns {Spectrum} Spectrum object with duration, calibration, and counts
     */
    async spectrum() {
        const data = await this.readVirtualBinary(VS.SPECTRUM);
        return decodeSpectrum(data, this.spectrumFormatVersion);
    }

    /**
     * Get accumulated spectrum data from the device
     * @returns {Spectrum} Accumulated spectrum object
     */
    async spectrum_accum() {
        const data = await this.readVirtualBinary(VS.SPEC_ACCUM);
        return decodeSpectrum(data, this.spectrumFormatVersion);
    }

    /**
     * Get energy calibration coefficients
     * @returns {Array<number>} Array of [a0, a1, a2] calibration coefficients
     */
    async energy_calib() {
        const data = await this.readVirtualBinary(VS.ENERGY_CALIB);
        const br = new BytesBuffer(data);
        return [br.readFloatLE(), br.readFloatLE(), br.readFloatLE()];
    }

    /**
     * Read multiple VSFRs in a single batch operation
     * @param {Array<number>} vsfrIds - Array of VSFR IDs to read
     * @returns {Array<number>} Array of decoded values
     */
    async batchReadVsfrs(vsfrIds) {
        const nvsfr = vsfrIds.length;
        if (nvsfr === 0) {
            throw new Error('No VSFRs specified');
        }

        // Create the batch read VSFR command payload:
        // First uint32: number of VSFRs to read
        // Followed by each VSFR ID as uint32
        const payloadSize = (1 + nvsfr) * 4;
        const payload = new ArrayBuffer(payloadSize);
        const view = new DataView(payload);
        
        view.setUint32(0, nvsfr, true); // little-endian
        for (let i = 0; i < nvsfr; i++) {
            view.setUint32((i + 1) * 4, vsfrIds[i], true);
        }

        const response = await this.execute(COMMAND.RD_VIRT_SFR_BATCH, new Uint8Array(payload));

        // First uint32 is a bitmask indicating which VSFRs were successfully read
        const validFlags = response.readUint32LE();
        const expectedFlags = (1 << nvsfr) - 1;
        
        if (validFlags !== expectedFlags) {
            const validBits = validFlags.toString(2).padStart(nvsfr, '0');
            const expectedBits = expectedFlags.toString(2).padStart(nvsfr, '0');
            throw new Error(`Unexpected validity flags, bad vsfr_id? ${validBits} != ${expectedBits}`);
        }

        // Read the remaining data as uint32 values
        const ret = [];
        for (let i = 0; i < nvsfr; i++) {
            const rawValue = response.readUint32LE();
            
            // Decode based on VSFR format - for now all are uint32 ('I' format)
            const format = VSFR_FORMATS[vsfrIds[i]];
            if (format === 'I') {
                ret.push(rawValue);
            } else {
                // Handle other formats if needed in the future
                ret.push(rawValue);
            }
        }

        if (response.size() !== 0) {
            throw new Error('Unexpected remaining data in batch VSFR response');
        }

        return ret;
    }

    /**
     * Retrieve the alarm limits configuration from the device
     * @returns {AlarmLimits} Device alarm limits configuration
     */
    async getAlarmLimits() {
        const regs = [
            VSFR.CR_LEV1_cp10s,
            VSFR.CR_LEV2_cp10s,
            VSFR.DR_LEV1_uR_h,
            VSFR.DR_LEV2_uR_h,
            VSFR.DS_LEV1_uR,
            VSFR.DS_LEV2_uR,
            VSFR.DS_UNITS,
            VSFR.CR_UNITS,
        ];

        const resp = await this.batchReadVsfrs(regs);

        const doseMultiplier = resp[6] ? 100 : 1;
        const countMultiplier = resp[7] ? 60 : 1;
        
        return new AlarmLimits(
            resp[0] / 10 * countMultiplier,    // l1_count_rate
            resp[1] / 10 * countMultiplier,    // l2_count_rate
            resp[2] / doseMultiplier,          // l1_dose_rate
            resp[3] / doseMultiplier,          // l2_dose_rate
            resp[4] / 1e6 / doseMultiplier,    // l1_dose
            resp[5] / 1e6 / doseMultiplier,    // l2_dose
            resp[6] ? 'Sv' : 'R',              // dose_unit
            resp[7] ? 'cpm' : 'cps'            // count_unit
        );
    }

    
    /**
     * Reset the current spectrum data to zero
     */
    async spectrum_reset() {
        const args = new ArrayBuffer(8);
        const view = new DataView(args);
        view.setUint32(0, VS.SPECTRUM, true);
        view.setUint32(4, 0, true);
        
        const response = await this.execute(COMMAND.WR_VIRT_STRING, new Uint8Array(args));
        const retcode = response.readUint32LE();
        
        if (retcode !== 1) {
            throw new Error(`spectrum_reset failed with retcode ${retcode}`);
        }
        
        if (response.size() !== 0) {
            throw new Error('Unexpected response data in spectrum_reset');
        }
    }

    /**
     * Get battery charge level percentage quickly.
     * Tries a fast VSFR read first; if unavailable, falls back to RareData via DATA_BUF.
     * @param {number} timeoutMs How long to wait for RareData fallback
     * @returns {Promise<number>} charge percent (0..100)
     */
    async get_charge_level(timeoutMs = 3000) {
        // Fast path: some firmware exposes charge level via VSFR.OPT (0x8028) low 16 bits (centi-percent)
        try {
            if (VSFR && typeof VSFR.OPT !== 'undefined') {
                const vals = await this.batchReadVsfrs([VSFR.OPT]);
                const raw = Array.isArray(vals) ? vals[0] : vals; // uint32
                const centi = raw & 0xFFFF;
                if (centi >= 0 && centi <= 10000) {
                    return centi / 100.0;
                }
            }
        } catch (_) {
            // Ignore and fall back
        }

        // Fallback: poll data buffer for a RareData record
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const records = await this.data_buf();
            for (const rec of records) {
                if (rec && rec.constructor && rec.constructor.name === 'RareData') {
                    // rec.charge_level is already percent in JS decoder
                    if (typeof rec.charge_level === 'number') return rec.charge_level;
                }
            }
            await sleep(150);
        }
        throw new Error('Charge level not available');
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
        await this.transport.disconnect();
    }

    /**
     * Check if connected to device
     */
    connected() {
        return this.transport.connected();
    }
}

// ============================================================================
// FACTORY AND CONVENIENCE CLASSES
// ============================================================================

/**
 * Factory function to create RadiaCode devices with different transports
 */
class RadiaCodeFactory {
    static createBluetoothDevice() {
        const transport = new RadiaCodeBluetoothTransport();
        return new RadiaCodeDevice(transport);
    }

    static createUSBDevice(serialNumber = null, timeoutMs = 3000) {
        const transport = new RadiaCodeUSBTransport(serialNumber, timeoutMs);
        return new RadiaCodeDevice(transport);
    }

    static createDevice(transport) {
        return new RadiaCodeDevice(transport);
    }

    static getAvailableTransports() {
        return {
            bluetooth: RadiaCodeBluetoothTransport.isSupported(),
            usb: RadiaCodeUSBTransport.isSupported()
        };
    }
}

/**
 * Main RadiaCode class that matches the Python API for familiar usage
 * 
 * Usage similar to Python:
 * const device = new RadiaCode();  // Uses USB by default, or specify transport
 * await device.connect();
 * 
 * const data = await device.data_buf();
 * for (const record of data) {
 *     if (record instanceof RealTimeData) {
 *         console.log(`Dose rate: ${record.dose_rate}`);
 *     }
 * }
 * 
 * const spectrum = await device.spectrum();
 * console.log(`Live time: ${spectrum.duration}s`);
 * console.log(`Total counts: ${spectrum.getTotalCounts()}`);
 */

class RadiaCode extends RadiaCodeDevice {
    constructor(transport = null, bluetoothMac = null, serialNumber = null) {
        // Create transport based on parameters or default to USB
        if (transport) {
            super(transport);
        } else if (bluetoothMac !== null) {
            // Bluetooth transport requested
            super(new RadiaCodeBluetoothTransport());
        } else {
            // Default to USB, or fallback to Bluetooth if USB not available
            if (RadiaCodeUSBTransport.isSupported()) {
                super(new RadiaCodeUSBTransport(serialNumber));
            } else if (RadiaCodeBluetoothTransport.isSupported()) {
                super(new RadiaCodeBluetoothTransport());
            } else {
                throw new Error('No supported transport available');
            }
        }
    }

    /**
     * Get firmware version (simplified format matching Python)
     */
    async fw_version() {
        const version = await this.getFirmwareVersion();
        return [
            [version.boot.major, version.boot.minor, version.boot.date],
            [version.target.major, version.target.minor, version.target.date]
        ];
    }

    /**
     * Get serial number
     */
    async serial_number() {
        return await this.getSerialNumber();
    }

    /**
     * Get hardware serial number 
     */
    async hw_serial_number() {
        return await this.getHardwareSerialNumber();
    }
}

// ============================================================================
// EXPORTS AND GLOBAL DECLARATIONS
// ============================================================================

// Node.js environment shims for Web Bluetooth and WebUSB
(function initNodeNavigatorShims() {
    try {
        const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
        if (!isNode) return;

        // Ensure a navigator object exists on globalThis
        if (typeof globalThis.navigator === 'undefined') {
            globalThis.navigator = {};
        }
        const nav = globalThis.navigator;

        // Try to attach Web Bluetooth from 'webbluetooth' if available
        if (!('bluetooth' in nav)) {
            try {
                if (typeof require === 'function') {
                    const wb = require('webbluetooth');
                    const Bluetooth = wb && (wb.Bluetooth || (wb.default && wb.default.Bluetooth));
                    if (Bluetooth) {
                        nav.bluetooth = new Bluetooth({ deviceFound: false, ignoreCache: true });
                    }
                }
            } catch (_) { /* ignore if module not installed */ }
        }

        // Try to attach WebUSB from 'usb' if available
        if (!('usb' in nav)) {
            try {
                if (typeof require === 'function') {
                    const usb = require('usb');
                    const webusb = usb && (usb.webusb || (usb.default && usb.default.webusb));
                    if (webusb) {
                        nav.usb = webusb;
                    }
                }
            } catch (_) { /* ignore if module not installed */ }
        }
    } catch (_) {
        // Ignore shim failures to keep browser-first behavior
    }
})();

// If running under Node and we created globalThis.navigator, make a local alias so references to `navigator` work
// eslint-disable-next-line no-var
if (typeof navigator === 'undefined' && typeof globalThis !== 'undefined' && globalThis.navigator) {
    // eslint-disable-next-line no-var
    var navigator = globalThis.navigator;
}

// Make classes available globally in browser environment
if (typeof window !== 'undefined') {
    // Browser environment
    window.RadiaCode = RadiaCode;
    window.RadiaCodeDevice = RadiaCodeDevice;
    window.RadiaCodeFactory = RadiaCodeFactory;
    window.RadiaCodeBluetoothTransport = RadiaCodeBluetoothTransport;
    window.RadiaCodeUSBTransport = RadiaCodeUSBTransport;
    window.RealTimeData = RealTimeData;
    window.RawData = RawData;
    window.DoseRateDB = DoseRateDB;
    window.RareData = RareData;
    window.Spectrum = Spectrum;
    window.AlarmLimits = AlarmLimits;
    window.COMMAND = COMMAND;
    window.VS = VS;
    window.VSFR = VSFR;
    window.DeviceNotFound = DeviceNotFound;
    window.ConnectionClosed = ConnectionClosed;
    window.TimeoutError = TimeoutError;
    window.MultipleUSBReadFailure = MultipleUSBReadFailure;
    // Expose library version
    window.RadiaCodeJS_VERSION = RADIACODE_JS_VERSION;
}

// Node.js export (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RadiaCode,
        RadiaCodeDevice,
        RadiaCodeFactory,
        RadiaCodeBluetoothTransport,
        RadiaCodeUSBTransport,
        RealTimeData,
        RawData,
        DoseRateDB,
        RareData,
        Spectrum,
        AlarmLimits,
        COMMAND,
        VS,
        VSFR,
        DeviceNotFound,
        ConnectionClosed,
        TimeoutError,
        MultipleUSBReadFailure,
        VERSION: RADIACODE_JS_VERSION
    };
}

// Attach version to all public classes as a static property
// (avoid class field syntax for broader compatibility)
RadiaCode.VERSION = RADIACODE_JS_VERSION;
RadiaCodeDevice.VERSION = RADIACODE_JS_VERSION;
RadiaCodeFactory.VERSION = RADIACODE_JS_VERSION;
RadiaCodeBluetoothTransport.VERSION = RADIACODE_JS_VERSION;
RadiaCodeUSBTransport.VERSION = RADIACODE_JS_VERSION;
RealTimeData.VERSION = RADIACODE_JS_VERSION;
RawData.VERSION = RADIACODE_JS_VERSION;
DoseRateDB.VERSION = RADIACODE_JS_VERSION;
RareData.VERSION = RADIACODE_JS_VERSION;
Spectrum.VERSION = RADIACODE_JS_VERSION;
AlarmLimits.VERSION = RADIACODE_JS_VERSION;
