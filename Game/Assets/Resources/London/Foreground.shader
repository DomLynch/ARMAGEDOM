Shader "Ashvault/LondonForeground" {
 Properties { _MainTex("Foreground",2D)="white"{} _Exposure("Exposure",Float)=1 }
 SubShader { Tags {"Queue"="AlphaTest" "RenderType"="TransparentCutout"} Cull Off ZWrite On
 Pass { CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _MainTex;float _Exposure;
 struct input {float4 vertex:POSITION;float2 uv:TEXCOORD0;};
 struct output {float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};
 output vert(input v){output o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
 fixed4 frag(output i):SV_Target{fixed4 c=tex2D(_MainTex,i.uv);clip(c.a-250.0/255.0);return fixed4(c.rgb*_Exposure,1);}
 ENDCG }
 }
}
