const {contextBridge,ipcRenderer}=require('electron');
const methods=['importLink','retryLink','openSource','openHelp','snapshot','importText','importBinary','selectFiles','readMaterial','extract','saveDraft','deleteDraft','deleteDrafts','previewDraft','confirm','saveEvent','saveSemester','previewSeries','saveSeries','deleteSeries','saveSettings','saveSecrets','testModel','testMail','retryReminder','backup','restore','clearData'];
contextBridge.exposeInMainWorld('campus',Object.freeze(Object.fromEntries(methods.map(name=>[name,(payload)=>ipcRenderer.invoke('campus:'+name,payload)]))));
