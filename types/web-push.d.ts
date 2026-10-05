declare module "web-push" {
  type Subscription={endpoint:string;keys:{p256dh:string;auth:string}};
  const api:{
    setVapidDetails(subject:string,publicKey:string,privateKey:string):void;
    sendNotification(subscription:Subscription,payload?:string,options?:{TTL?:number;urgency?:"very-low"|"low"|"normal"|"high"}):Promise<unknown>;
  };
  export default api;
}
