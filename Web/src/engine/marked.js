import {closed,freeze} from './content-schema.js';
import {LOCKER_RESOURCE_RULES} from './locker-state.js';
export const MARKED_DEFAULTS=freeze({version:1,cashPerKill:100,bossCash:200,maxMoney:1000000000,hunterBounty:300,maxHunters:1,hostileBudget:6,minSpawnDistance:8,warningSeconds:2,spawnCooldown:30,arrivalDelay:6,hunterHealth:80,hunterSpeed:3.2,shop:{pistol:{price:100,amount:6},rifle:{price:150,amount:4},dressing:{price:100,amount:25}}});
export function validateMarkedData(input){
 if(input===undefined)return null;closed(input,Object.keys(MARKED_DEFAULTS));
 for(const key of Object.keys(MARKED_DEFAULTS).filter(k=>k!=='shop'))if(!Number.isFinite(input[key])||input[key]<=0)throw TypeError('Invalid Marked rule');
 if(input.version!==1||input.maxHunters!==1||input.hostileBudget!==6||input.maxMoney>1e9||!Number.isSafeInteger(input.maxMoney)||input.minSpawnDistance<8||input.warningSeconds<2||input.spawnCooldown<30||input.arrivalDelay<6||input.hunterHealth>120||input.hunterSpeed>4)throw TypeError('Invalid bounded Marked rules');
 for(const k of ['cashPerKill','bossCash','hunterBounty'])if(!Number.isSafeInteger(input[k]))throw TypeError('Integer cash required');
 closed(input.shop,['pistol','rifle','dressing']);for(const row of Object.values(input.shop)){closed(row,['price','amount']);if(!Number.isSafeInteger(row.price)||row.price<=0||!Number.isSafeInteger(row.amount)||row.amount<=0)throw TypeError('Invalid Marked shop');}
 return freeze(structuredClone(input));
}
export const freshMarked=()=>({version:1,carried:0,bank:0,bounty:0});
export function validMarked(s,max=MARKED_DEFAULTS.maxMoney){try{closed(s,['version','carried','bank','bounty']);return s.version===1&&['carried','bank','bounty'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=max);}catch{return false;}}
export function copyMarked(s){if(!validMarked(s))throw TypeError('Invalid Marked state');return{...s};}
export function markedShopEligible(g,id){const row=g.world?.markedData?.shop[id];if(!row||!(g.marked?.bank>=row.price))return false;if(id==='pistol')return!!g.pistol?.collected&&g.pistol.reserve+row.amount<=LOCKER_RESOURCE_RULES['pistol-reserve'].carryCap;if(id==='rifle')return g.rifle?.status==='owned'&&g.rifle.reserve+row.amount<=LOCKER_RESOURCE_RULES['rifle-reserve'].carryCap;return id==='dressing'&&g.player.hp>0&&g.player.hp<g.player.maxHP;}
