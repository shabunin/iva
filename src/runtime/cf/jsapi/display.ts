import { CFContext } from './types';

export function flipToPage(
    ctx: CFContext,
    pageName: string
) {
    if (ctx.renderer) {
        ctx.renderer.navigate(pageName);
    }
}
