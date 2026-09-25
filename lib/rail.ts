/**
 * Where the desktop rail keeps whether it was left collapsed, and the line of
 * script that puts that choice on <html> before the first paint.
 *
 * The rail and PageShell both mount per page. When they read the stored
 * choice from an effect, a collapsed rail opened to 232px on every navigation
 * and the page slid back after it. Written as `data-rail` ahead of the page,
 * --rail in globals.css is already right when the first frame is drawn.
 * Kept apart from DesktopRail so the root layout's bootstrap does not pull
 * the rail itself into every bundle.
 */
export const RAIL_COLLAPSED_KEY = 'akada.rail.collapsed';

export const RAIL_BOOTSTRAP_SCRIPT = `(function(){try{if(window.localStorage.getItem(${JSON.stringify(
  RAIL_COLLAPSED_KEY,
)})==='true')document.documentElement.setAttribute('data-rail','narrow');}catch(e){}})();`;

/** Put the choice on <html>, where the stylesheet reads it. */
export function writeRailAttribute(collapsed: boolean): void {
  if (collapsed) document.documentElement.setAttribute('data-rail', 'narrow');
  else document.documentElement.removeAttribute('data-rail');
}
