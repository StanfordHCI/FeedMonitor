let Globals = {
    alive_interval: 10000,
    user_id: null,
    server_url: "https://youronlineservice.com"
}

const isDevMode = !('update_url' in chrome.runtime.getManifest());
if (isDevMode) {
    Globals['server_url'] = "http://localhost:5000"
}

