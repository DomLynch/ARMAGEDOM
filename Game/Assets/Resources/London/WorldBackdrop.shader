Shader "Ashvault/LondonWorldBackdrop" {
 Properties { _MainTex("Image",2D)="white"{} _Exposure("Exposure",Float)=1 }
 SubShader { Tags {"Queue"="Background" "RenderType"="Opaque"} Cull Off ZWrite Off ZTest Always
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _MainTex,_PrevTex,_NextTex;
 float _Exposure,_SeamWidth,_HasPrev,_HasNext;
 float4 _PrevEdge,_NextEdge;
 struct input {float4 vertex:POSITION;float2 uv:TEXCOORD0;float2 canvas:TEXCOORD1;};
 struct output {float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;float x:TEXCOORD1;};
 output vert(input v){output o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;o.x=v.canvas.x;return o;}
 float inverseEdge(float x,float4 e){return x<e.z?x*e.x/e.z:x>e.w?e.y+(x-e.w)*(1-e.y)/(1-e.w):e.x+(x-e.z)*(e.y-e.x)/(e.w-e.z);}
 fixed4 frag(output i):SV_Target{
  float3 color=tex2D(_MainTex,i.uv).rgb;
  if(_SeamWidth>0){
   if(_HasPrev>0&&i.uv.y>1-_SeamWidth)color=lerp(color,tex2D(_PrevTex,float2(inverseEdge(i.x,_PrevEdge),0)).rgb,.5*saturate((i.uv.y-1+_SeamWidth)/_SeamWidth));
   if(_HasNext>0&&i.uv.y<_SeamWidth)color=lerp(color,tex2D(_NextTex,float2(inverseEdge(i.x,_NextEdge),1)).rgb,.5*saturate(1-i.uv.y/_SeamWidth));
  }
  return fixed4(color*_Exposure,1);
 }
 ENDCG }
 }
}
