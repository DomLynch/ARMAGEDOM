// Only the selected original-rat Stab/Heavy gets the existing low pose.
// Preserve action authority/cadence. This pose is explicitly retimed, NOT 1x.
export function ratMeleeDefinition(action,base,low,{rig}={}){
 const move=action==='stab'?'thrust':action==='heavy'?'heavy_overhead':null;
 const total=low?.windupTicks+low?.activeTicks+low?.recoveryTicks;
 if(rig!=='original-rat'||!move||base?.moveId!==move||low?.clip!=='RatLowSlash'
     ||low.ratLow!==true||!Number.isFinite(total)||total<=0)return base;
 return {...base,clip:low.clip,path:null,native:false,ratLow:true,ratRetimed:true,
   sourceContact:low.windupTicks/total,lowLastActive:(low.windupTicks+low.activeTicks)/total,
   lowActiveEnd:(low.windupTicks+low.activeTicks)/total};
}

// Same phase for actual rendered pose and contact metadata. Fractional bake
// endpoints are NOT used: caller captures the actual posed WeaponDrawn blade.
export function ratMeleePosePhase(swing,phaseSampler){
 if(!swing?.def?.ratRetimed)return phaseSampler(swing.ageTicks,swing.timing,swing.sourceContact);
 if(swing.clip!=='RatLowSlash'||swing.native!==false||typeof phaseSampler!=='function')
   throw Error('Retimed rat melee requires its displayed low-pose sampler');
 const{windup,active,recovery}=swing.timing,age=swing.ageTicks,start=swing.sourceContact,
   last=swing.def.lowLastActive,end=swing.def.lowActiveEnd;
 if(!Number.isFinite(age)||![windup,active,recovery].every(n=>Number.isFinite(n)&&n>0)
     ||!Number.isFinite(start)||!Number.isFinite(last)||!Number.isFinite(end)
     ||start<=0||last<start||last>end||end>=1)
   throw Error('Invalid rat low-pose timing');
 const phase=age<windup?age/windup*start:age<windup+active
   ?active===1?start:start+Math.min(1,(age-windup)/(active-1))*(last-start)
   :end+(age-windup-active)/recovery*(1-end);
 return Math.max(0,Math.min(1,phase));
}
