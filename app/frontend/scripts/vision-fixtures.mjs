export const identity={dx:0,dy:0,rotation:0,scale:1};
// Independent analytic inverse rendering: fixture never calls implementation transform/warp.
export function fixture(w,h,t=identity,{darts=[],light=0,scene=0,flat=false,hand=false,mirror=false,blur=false}={}){
 const data=new Uint8ClampedArray(w*h*4),cx=(w-1)/2,cy=(h-1)/2,c=Math.cos(t.rotation),sn=Math.sin(t.rotation);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let rx=cx+t.scale*(c*(x-cx)-sn*(y-cy))+t.dx,ry=cy+t.scale*(sn*(x-cx)+c*(y-cy))+t.dy;
  if(mirror)rx=w-rx;
  let value=flat?120:120+(blur?5:32)*Math.sin(rx*.13+ry*.017+scene)+(blur?5:29)*Math.cos(ry*.117-rx*.013+scene*2)+(blur?3:17)*Math.sin(rx*.057+ry*.078+scene*3);
  for(const d of darts)if(Math.abs(rx-d.x)<3&&ry>d.y&&ry<d.y+60)value=12;
  if(hand&&rx>w*.26&&rx<w*.75&&ry>h*.26&&ry<h*.75)value=210;
  const k=(y*w+x)*4;data[k]=data[k+1]=data[k+2]=value+light;data[k+3]=255;
 }
 return {width:w,height:h,data};
}
