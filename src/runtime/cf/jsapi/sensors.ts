import { CFContext, CFCallback } from './types';

export function startMonitoring(
    ctx: CFContext,
    sensor: string,
    options: any,
    callback?: CFCallback
) {
    console.log(`CF STUB: startMonitoring(${sensor}, ${JSON.stringify(options)})`);
    if (callback) {
        callback(sensor, options);
    }
}

export function stopMonitoring(
    ctx: CFContext,
    monitorID: string
) {
    console.log(`CF STUB: stopMonitoring(${monitorID})`);
}
