Shader "Ashvault/LondonContact" {
 SubShader { Tags { "Queue"="Transparent" "RenderType"="Transparent" } Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
 Pass { CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment frag
 #include "UnityCG.cginc"
 fixed4 frag(v2f_img i):SV_Target { float d=length((i.uv-.5)*2); return fixed4(.04,.025,.015,saturate(1-d)*.65); }
 ENDCG } }
}
