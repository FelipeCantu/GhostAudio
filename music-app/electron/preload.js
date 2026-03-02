const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        // Whitelist channels
        const validChannels = ['get-drives', 'rip-cd', 'cancel-rip', 'auth-login', 'auth-register', 'auth-me', 'library-get', 'library-delete', 'library-add', 'dashboard-stats', 'system-status', 'get-cd-metadata', 'import-local-files', 'playlist-get-all', 'playlist-get-one', 'playlist-create', 'playlist-update', 'playlist-delete', 'playlist-add-items', 'playlist-remove-item', 'playlist-refresh'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
        return Promise.reject(new Error(`Invalid channel: ${channel}`));
    },
    on: (channel, callback) => {
        // Whitelist channels for receiving events
        const validChannels = ['rip-progress'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    removeAllListeners: (channel) => {
        const validChannels = ['rip-progress'];
        if (validChannels.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        }
    }
});
