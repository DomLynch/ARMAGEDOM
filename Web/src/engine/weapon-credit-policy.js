// Exact registered attribution policies, not new proficiency families.
export const WEAPON_CREDIT_DESCRIPTORS=Object.freeze({
 'bridge-warden-rifle-v1':Object.freeze({id:'bridge-warden-rifle-v1',creditPolicy:'none'}),
 knife:Object.freeze({id:'knife',creditPolicy:'mastery'}),
 'westminster-start-pistol-v1':Object.freeze({id:'westminster-start-pistol-v1',creditPolicy:'mastery'}),
 'flamethrower-area8-v1':Object.freeze({id:'flamethrower-area8-v1',creditPolicy:'none'}),
});
export function deathWeaponDescriptor(id){
 return typeof id==='string'&&Object.hasOwn(WEAPON_CREDIT_DESCRIPTORS,id)?WEAPON_CREDIT_DESCRIPTORS[id]:null;
}
