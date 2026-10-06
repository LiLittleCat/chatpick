// Fill each URL after its listing is published. Empty URLs render button placeholders.
export const stores = [
  { id: 'chrome', browser: 'Chrome', logo: 'chrome.svg', name: 'Chrome Web Store', url: 'https://chromewebstore.google.com/detail/chatpick-%E2%80%94-find-your-way/kojmnadbjhoiecplakmbdmoedgfkkfie', env: 'CHATPICK_CHROME_STORE_URL', host: 'chromewebstore.google.com', path: /^\/detail\/.+/ },
  { id: 'firefox', browser: 'Firefox', logo: 'firefox.webp', name: 'Firefox Add-ons', url: '', env: 'CHATPICK_FIREFOX_STORE_URL', host: 'addons.mozilla.org', path: /^\/(?:[a-zA-Z-]+\/)?firefox\/addon\/.+/ },
  { id: 'edge', browser: 'Edge', logo: 'edge.webp', name: 'Edge Add-ons', url: '', env: 'CHATPICK_EDGE_STORE_URL', host: 'microsoftedge.microsoft.com', path: /^\/addons\/detail\/.+/ },
];
