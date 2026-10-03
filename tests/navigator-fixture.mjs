// Standalone MAIN-world suites supply the initial settings normally sent by the
// extension's isolated content script. Full-extension tests use the real bridge.
export function navigatorFixture(source) {
  return source + '\nwindow.postMessage({source:"chatpick:extension",type:"settings",settings:{}},location.origin);';
}
