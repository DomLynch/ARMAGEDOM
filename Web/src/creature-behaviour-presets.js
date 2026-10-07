// Per-resident parameter preparation only. No AI clock, targeting or movement.
const preset=(speedFactor,recoveryAdd,attackPattern)=>Object.freeze({speedFactor,recoveryAdd,
 ...(attackPattern?{attackPattern:Object.freeze(attackPattern)}:{})});
export const CREATURE_BEHAVIOURS=Object.freeze({
 baseline:preset(1,0),cautious:preset(.85,.15),brisk:preset(1.1,0),
 'gaunt-thrust':preset(1,0,['stab']),'stocky-heavy':preset(.85,.15,['heavy']),
});
export const RECIPE_BEHAVIOURS=Object.freeze({
 'human-street-scavenger':'baseline','human-crooked-hollow':'baseline',
 'human-gaunt-skulker':'gaunt-thrust','human-stocky-brute':'stocky-heavy',
 'human-ragged-runner':'brisk','human-wounded-straggler':'cautious','human-scarred-veteran':'cautious',
 'rat-sewer':'baseline','rat-ash':'brisk','rat-heavy':'cautious',
 'dog-street-mongrel':'baseline','dog-ash-coated':'baseline','dog-stocky-yard':'cautious',
 'roach-sewer':'baseline','roach-ash':'baseline','roach-rust-shell':'baseline','roach-heavy-shell':'cautious',
});
export function resolveCreatureBehaviour(name,foundation){
 const p=Object.hasOwn(CREATURE_BEHAVIOURS,name)?CREATURE_BEHAVIOURS[name]:null;
 if(!p)throw Error('Unknown creature behaviour');
 const moveSpeed=foundation?.moveSpeed*p.speedFactor,recoveryDelay=(foundation?.recoveryDelay??0)+p.recoveryAdd;
 if(!Number.isFinite(moveSpeed)||moveSpeed<.1||moveSpeed>6||!Number.isFinite(recoveryDelay)||recoveryDelay<0||recoveryDelay>5)throw Error('Invalid creature behaviour tuning');
 if(p.attackPattern&&(foundation.weapon!=='knife'||!Array.isArray(foundation.supportedActions)||!p.attackPattern.every(action=>foundation.supportedActions.includes(action))))throw Error('Unsupported native attack pattern');
 return Object.freeze({moveSpeed,recoveryDelay,...(p.attackPattern?{attackPattern:Object.freeze([...p.attackPattern])}:{})});
}
