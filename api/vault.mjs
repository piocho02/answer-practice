import pg from 'pg';
import {Store} from '../server/store.mjs';
import {createHandler} from '../server/handler.mjs';
let handler;
export default {async fetch(req){try{
 if(process.env.VAULT_ENABLED!=='true')return Response.json({error:'보관함이 아직 활성화되지 않았습니다.'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!handler){const url=new URL(process.env.DATABASE_URL);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);const pool=new pg.Pool({connectionString:url.toString(),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true,...(process.env.DB_CA_CERT?{ca:process.env.DB_CA_CERT}:{})}});pool.on('error',()=>{});handler=createHandler(new Store(pool),{origin:process.env.APP_ORIGIN,passwordHash:process.env.VAULT_PASSWORD_HASH,epoch:Number(process.env.VAULT_AUTH_EPOCH),rateKey:process.env.VAULT_RATE_KEY});}
 const url=new URL(req.url),route=url.searchParams.get('vaultRoute');if(route!==null){url.pathname='/api/vault/'+route;url.searchParams.delete('vaultRoute');req=new Request(url,req);}return await handler(req);
 }catch{return Response.json({error:'서버 설정을 확인해야 합니다.'},{status:503,headers:{'Cache-Control':'no-store'}});}}};
