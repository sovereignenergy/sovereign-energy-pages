/* Shared helpers: lead POST (same payload shape as ../assets/form.js), session handoff, consent text. */
(function(){"use strict";
var C=window.LP_CONFIG||{};
var S=window.SE={};
S.CONSENT="By checking this box, I agree that Sovereign Energy and its representatives may contact me at the number and email provided, including by calls and texts that use automated technology, AI-generated or prerecorded voices, about solar and energy services. Consent is not a condition of purchase. Message and data rates may apply. Message frequency varies. Reply STOP to opt out. See our Privacy Policy and Terms.";
S.get=function(){try{return JSON.parse(sessionStorage.getItem("se_closer")||"{}")}catch(e){return{}}};
S.set=function(o){var v=Object.assign(S.get(),o);try{sessionStorage.setItem("se_closer",JSON.stringify(v))}catch(e){}return v};
S.utm=function(){var p=new URLSearchParams(location.search),o={};["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(function(k){if(p.get(k))o[k]=p.get(k)});return o};
S.post=async function(data){
  var payload=Object.assign({brand:C.BRAND||"Sovereign",page_url:location.href.split("?")[0],referrer:document.referrer||"",user_agent:navigator.userAgent,submitted_at:new Date().toISOString()},data);
  if(!C.ENDPOINT){console.warn("[ai closer] demo mode",payload);return true;}
  var r=await fetch(C.ENDPOINT,{method:"POST",mode:C.NO_CORS===false?"cors":"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
  if(r.type!=="opaque"&&!r.ok)throw new Error("HTTP "+r.status);return true;};
// Step 1 form
S.landing=function(slug,next){var f=document.querySelector("form[data-optin]");if(!f)return;var t0=Date.now();
  var ph=f.querySelector("[name=phone]");ph.addEventListener("input",function(){var d=ph.value.replace(/\D/g,"");if(d.length===11&&d[0]==="1")d=d.slice(1);d=d.slice(0,10);ph.value=d.length>6?"("+d.slice(0,3)+") "+d.slice(3,6)+"-"+d.slice(6):d.length>3?"("+d.slice(0,3)+") "+d.slice(3):d;});
  f.addEventListener("submit",async function(e){e.preventDefault();var err=f.querySelector(".err"),v={};new FormData(f).forEach(function(x,k){v[k]=String(x).trim()});
    var m="";if(!v.first_name)m="Please enter your first name.";else if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email||""))m="Enter a valid email.";else if(!/^(?:\+?1[\s.\-]?)?\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-]?(\d{4})$/.test(v.phone||""))m="Enter a valid 10-digit US mobile number.";else if(!/^\d{5}$/.test(v.zip||""))m="Enter a 5-digit ZIP.";else if(!f.consent_tcpa.checked)m="Please check the box to agree to be contacted.";
    err.textContent=m;if(m)return;var b=f.querySelector("button");b.disabled=true;b.textContent="Opening channel…";
    var lead={first_name:v.first_name,email:v.email,phone:v.phone,zip:v.zip,address:v.zip,consent_tcpa:true,consent_text:S.CONSENT,consent_timestamp:new Date().toISOString(),consent_marketing_email:false,utm:S.utm(),funnel_version:slug};
    S.set({lead:lead,slug:slug});
    if(!v.company_website&&Date.now()-t0>1500){try{await S.post(Object.assign({},lead,{page_type:"ai_closer_optin",page_slug:slug,notes:"Step 1 opt-in; AI analyst conversation pending"}));}catch(x){console.error(x)}}
    location.href=next;});};
})();
