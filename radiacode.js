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
        return 'bluetooth' in navigator;
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
        const value = new Uint8Array(event.target.value.buffer);
        
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
        // Default endpoint numbers - will be updated during connection
        this.endpointOut = 1;    // Default write endpoint (without direction bit)
        this.endpointIn = 1;     // Default read endpoint (without direction bit) 
    }

    static isSupported() {
        return 'usb' in navigator;
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

            // Find the correct endpoints from the interface descriptor
            const alternate = this.interface.alternates[0];
            console.log('Interface configuration:', {
                interfaceNumber: this.interface.interfaceNumber,
                alternateCount: this.interface.alternates.length,
                endpoints: alternate.endpoints.map(ep => ({
                    endpointNumber: ep.endpointNumber,
                    direction: ep.direction,
                    type: ep.type,
                    packetSize: ep.packetSize
                }))
            });
            
            // Find OUT endpoint (for writing to device)
            const outEndpoint = alternate.endpoints.find(ep => ep.direction === 'out');
            if (outEndpoint) {
                this.endpointOut = outEndpoint.endpointNumber;
                console.log('Found OUT endpoint:', this.endpointOut);
            } else {
                console.warn('No OUT endpoint found, using default 1');
                this.endpointOut = 1;
            }
            
            // Find IN endpoint (for reading from device)  
            const inEndpoint = alternate.endpoints.find(ep => ep.direction === 'in');
            if (inEndpoint) {
                this.endpointIn = inEndpoint.endpointNumber;
                console.log('Found IN endpoint:', this.endpointIn);
            } else {
                console.warn('No IN endpoint found, using default 1');
                this.endpointIn = 1;
            }

            await this.clearPendingData();

            // Add a small delay to ensure device is ready
            await new Promise(resolve => setTimeout(resolve, 50));

            this.isConnected = true;
            console.log('RadiaCode USB device connected successfully');
            return true;

        } catch (error) {
            console.error('USB connection failed:', error);
            throw new DeviceNotFound(`Failed to connect to RadiaCode USB device: ${error.message}`);
        }
    }

    async clearPendingData() {
        console.log(`Clearing pending data from USB device...`);
        let clearedBytes = 0;
        
        try {
            while (true) {
                // Use a very short timeout (100ms) like Python implementation
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), 100)
                );
                
                const transferPromise = this.device.transferIn(this.endpointIn, 256);
                
                try {
                    const result = await Promise.race([transferPromise, timeoutPromise]);
                    
                    if (result.status !== 'ok') {
                        console.log('USB transfer not OK, stopping clear operation');
                        break;
                    }
                    
                    if (result.data.byteLength > 0) {
                        clearedBytes += result.data.byteLength;
                        console.log(`Cleared ${result.data.byteLength} bytes (total: ${clearedBytes})`);
                    } else {
                        // Empty response, keep trying until timeout
                        console.log('Empty response, continuing...');
                    }
                } catch (timeoutError) {
                    // Timeout is expected - it means no more data is available
                    break;
                }
            }
        } catch (error) {
            // Any other error should also stop the clearing process
            console.log(`Clear operation ended with error: ${error.message}`);
        }
        
        console.log(`Finished clearing pending data (total: ${clearedBytes} bytes cleared)`);
    }

    async send(data) {
        if (!this.isConnected) throw new ConnectionClosed('Device not connected');
        if (this.isClosing) throw new ConnectionClosed('Connection is closing');

        try {
            console.log(`Sending ${data.byteLength} bytes to endpoint ${this.endpointOut}:`, Array.from(new Uint8Array(data)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            const result = await this.device.transferOut(this.endpointOut, data);
            
            if (result.status !== 'ok') {
                throw new Error(`USB transfer failed: ${result.status}`);
            }
            console.log(`Successfully sent ${result.bytesWritten} bytes`);
            
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
            const maxTrials = 3;
            let trials = 0;
            let initialData;

            // Create a timeout promise for the entire operation
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new TimeoutError(`USB read timeout after ${timeout}ms`)), timeout)
            );

            while (trials < maxTrials) {
                try {
                    console.log(`Attempting to read from endpoint ${this.endpointIn}, trial ${trials + 1}`);
                    
                    // Race the USB transfer against the timeout
                    const transferPromise = this.device.transferIn(this.endpointIn, 256);
                    const result = await Promise.race([transferPromise, timeoutPromise]);
                    
                    if (result.status !== 'ok') {
                        throw new Error(`USB transfer failed: ${result.status}`);
                    }

                    initialData = new Uint8Array(result.data.buffer);
                    console.log(`Received ${initialData.length} bytes on trial ${trials + 1}`);
                    
                    if (initialData.length > 0) {
                        break;
                    } else {
                        trials++;
                        // Add a small delay before retrying
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                } catch (error) {
                    console.error(`Trial ${trials + 1} failed:`, error);
                    trials++;
                    if (trials >= maxTrials) {
                        throw error;
                    }
                    // Add a small delay before retrying
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            if (trials >= maxTrials) {
                throw new Error(`${trials} USB Read Failures in sequence`);
            }

            if (initialData.length < 4) {
                throw new Error('USB response too short - missing length header');
            }

            const dataView = new DataView(initialData.buffer, 0, 4);
            const responseLength = dataView.getUint32(0, true);
            console.log(`Expected response length: ${responseLength}`);
            
            let responseData = initialData.slice(4);

            while (responseData.length < responseLength) {
                const remainingBytes = responseLength - responseData.length;
                console.log(`Reading additional ${remainingBytes} bytes...`);
                
                const transferPromise = this.device.transferIn(this.endpointIn, remainingBytes);
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

            console.log(`Successfully received complete response: ${responseData.length} bytes`);
            return new BytesBuffer(responseData);

        } catch (error) {
            console.error('USB receive error:', error);
            throw new Error(`Failed to receive USB data: ${error.message}`);
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
                dose_rate,
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
            
            ret.push(new RareData(
                dt,
                duration,
                dose,
                (temperature - 2000) / 100,
                charge_level / 100,
                flags
            ));
        } else {
            // Skip unknown data types
            console.warn(`Unknown data type: eid=${eid}, gid=${gid}`);
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
        this.debug = true;
        this.baseTime = new Date();
        this.spectrumFormatVersion = 1;
        
        this.commandLookup = {};
        for (const [key, value] of Object.entries(COMMAND)) {
            this.commandLookup[value] = key;
        }
    }

    /**
     * Execute a command on the device
     */
    async execute(command, args = null, timeout = 10000) {
        if (this.debug) {
            const cmdName = this.commandLookup[command] || command;
            console.log(`Executing command: ${cmdName}, args: ${args ? args.length : 0} bytes`);
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

        if (this.debug) {
            console.log(`Sending request: command=${command}, seqNo=${reqSeqNo}, argsLength=${argsBytes.length}`);
        }
        
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
        
        if (this.debug) {
            console.log(`Received response: command=${responseHeader[0]}, seqNo=${responseHeader[3]}, length=${response.size()}`);
        }
        
        if (!headersMatch) {
            const reqHex = Array.from(requestHeaderBytes).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
            const resHex = Array.from(responseHeader).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
            throw new Error(`Header mismatch. Sent: [${reqHex}], Received: [${resHex}]`);
        }
        
        if (this.debug) {
            console.log(`Command ${command} executed successfully, response length: ${response.size()}`);
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
        console.log('Initializing device...');
        const exchangeData = new Uint8Array([0x01, 0xff, 0x12, 0xff]);
        await this.execute(COMMAND.SET_EXCHANGE, exchangeData);
        await this.setLocalTime(new Date());
        this.baseTime = new Date(Date.now() + 128000); // Add 128 seconds like Python
        console.log('Device initialized successfully');
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
        
        const stringData = response.read(flen);
        const decoder = new TextDecoder('ascii');
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
        
        return response.read(flen);
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
     * Get buffered measurement data from the device (matching Python data_buf())
     * @returns {Array} Array of RealTimeData, DoseRateDB, RareData, etc.
     */
    async data_buf() {
        const data = await this.readVirtualBinary(VS.DATA_BUF);
        return decodeDataBuffer(data, this.baseTime);
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
     * Get serial number (matching Python method name)
     */
    async serial_number() {
        return await this.getSerialNumber();
    }

    /**
     * Get hardware serial number (matching Python method name)
     */
    async hw_serial_number() {
        return await this.getHardwareSerialNumber();
    }
}

// ============================================================================
// EXPORTS AND GLOBAL DECLARATIONS
// ============================================================================

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
    window.COMMAND = COMMAND;
    window.VS = VS;
    window.DeviceNotFound = DeviceNotFound;
    window.ConnectionClosed = ConnectionClosed;
    window.TimeoutError = TimeoutError;
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
        COMMAND,
        VS,
        DeviceNotFound,
        ConnectionClosed,
        TimeoutError
    };
}
