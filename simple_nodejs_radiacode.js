const { RadiaCode } = require('./radiacode');

(async () => {
    try {
        let device = new RadiaCode(null, true);
        await device.connect();
        const version = await device.fw_version();
        const serial = await device.serial_number();
        console.log(version);
        console.log(serial);
        let poll = setInterval(async () => {
            const r = await device.real_time_data()
            console.log(r)
        }, 1000)
        
        const cleanup = async () => {
            clearInterval(poll);
            try { await device.disconnect(); } catch {}
            process.exit(0);
        };
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
  } catch (e) {
    console.error('Connect failed:', e.message);
    process.exit(1);
  }
})();
