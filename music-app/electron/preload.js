const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    invoke: (channel, data) => {
        // Whitelist channels
        const validChannels = ['get-drives', 'rip-cd', 'auth-login', 'auth-register', 'auth-me', 'library-get', 'library-add', 'dashboard-stats', 'system-status'];
        if (validChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
        return Promise.reject(new Error(`Invalid channel: ${channel}`));
    }
});
