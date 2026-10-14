/**
 * @agapi/cf-runtime — CommandFusion / iViewer GUI runtime.
 *
 * Depends on @agapi/stdlib (net/dgram/http). Host must call installStdlib()
 * before loadProject() if systems need real sockets.
 */

export { parseGUI, parseCSS, parseThemeName, parseGenericNode } from './parser';
export type {
  CFProject,
  CFProperties,
  CFTheme,
  CFPage,
  CFSubpage,
  CFNode,
} from './parser';

export { CFRenderer, stopAllAnimations } from './renderer';
export { CFAPI } from './cf';
export { joinStore, normalizeJoinString } from './joinStore';
export { TokenEngine } from './tokenEngine';
export type { TokenContext } from './tokenEngine';
export { ControlSystem, runMacroByName, stopMacroByName } from './systemManager';

export { loadProject } from './loadProject';
export type {
  LoadProjectOptions,
  LoadProjectResult,
  LoadProjectMenuOptions,
  Orientation,
} from './loadProject';

export { RuntimeMenu } from './chrome/runtimeMenu';
export type {
  RuntimeMenuHost,
  RuntimeMenuOptions,
  RuntimeMenuPlacement,
} from './chrome/runtimeMenu';

export { EVENTS, CONSTANTS } from './jsapi/constants';
export type { CFContext, CFCallback, Watcher } from './jsapi/types';
