self.addEventListener("push",(event)=>{
  let data={};try{data=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification(data.title||"SolanaBubble alert",{
    body:data.body||"A watched token crossed one of your thresholds.",
    tag:data.tag||"solanabubble-alert",
    data:{url:data.url||"/watchlist"},
    icon:"/icon-192.png",
    badge:"/icon-192.png",
    renotify:true
  }));
});
self.addEventListener("notificationclick",(event)=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"/watchlist",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then((windows)=>{
    const match=windows.find((w)=>w.url===target);if(match)return match.focus();
    return clients.openWindow(target);
  }));
});
