import { CFContext } from './types';

export function playSound(
    ctx: CFContext,
    sound: string
) {
    console.log(`CF STUB: playSound(${sound})`);
}

export function stopSound(
    ctx: CFContext,
    sound: string
) {
    console.log(`CF STUB: stopSound(${sound})`);
}

export function muteSound(
    ctx: CFContext,
    sound: string
) {
    console.log(`CF STUB: muteSound(${sound})`);
}

export function unmuteSound(
    ctx: CFContext,
    sound: string
) {
    console.log(`CF STUB: unmuteSound(${sound})`);
}
