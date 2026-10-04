// Selected donor cues only; metadata is pinned in public/audio/manifest.json.
export function donorCues(events) {
  const impacts=[],air=[];
  for(const event of events) {
    const heavy=event.moveId==='heavy_overhead'||event.action==='heavy';
    if(event.type==='hit'&&!event.blocked&&event.amount!==0)impacts.push({name:heavy?'hit_heavy':'hit_flesh',gain:.3});
    else if(event.type==='parry')impacts.push({name:'parry',gain:1});
    else if(event.type==='block')impacts.push({name:'block',gain:1});
    else if(event.type==='guard-break')impacts.push({name:'guard_break',gain:1});
    else if(event.type==='attack'||event.type==='enemy-attack')air.push({name:heavy?'whoosh_heavy':'whoosh_light',gain:heavy?.18:.12});
    else if(event.type==='dodge')air.push({name:'roll',gain:.12});
  }
  return [...impacts,...air];
}
export function createDonorAudio({baseUrl=globalThis.document?.baseURI}={}) {
  let context=null,enabled=true,buffer=null,manifest=null,loading=null,aborter=null,generation=0,error=null;
  const active=new Set(),lastVariants=new Map();
  function stop() {
    generation++;aborter?.abort();
    for(const voice of active){try{voice.source.stop();}catch{}voice.source.disconnect();voice.gain.disconnect();}
    active.clear();
  }
  async function load() {
    const token=generation;aborter=new AbortController();const signal=aborter.signal;
    const url=new URL('audio/manifest.json',baseUrl),response=await fetch(url,{signal});
    if(!response.ok)throw Error(`Donor audio manifest HTTP ${response.status}`);
    const next=await response.json(),audio=await fetch(new URL(next.url,url),{signal});
    if(!audio.ok)throw Error(`Donor audio HTTP ${audio.status}`);
    const decoded=await context.decodeAudioData(await audio.arrayBuffer());
    if(token!==generation||signal.aborted)return false;
    manifest=next;buffer=decoded;return true;
  }
  return {
    get state(){return {ready:!!buffer,context:context?.state??'locked',enabled,activeVoices:active.size,error};},
    async unlock() {
      const token=generation;
      try {
        context??=new(globalThis.AudioContext||globalThis.webkitAudioContext)();
        // Resume directly within the gesture call, before awaiting network/decode.
        await context.resume();if(token!==generation)return false;
        if(!buffer){loading??=load().finally(()=>{loading=null;});if(!await loading)return false;}
        error=null;return token===generation&&context.state==='running';
      }catch(e){if(e.name!=='AbortError')error=e.message;return false;}
    },
    play(events) {
      if(!enabled||!buffer||context?.state!=='running')return;
      for(const cue of donorCues(events)) {
        const variants=manifest.cues[cue.name];if(!variants?.length)continue;
        // Rotate existing takes without repeating the preceding take; no new sound/pitch layers.
        const index=((lastVariants.get(cue.name)??-1)+1)%variants.length;lastVariants.set(cue.name,index);
        const [offset,duration]=variants[index],source=context.createBufferSource(),gain=context.createGain();
        source.buffer=buffer;gain.gain.value=cue.gain;source.connect(gain);gain.connect(context.destination);
        const voice={source,gain};active.add(voice);
        source.onended=()=>{active.delete(voice);source.disconnect();gain.disconnect();};source.start(context.currentTime,offset,duration);
      }
    },
    setEnabled(value){enabled=!!value;if(!enabled)stop();},
    pause(){stop();return context?.suspend();},
    reset(){stop();lastVariants.clear();},
    dispose(){stop();buffer=null;manifest=null;return context?.close();}
  };
}
