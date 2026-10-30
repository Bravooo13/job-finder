// On Job Finder's own pages: tells the page the helper is installed, and lets
// the Apply page start Auto apply right away instead of within half a minute.
(() => {
  document.documentElement.dataset.jobFinderHelper = chrome.runtime.getManifest().version;
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.jobFinderHelper !== "start-auto-apply") return;
    chrome.runtime.sendMessage({ type: "jf:auto-kick" });
  });
})();
