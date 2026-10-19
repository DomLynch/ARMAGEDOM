import{matronDefeated,storyState,openingStoryPresentation}from'./opening-story.js';
// One small world-only still, held for this session. The existing Journal owns
// pause/input and the existing comms commit owns whether onboarding has happened.
export function createOpeningTransmission(s,doc=document){
 const el=id=>doc.getElementById(id),panel=el('story-transmission');if(!panel)return{pending:()=>false,captureArrival(){},firstRead(){},update(){},dispose(){}};
 let owner=null,attempted=false,still=null,step=0,active=false,queued=false,replaying=false;
 const eligible=()=>s.game&&storyState(s.game).commsRead;
 function close(){active=false;paint();el('story-replay').focus?.();}
 function paint(){panel.hidden=!active;el('story-transcript').hidden=active;el('story-replay').hidden=active||!eligible();if(!active)return;const first=step===0;el('story-transmission-label').textContent=first?(replaying?'RECORDED ARRIVAL':'MOMENTS AGO'):'SECOND TRANSMISSION';el('story-transmission-text').textContent=first?'Good. You found the shelter.':'That signal isn’t ours.';el('story-footage').hidden=!first;el('story-footage').replaceChildren(...(first&&still?[still]:[]));el('story-footage-caption').hidden=!first;el('story-footage-caption').textContent=still?'Westminster · arrival recorded':'Arrival image unavailable · transmission transcript';el('story-continue').textContent=first?'Continue':'Read Journal';}
 function show(){if(!eligible())return;replaying=true;active=true;step=0;paint();el('story-continue').focus?.();}
 function next(){if(step===0){step=1;paint();}else close();}
 el('story-continue').addEventListener('click',next);el('story-skip').addEventListener('click',close);el('story-replay').addEventListener('click',show);
 function update(){if(owner&&owner!==s.game){owner=null;still=null;attempted=false;active=false;queued=false;paint();}if(active&&doc.getElementById('menu')?.open===false)close();el('story-replay').hidden=active||!eligible();}
 function captureArrival(){update();const g=s.game,source=s.canvas;if(!queued)return;queued=false;if(attempted||!g||matronDefeated(g)||g.world.areaId!=='westminster'||s.contextLost)return;owner=g;attempted=true;
  try{if(!(source.width>0&&source.height>0))return;const copy=doc.createElement('canvas'),width=Math.min(source.width,source.height*4/3),height=width*.75;
   const p=s.world?.toRender?.(g.player.pos,1)?.project(s.camera),cx=p?(p.x+1)*source.width/2:source.width/2,cy=p?(1-p.y)*source.height/2:source.height/2,x=Math.max(0,Math.min(source.width-width,cx-width/2)),y=Math.max(0,Math.min(source.height-height,cy-height/2));
   copy.width=Math.min(384,Math.round(width));copy.height=Math.max(1,Math.round(copy.width*height/width));copy.setAttribute('role','img');copy.setAttribute('aria-label','Recorded arrival at Westminster');copy.getContext('2d').drawImage(source,x,y,width,height,0,0,copy.width,copy.height);still=copy;
  }catch{still=null;}finally{paint();}
 }
 return{captureArrival,update,pending:()=>queued,firstRead(){update();if(eligible()&&openingStoryPresentation(s.game).stage==='matron'){owner=s.game;queued=!attempted;show();replaying=false;paint();}},dispose(){queued=false;active=false;still=null;owner=null;panel.hidden=true;el('story-footage').replaceChildren();el('story-continue').removeEventListener('click',next);el('story-skip').removeEventListener('click',close);el('story-replay').removeEventListener('click',show);}};
}
