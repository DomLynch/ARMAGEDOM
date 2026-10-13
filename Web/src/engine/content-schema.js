// Pure schema helpers shared by content validators; no runtime dependencies.
const fail=()=>{throw Error('Invalid registered area content');};
const object=x=>x&&Object.getPrototypeOf(x)===Object.prototype;
export function closed(x,fields,optional=[]){if(!object(x)||Object.keys(x).some(k=>!fields.includes(k)&&!optional.includes(k))||fields.some(k=>!Object.hasOwn(x,k)))fail();}
export function freeze(x){if(x&&typeof x==='object'){for(const child of Object.values(x))freeze(child);Object.freeze(x);}return x;}
