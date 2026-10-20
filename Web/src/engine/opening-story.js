import{closedData}from'./progression-state.js';
export const storyState=g=>g.openingStory??{commsRead:false,bountyStage:0};
export const validStory=s=>closedData(s,['commsRead','bountyStage'])&&typeof s.commsRead==='boolean'&&Number.isInteger(s.bountyStage)&&s.bountyStage>=0&&s.bountyStage<=2&&(s.bountyStage<2||s.commsRead);
// Boss and equipment ledgers retain local crossing authority, independently of the bounty.
export const matronDefeated=g=>['pending','owned','legacy-dead'].includes(g.bossEquipment?.emberProjector?.status);
export const bountyValue=g=>[250,400,750][storyState(g).bountyStage];
export function openingStoryPresentation(g){
 const s=storyState(g),stage=s.bountyStage===2?'broadcast':s.commsRead?'leave':!g.pistol?.collected?'pistol':'safehouse';
 const inEast=g.world.areaId==='east'||g.expedition?.visitedIds?.includes('east');
 const objective={pistol:'Collect the pistol by the bus.',safehouse:'Find the Westminster safehouse.',leave:'Leave the shelter.',broadcast:inEast?'Trace the drone’s broadcast in East.':'Reach East. Trace the drone’s broadcast.'}[stage];
 return{stage,objective,bounty:bountyValue(g),target:stage==='broadcast'?'east':'westminster',location:stage==='pistol'?'Westminster · pistol stash':stage==='safehouse'?'Safehouse · west landing':stage==='leave'?'Shelter exit':'East · drone broadcast',
  opening:'Shelter · comms terminal on the west landing.',signal:s.commsRead?`LIVE BOUNTY — £${bountyValue(g)}`:null,reaction:s.commsRead?'The drone’s instructions are outgoing messages. Someone is receiving them.':null,
  conflict:s.commsRead?'DRONE · OUTGOING: “You’ll need that.”\nDRONE · OUTGOING: “Leave the terminal alone. Nothing useful there.”':null,
  warning:s.bountyStage===2?'DRONE · OUTGOING: “Location confirmed.”':null,fragment:null,intercepted:null,question:s.commsRead?'Who is controlling the drone?':null};
}
