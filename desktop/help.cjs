const fs=require('node:fs');
const path=require('node:path');
const HELP_URL='campus://app/help.html';
function loadHelp(appPath){
 const source=fs.readFileSync(path.join(appPath,'使用说明.html'),'utf8');
 const links=new Set([...source.matchAll(/href="(https:\/\/[^\"]+)"/g)].map(m=>m[1]));
 // Standalone delivery links are not shipped inside the installed application.
 const html=source.replace(/<p><a href="先看这里\.html">[\s\S]*?<\/p>/,'').replace(/<a\b[^>]*href="(?!https:\/\/|#)[^\"]*"[^>]*>([\s\S]*?)<\/a>/g,'<span>$1</span>');
 return {html,links};
}
function isHelpNavigation(url){try{const u=new URL(url);return u.protocol==='campus:'&&u.hostname==='app'&&u.pathname==='/help.html'&&!u.search;}catch{return false;}}
function canOpenHelpLink(url,links){try{return new URL(url).protocol==='https:'&&links.has(url);}catch{return false;}}
module.exports={HELP_URL,loadHelp,isHelpNavigation,canOpenHelpLink};
