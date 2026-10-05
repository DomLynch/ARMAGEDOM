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
  let context=null,enabled=true,buffer=null,manifest=null,loading=null,aborter=null,generation=0,error=null,mode='high',noiseBuffer=null,output=null,played=0,shotEvents=0,hitEvents=0,killEvents=0;
  const active=new Set(),lastVariants=new Map();
  function stop() {
    generation++;aborter?.abort();loading=null;
    for(const voice of active){try{voice.source.stop();}catch{}voice.cleanup();}
    active.clear();
  }
  const effectiveMode=()=>mode==='off'?'off':mode==='high'&&!(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false)?'high':'low';
  function emit(source,duration,volume,filter=null,offset=null){
    if(active.size>=16){source.disconnect();filter?.disconnect();return;}
    if(!output){output=context.createGain();output.gain.value=.65;output.connect(context.destination);}
    const gain=context.createGain(),at=context.currentTime;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume*(effectiveMode()==='low'?.4:1),at+.002);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter??gain);if(filter)filter.connect(gain);gain.connect(output);let ended=false;const voice={source,gain,filter,cleanup(){if(ended)return;ended=true;source.onended=null;active.delete(voice);source.disconnect();filter?.disconnect();gain.disconnect();}};active.add(voice);played++;
    source.onended=voice.cleanup;
    if(offset===null){source.start(at);source.stop(at+duration+.01);}else source.start(at,offset,duration);
  }
  function tone(from,to,duration,gain,type='triangle'){if(active.size>=16)return;const source=context.createOscillator();source.type=type;source.frequency.setValueAtTime(from,context.currentTime);source.frequency.exponentialRampToValueAtTime(to,context.currentTime+duration);emit(source,duration,gain);}
  function noise(duration,gain,frequency){if(active.size>=16)return;if(!noiseBuffer){noiseBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.16),context.sampleRate);const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}const source=context.createBufferSource(),filter=context.createBiquadFilter();source.buffer=noiseBuffer;filter.type='highpass';filter.frequency.value=frequency;emit(source,duration,gain,filter);}
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
    get state(){return {ready:!!buffer,context:context?.state??'locked',enabled,activeVoices:active.size,voiceCapacity:16,mode:effectiveMode(),played,shotEvents,hitEvents,killEvents,noiseCached:!!noiseBuffer,error};},
    async unlock() {
      const token=generation;
      try {
        context??=new(globalThis.AudioContext||globalThis.webkitAudioContext)();
        // Resume directly within the gesture call, before awaiting network/decode.
        await context.resume();if(token!==generation)return false;
        if(!buffer){
          if(!loading){
            // An aborted decode can finish after the next gesture starts a load.
            const pending=load().finally(()=>{if(loading===pending)loading=null;});
            loading=pending;
          }
          if(!await loading)return false;
        }
        error=null;return token===generation&&context.state==='running';
      }catch(e){if(token===generation&&e.name!=='AbortError')error=e.message;return false;}
    },
    play(events) {
      if(!enabled||!buffer||context?.state!=='running')return;
      const killed=new Set(events.filter(e=>e.type==='death').map(e=>e.actor?.id)),off=effectiveMode()==='off';
      for(const event of events){
        if(event.type==='shot'){shotEvents++;tone(off?240:220,off?55:48,off?.08:.11,off?.085:.22);if(!off)noise(.065,.15,900);}
        else if(event.type==='pickup')tone(660,880,.16,.025,'sine');
        else if(event.type==='hit'&&!event.blocked&&event.amount>0&&event.weapon==='pistol'){const lethal=killed.has(event.actor?.id);hitEvents++;if(lethal)killEvents++;if(off)tone(lethal?1450:1000,lethal?550:800,lethal?.09:.035,.062,'sine');else{tone(lethal?160:280,lethal?55:130,lethal?.14:.065,.16);noise(lethal?.085:.03,.1,1700);if(lethal)tone(1000,1500,.09,.065,'sine');}}
      }
      for(const cue of donorCues(events.filter(e=>e.weapon!=='pistol'))) {
        const variants=manifest.cues[cue.name];if(!variants?.length)continue;
        // Rotate existing takes without repeating the preceding take; no new sound/pitch layers.
        const index=((lastVariants.get(cue.name)??-1)+1)%variants.length;lastVariants.set(cue.name,index);
        if(active.size>=16)continue;const [offset,duration]=variants[index],source=context.createBufferSource();source.buffer=buffer;emit(source,duration,cue.gain,null,offset);
      }
    },
    setMode(value){mode=['high','low','off'].includes(value)?value:'low';stop();},
    setEnabled(value){enabled=!!value;if(!enabled)stop();},
    pause(){stop();return context?.suspend();},
    reset(){stop();lastVariants.clear();},
    dispose(){stop();buffer=noiseBuffer=null;manifest=null;output?.disconnect();output=null;return context?.close();}
  };
}
