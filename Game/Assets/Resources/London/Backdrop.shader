Shader "Ashvault/LondonBackdrop" {
 Properties { _MainTex ("Image", 2D) = "white" {} _Exposure ("Exposure", Float) = 1 }
 SubShader { Tags { "Queue"="Background" "RenderType"="Opaque" } Cull Off ZWrite Off ZTest Always
 Pass { CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _MainTex; float _Exposure;
 fixed4 frag(v2f_img i):SV_Target { return fixed4(tex2D(_MainTex,i.uv).rgb*_Exposure,1); }
 ENDCG } }
}
