/* Aetheric avatars: canvas renderers that react to window.AV.speak (0..1). */
(function(){
  "use strict";
  var AV=window.AV={speak:0,target:0,mode:"orb"};
  var RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
  function css(n){return getComputedStyle(document.body).getPropertyValue(n).trim()||"#3FE0FF";}
  function setup(cv){var d=Math.min(devicePixelRatio||1,2),r=cv.getBoundingClientRect();cv.width=r.width*d;cv.height=r.height*d;var x=cv.getContext("2d");x.setTransform(d,0,0,d,0,0);return{x:x,w:r.width,h:r.height};}
  // Background starfield shared by all pages
  AV.bg=function(cv){var s=setup(cv),st=[];for(var i=0;i<140;i++)st.push([Math.random()*s.w,Math.random()*s.h,Math.random()*1.4+.2,Math.random()*6]);
    addEventListener("resize",function(){s=setup(cv)});
    (function f(t){s.x.clearRect(0,0,s.w,s.h);st.forEach(function(p){var a=.35+.35*Math.sin(t/900+p[3]);s.x.fillStyle="rgba(200,230,255,"+a+")";s.x.beginPath();s.x.arc(p[0],p[1],p[2],0,7);s.x.fill();p[1]+=p[2]*.04;if(p[1]>s.h)p[1]=0;});if(!RM)requestAnimationFrame(f)})(0);};
  var R={};
  // V1 Aether: luminous plasma orb with orbiting particle halo
  R.orb=function(s,t,k){var x=s.x,cx=s.w/2,cy=s.h/2,base=s.w*.2*(1+k*.18),c1=css("--c1"),c3=css("--c3");
    var g=x.createRadialGradient(cx,cy,0,cx,cy,base*2.6);g.addColorStop(0,c1+"55");g.addColorStop(1,"transparent");x.fillStyle=g;x.fillRect(0,0,s.w,s.h);
    x.save();x.globalCompositeOperation="lighter";
    for(var L=0;L<3;L++){x.beginPath();for(var a=0;a<=Math.PI*2+.01;a+=.08){var n=Math.sin(a*3+t/600+L)*.06+Math.sin(a*5-t/420)*(.03+k*.09);var r=base*(1-L*.12)*(1+n);var px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;a?x.lineTo(px,py):x.moveTo(px,py);}
      var gg=x.createRadialGradient(cx,cy-base*.3,base*.1,cx,cy,base*1.2);gg.addColorStop(0,"#ffffff");gg.addColorStop(.35,c1);gg.addColorStop(1,c3+"00");x.fillStyle=gg;x.globalAlpha=.55-L*.12;x.fill();}
    x.globalAlpha=1;for(var i=0;i<90;i++){var an=i*2.39+t/(1400+i*9),rr=base*(1.35+.5*Math.sin(i+t/900))+k*14*Math.sin(t/90+i);x.fillStyle=i%3?c1:"#FFB347";x.globalAlpha=.5+.5*Math.sin(t/300+i);x.beginPath();x.arc(cx+Math.cos(an)*rr,cy+Math.sin(an)*rr*.82,1.3+(i%4)*.4,0,7);x.fill();}
    x.restore();};
  // V2 Halo: holographic figure built from scanlines with an audio-ring voice
  R.holo=function(s,t,k){var x=s.x,cx=s.w/2,w=s.w,h=s.h,c1=css("--c1");x.save();x.globalCompositeOperation="lighter";
    // projector base
    var by=h*.9;var g=x.createRadialGradient(cx,by,0,cx,by,w*.35);g.addColorStop(0,c1+"88");g.addColorStop(1,"transparent");x.fillStyle=g;x.beginPath();x.ellipse(cx,by,w*.32,h*.05,0,0,7);x.fill();
    var cone=x.createLinearGradient(0,by,0,h*.1);cone.addColorStop(0,c1+"40");cone.addColorStop(1,"transparent");x.fillStyle=cone;x.beginPath();x.moveTo(cx-w*.3,by);x.lineTo(cx-w*.12,h*.08);x.lineTo(cx+w*.12,h*.08);x.lineTo(cx+w*.3,by);x.fill();
    // silhouette (head + shoulders) drawn as horizontal scanlines
    for(var y=h*.16;y<h*.84;y+=3){var hw;var hy=h*.33,hr=h*.14;if(y<hy+hr){var dy=(y-hy)/hr;hw=Math.abs(dy)<1?Math.sqrt(1-dy*dy)*hr*.82:0;}else if(y<h*.53){hw=hr*.38;}else{var u=(y-h*.53)/(h*.31);hw=hr*(.4+1.6*Math.sqrt(u));}
      if(!hw)continue;var j=(Math.random()<.02?(Math.random()-.5)*14:0)+Math.sin(y/9+t/200)*1.2;x.globalAlpha=.25+.35*Math.abs(Math.sin(y/14-t/300));x.fillStyle=c1;x.fillRect(cx-hw+j,y,hw*2,1.4);}
    // eyes + voice rings
    x.globalAlpha=.9;x.fillStyle="#fff";[-1,1].forEach(function(d){x.beginPath();x.ellipse(cx+d*h*.045,h*.32,5,2+k*1.5,0,0,7);x.fill();});
    for(var r=0;r<4;r++){var ph=(t/700+r/4)%1;x.globalAlpha=(1-ph)*(.15+k*.8);x.strokeStyle=c1;x.lineWidth=2;x.beginPath();x.arc(cx,h*.41,h*.05+ph*h*.3*(.4+k),0,7);x.stroke();}
    // equalizer mouth
    for(var b=-5;b<=5;b++){var bh=2+k*14*Math.abs(Math.sin(t/80+b*1.7));x.globalAlpha=.9;x.fillRect(cx+b*5-1.5,h*.4-bh/2,3,bh);}
    x.restore();};
  // V3 Lyra: constellation of stars whose lines pulse as she speaks
  var P3=null;
  R.constellation=function(s,t,k){var x=s.x,cx=s.w/2,cy=s.h/2,c1=css("--c1"),c2=css("--c2");
    if(!P3){P3=[];for(var i=0;i<42;i++){var a=i*2.39996,r=Math.sqrt(i/42)*s.w*.38;P3.push({a:a,r:r,z:Math.random()});}}
    x.save();x.globalCompositeOperation="lighter";var pts=P3.map(function(p,i){var a=p.a+t/(9000+p.z*6000);var rr=p.r*(1+k*.12*Math.sin(t/120+i));return[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*.9,p.z];});
    for(var i=0;i<pts.length;i++)for(var j=i+1;j<pts.length;j++){var dx=pts[i][0]-pts[j][0],dy=pts[i][1]-pts[j][1],d=Math.sqrt(dx*dx+dy*dy);if(d<s.w*.16){x.globalAlpha=(1-d/(s.w*.16))*(.25+k*.6);x.strokeStyle=(i+j)%5?c1:c2;x.lineWidth=.8;x.beginPath();x.moveTo(pts[i][0],pts[i][1]);x.lineTo(pts[j][0],pts[j][1]);x.stroke();}}
    pts.forEach(function(p,i){var tw=.6+.4*Math.sin(t/250+i*3)+k*.5;var g=x.createRadialGradient(p[0],p[1],0,p[0],p[1],6+tw*6);g.addColorStop(0,"#fff");g.addColorStop(.3,i%4?c1:c2);g.addColorStop(1,"transparent");x.globalAlpha=Math.min(1,tw);x.fillStyle=g;x.beginPath();x.arc(p[0],p[1],6+tw*6,0,7);x.fill();});
    var core=x.createRadialGradient(cx,cy,0,cx,cy,s.w*.12*(1+k*.5));core.addColorStop(0,"#ffffffcc");core.addColorStop(.4,c1+"66");core.addColorStop(1,"transparent");x.globalAlpha=1;x.fillStyle=core;x.beginPath();x.arc(cx,cy,s.w*.2,0,7);x.fill();x.restore();};
  AV.start=function(cv,mode){var s=setup(cv);addEventListener("resize",function(){s=setup(cv)});
    (function f(t){AV.speak+=(AV.target-AV.speak)*.12;var k=AV.speak*(.6+.4*Math.abs(Math.sin(t/110)));s.x.clearRect(0,0,s.w,s.h);R[mode](s,RM?0:t,k);requestAnimationFrame(f);})(0);};
})();
