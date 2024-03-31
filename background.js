chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({'url': 'bench.html'});
});
