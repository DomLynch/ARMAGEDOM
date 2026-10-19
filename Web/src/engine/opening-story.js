import{closedData}from'./progression-state.js';
// The existing reward ledger, not a corpse, proves that the crossing is open.
export const storyState=g=>g.openingStory??{commsRead:false,messageRecovered:false};
export const validStory=s=>closedData(s,['commsRead','messageRecovered'])&&typeof s.commsRead==='boolean'&&typeof s.messageRecovered==='boolean';
export const matronDefeated=g=>['pending','owned','legacy-dead'].includes(g.bossEquipment?.emberProjector?.status);
export const signalText='SURVIVOR RECORD MATCHED. You were expected. The east crossing is guarded. Find the source of this transmission.';
export const matronFragment='I am keeping the crossing shut. You have no idea what could come back from the East.';
export const interceptedText='If they sent you, they’ve already found us.';
export function openingStoryPresentation(g){
 const s=storyState(g),dead=matronDefeated(g)||s.messageRecovered,east=g.world.areaId==='east'||g.expedition?.visitedIds?.includes('east');
 const stage=east?'trace':dead?'enter':s.commsRead?'matron':'safehouse';
 const objective={safehouse:'Find the Westminster safehouse.',matron:'Defeat the Ember Matron to open the east crossing.',enter:'Enter East and trace the survivor signal.',trace:'Trace the survivor signal in East.'}[stage];
 return{stage,objective,target:['enter','trace'].includes(stage)?'east':'westminster',location:stage==='safehouse'?'Safehouse · Comms terminal on the west landing':stage==='matron'?'Ember Matron · east crossing':stage==='enter'?'East crossing':'East · survivor signal',
  opening:'A survivor signal is repeating from Westminster. Reach the safehouse.',signal:s.commsRead?signalText:null,reaction:s.commsRead?'This terminal recognises me. I have never been here.':null,
  fragment:s.commsRead||dead||east?matronFragment:null,intercepted:dead?interceptedText:null,question:dead||east?'Who sent the signal—and why were they expecting me?':null};
}
